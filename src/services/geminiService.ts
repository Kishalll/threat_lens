import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getKey } from "./secureKeyService";
import type { ScanResult } from "../types";

const GEMINI_MODEL_CANDIDATES = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-2.5-flash",
  "gemini-1.5-pro",
];

const MODEL_BACKOFF_DEFAULT_MS = 60_000;
const MODEL_BACKOFF_DAILY_QUOTA_MS = 6 * 60 * 60 * 1000;
const modelCooldownUntil = new Map<string, number>();

const GEMINI_SYSTEM_PROMPT = `SYSTEM: You are a cybersecurity expert specialising in consumer fraud detection. Focus on the Indian context (UPI scams, OTP fraud, KYC phishing).

Respond ONLY with valid JSON — no markdown, no text outside the JSON object.

Classification policy:
- SAFE for normal personal conversation (greetings, friendly invitations, casual chat) with no clear threat indicators.
- Do not label a message as SCAM/PHISHING without concrete indicators like credential theft attempt, OTP request, account verification pressure, suspicious links/domains, payment demand, or impersonation urgency.
- Messages such as "hi", "hello", "come to play", "are you free", "let's meet" are usually SAFE unless combined with malicious indicators.

Schema:
{
  "classification": "SAFE|SPAM|SCAM|PHISHING",
  "confidence": 0-100,
  "explanation": "max 3 sentences plain English",
  "red_flags": ["specific suspicious elements"],
  "suggested_actions": ["actionable steps"]
}`;

const SUSPICIOUS_SIGNAL_PATTERNS: RegExp[] = [
  /https?:\/\//i,
  /bit\.ly|tinyurl|t\.co|shorturl/i,
  /otp|one[-\s]?time\s?password/i,
  /kyc|verify\s+account|account\s+suspended|reactivate/i,
  /bank|upi|card|cvv|pin|password/i,
  /click\s+here|urgent|immediately|act\s+now/i,
  /pay|payment|transfer|send\s+money|refund/i,
  /lottery|prize|winner|gift\s?card/i,
];

const CASUAL_SAFE_PATTERNS: RegExp[] = [
  /^(hi|hii|hello|hey|yo)[!.\s]*$/i,
  /^how are you[?.!\s]*$/i,
  /^are you free[?.!\s]*$/i,
  /^(come|let'?s)\s+(to\s+)?play[!.\s]*$/i,
  /^let'?s\s+meet[!.\s]*$/i,
  /^good\s+(morning|afternoon|evening|night)[!.\s]*$/i,
];

async function getGeminiClient() {
  // 1. Try to get key from process.env (Loaded from your .env file)
  let apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

  // 2. Fallback to SecureStore if not in env
  if (!apiKey) {
    apiKey = await getKey("GEMINI_API_KEY");
  }

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not found. Please add EXPO_PUBLIC_GEMINI_API_KEY to your .env file.");
  }

  return new GoogleGenerativeAI(apiKey);
}

function isModelUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("404") ||
    message.includes("is not found") ||
    message.includes("not supported for generatecontent")
  );
}

function isQuotaOrRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("429") ||
    message.includes("quota exceeded") ||
    message.includes("rate limit") ||
    message.includes("retry in")
  );
}

function isCompromisedOrInvalidKeyError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("api key was reported as leaked") ||
    message.includes("invalid api key") ||
    message.includes("permission denied") ||
    message.includes("403")
  );
}

function canTryNextModel(error: unknown): boolean {
  return isModelUnavailableError(error) || isQuotaOrRateLimitError(error);
}

function extractRetryAfterMs(message: string): number {
  const retryInMatch = message.match(/retry in\s+([\d.]+)s/i);
  if (retryInMatch?.[1]) {
    const seconds = Number(retryInMatch[1]);
    if (!Number.isNaN(seconds) && seconds > 0) {
      return Math.ceil(seconds * 1000);
    }
  }

  const retryDelayMatch = message.match(/retrydelay\":\"([\d.]+)s/i);
  if (retryDelayMatch?.[1]) {
    const seconds = Number(retryDelayMatch[1]);
    if (!Number.isNaN(seconds) && seconds > 0) {
      return Math.ceil(seconds * 1000);
    }
  }

  return 0;
}

function isDailyModelQuotaError(message: string): boolean {
  return /generaterequestsperdayperprojectpermodel/i.test(message);
}

function applyModelBackoff(modelName: string, error: unknown): void {
  if (!(error instanceof Error)) {
    return;
  }

  const rawMessage = error.message;
  const retryAfterMs = extractRetryAfterMs(rawMessage);
  const backoffMs = isDailyModelQuotaError(rawMessage)
    ? Math.max(retryAfterMs, MODEL_BACKOFF_DAILY_QUOTA_MS)
    : Math.max(retryAfterMs, MODEL_BACKOFF_DEFAULT_MS);

  modelCooldownUntil.set(modelName, Date.now() + backoffMs);
}

function getCandidateModelsByAvailability(): string[] {
  const now = Date.now();

  return [...GEMINI_MODEL_CANDIDATES].sort((a, b) => {
    const aReadyAt = modelCooldownUntil.get(a) ?? 0;
    const bReadyAt = modelCooldownUntil.get(b) ?? 0;
    const aIsReady = aReadyAt <= now ? 0 : 1;
    const bIsReady = bReadyAt <= now ? 0 : 1;

    if (aIsReady !== bIsReady) {
      return aIsReady - bIsReady;
    }

    return aReadyAt - bReadyAt;
  });
}

function getClassifyFallbackExplanation(error: unknown): string {
  if (isCompromisedOrInvalidKeyError(error)) {
    return "Gemini API key is invalid or flagged. Set a new EXPO_PUBLIC_GEMINI_API_KEY and restart the app.";
  }
  if (isQuotaOrRateLimitError(error)) {
    return "AI quota exceeded right now. Please retry shortly or update your Gemini API key/billing.";
  }
  return "Unable to analyse message at this time.";
}

function getBreachFallbackGuidance(error: unknown): string {
  if (isCompromisedOrInvalidKeyError(error)) {
    return "- AI guidance unavailable because Gemini API key is invalid/flagged\n- Add a new API key and restart the app\n- In the meantime: change passwords, enable 2FA, and monitor suspicious logins";
  }
  if (isQuotaOrRateLimitError(error)) {
    return "- AI guidance is temporarily unavailable due to quota limits\n- Change passwords for affected accounts\n- Enable 2FA and watch for phishing attempts";
  }
  return "- Change passwords for affected accounts\n- Enable 2FA\n- Watch for phishing attempts";
}

function normalizeClassification(value: unknown): ScanResult["classification"] {
  if (value === "SAFE" || value === "SPAM" || value === "SCAM" || value === "PHISHING") {
    return value;
  }
  return "SAFE";
}

function normalizeConfidence(value: unknown): number {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return 0;
  }
  if (numeric < 0) {
    return 0;
  }
  if (numeric > 100) {
    return 100;
  }
  return numeric;
}

function extractJsonCandidate(rawText: string): string {
  const trimmed = rawText.trim();

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch && fencedMatch[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim();
  }

  // Remove common wrapper characters (e.g., accidental leading backticks/quotes)
  return trimmed.replace(/^[`'"\uFEFF\s]+|[`'"\s]+$/g, "").trim();
}

function parseGeminiJsonResponse(rawText: string): {
  classification?: unknown;
  confidence?: unknown;
  explanation?: unknown;
  red_flags?: unknown;
  redFlags?: unknown;
  suggested_actions?: unknown;
  suggestedActions?: unknown;
} {
  const candidates = [rawText.trim(), extractJsonCandidate(rawText)];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as {
          classification?: unknown;
          confidence?: unknown;
          explanation?: unknown;
          red_flags?: unknown;
          redFlags?: unknown;
          suggested_actions?: unknown;
          suggestedActions?: unknown;
        };
      }
    } catch {
      // Try next candidate.
    }
  }

  throw new SyntaxError("Unable to parse valid JSON object from Gemini response");
}

async function generateWithGemini(prompt: string): Promise<string> {
  const genAI = await getGeminiClient();
  let lastError: unknown = null;
  const now = Date.now();
  let skippedDueToCooldown = 0;

  for (const modelName of getCandidateModelsByAvailability()) {
    const readyAt = modelCooldownUntil.get(modelName) ?? 0;
    if (readyAt > now) {
      skippedDueToCooldown += 1;
      continue;
    }

    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      lastError = error;
      applyModelBackoff(modelName, error);
      if (canTryNextModel(error)) {
        continue;
      }
      throw error;
    }
  }

  if (lastError == null && skippedDueToCooldown > 0) {
    throw new Error("All Gemini models are temporarily rate-limited. Please retry shortly.");
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error("No supported Gemini model is available for generateContent.");
}

function fallbackScanResult(text: string, explanation: string): ScanResult {
  return {
    id: uuidv4(),
    timestamp: Date.now(),
    classification: "SAFE",
    confidence: 0,
    messagePreview: text.slice(0, 100),
    redFlags: [],
    suggestedActions: [],
    explanation,
  };
}

function normalizeMessageText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function countSuspiciousSignals(text: string): number {
  let count = 0;
  for (const pattern of SUSPICIOUS_SIGNAL_PATTERNS) {
    if (pattern.test(text)) {
      count += 1;
    }
  }
  return count;
}

function isLikelyCasualSafeMessage(text: string): boolean {
  const normalized = normalizeMessageText(text);
  if (!normalized) {
    return false;
  }

  const wordCount = normalized.split(" ").filter(Boolean).length;
  if (wordCount > 7) {
    return false;
  }

  return CASUAL_SAFE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function applyClassificationGuardrails(text: string, result: ScanResult): ScanResult {
  const normalizedText = normalizeMessageText(text);
  const suspiciousSignals = countSuspiciousSignals(normalizedText);
  const casualSafe = isLikelyCasualSafeMessage(normalizedText);

  // Guardrail: short, casual chat with zero threat indicators should not be flagged.
  if (casualSafe && suspiciousSignals === 0 && result.classification !== "SAFE") {
    return {
      ...result,
      classification: "SAFE",
      confidence: Math.max(75, result.confidence),
      redFlags: [],
      explanation: "Likely normal conversation with no clear scam indicators.",
      suggestedActions: ["No immediate action needed."],
    };
  }

  // Guardrail: avoid high-severity labels when no scam signals are present.
  if (
    suspiciousSignals === 0 &&
    (result.classification === "SCAM" || result.classification === "PHISHING")
  ) {
    return {
      ...result,
      classification: "SPAM",
      confidence: Math.min(result.confidence, 55),
      redFlags: [],
      explanation: "No strong phishing or scam signals were detected in this message.",
      suggestedActions: ["Treat with caution only if sender is unknown."],
    };
  }

  return result;
}

export async function classifyMessage(text: string): Promise<ScanResult> {
  try {
    // Explicitly ask for JSON Output within the prompt and settings if possible
    const prompt = `${GEMINI_SYSTEM_PROMPT}\n\nUSER Message to Analyse:\n${text}`;
    const responseText = await generateWithGemini(prompt);

    const parsed = parseGeminiJsonResponse(responseText);
    const parsedRedFlags = parsed.red_flags ?? parsed.redFlags;
    const parsedSuggestedActions = parsed.suggested_actions ?? parsed.suggestedActions;
    
    const aiResult: ScanResult = {
      id: uuidv4(),
      timestamp: Date.now(),
      classification: normalizeClassification(parsed.classification),
      confidence: normalizeConfidence(parsed.confidence),
      messagePreview: text.slice(0, 100),
      redFlags: Array.isArray(parsedRedFlags) ? parsedRedFlags.filter((v) => typeof v === "string") : [],
      suggestedActions: Array.isArray(parsedSuggestedActions) ? parsedSuggestedActions.filter((v) => typeof v === "string") : [],
      explanation: typeof parsed.explanation === "string" ? parsed.explanation : "No explanation provided.",
    };

    return applyClassificationGuardrails(text, aiResult);
  } catch (error) {
    if (isCompromisedOrInvalidKeyError(error) || isQuotaOrRateLimitError(error)) {
      console.warn("classifyMessage degraded", error);
    } else {
      console.error("classifyMessage failed", error);
    }

    const reason = getClassifyFallbackExplanation(error);
    throw new Error(`${reason} Please try again.`);
  }
}

export async function classifyWithRetry(text: string, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await classifyMessage(text);
    } catch (err: any) {
      if (err?.message?.includes("503")) {
        console.log("🔁 Retrying Gemini...");
        await new Promise(res => setTimeout(res, 2000));
      } else {
        throw err;
      }
    }
  }

  throw new Error("Failed after retries");
}

export async function generateBreachGuidance(breachMetadata: object): Promise<string> {
  try {
    const prompt = `You are a cybersecurity assistant. The user's information was found in a data breach with these details: ${JSON.stringify(breachMetadata)}. 
    
    Provide a concise, 3-point plain English explanation and recovery checklist. Do not output markdown, just plain text with simple bullet points (-).`;

    const responseText = await generateWithGemini(prompt);
    return responseText.trim();
  } catch (error) {
    if (isCompromisedOrInvalidKeyError(error) || isQuotaOrRateLimitError(error)) {
      console.warn("generateBreachGuidance degraded", error);
    } else {
      console.error("generateBreachGuidance failed", error);
    }
    return getBreachFallbackGuidance(error);
  }
}