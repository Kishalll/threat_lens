import { getKey } from "./secureKeyService";
import axios, { AxiosError } from "axios";

const BREACH_DIRECTORY_DEFAULT_COOLDOWN_MS = 60_000;
let breachDirectoryRateLimitedUntil = 0;
let xposedRateLimitedUntil = 0;

export type BreachApiItem = {
  id: string;
  name: string;
  domain: string;
  date: string;
  description: string;
  dataClasses: string[];
  source: "XposedOrNot" | "BreachDirectory";
};

function isRateLimitError(error: unknown): error is AxiosError {
  return axios.isAxiosError(error) && error.response?.status === 429;
}

function isNotFoundError(error: unknown): error is AxiosError {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

function getRetryAfterMs(error: AxiosError): number {
  const retryHeader = error.response?.headers?.["retry-after"];
  if (typeof retryHeader === "string") {
    const retrySeconds = Number(retryHeader);
    if (!Number.isNaN(retrySeconds) && retrySeconds > 0) {
      return Math.max(Math.ceil(retrySeconds * 1000), BREACH_DIRECTORY_DEFAULT_COOLDOWN_MS);
    }
  }

  const retryMatch = error.message.match(/retry in\s+([\d.]+)s/i);
  if (retryMatch?.[1]) {
    const retrySeconds = Number(retryMatch[1]);
    if (!Number.isNaN(retrySeconds) && retrySeconds > 0) {
      return Math.max(Math.ceil(retrySeconds * 1000), BREACH_DIRECTORY_DEFAULT_COOLDOWN_MS);
    }
  }

  return BREACH_DIRECTORY_DEFAULT_COOLDOWN_MS;
}

export async function checkEmailWithXposedOrNot(email: string): Promise<BreachApiItem[]> {
  try {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return [];

    if (Date.now() < xposedRateLimitedUntil) {
      return [];
    }

    // The PRD specify check-email but xposedornot typically uses /v1/breaches to get names, 
    // or /v1/breach-analytics for full details. 
    // Using breach-analytics as it provides the most comprehensive data in one call
    const response = await axios.get(`https://xposedornot.com/api/v1/breach-analytics/${encodeURIComponent(trimmedEmail)}`);
    
    if (response.status !== 200 || !response.data || !response.data.BreachesSummary) {
      return [];
    }

    const { ExposedBreaches } = response.data;
    if (!ExposedBreaches) return [];

    // Map according to our interface
    return ExposedBreaches.map((breach: any) => ({
      id: breach.breachID || breach.breaches_details?.[0]?.breach || Math.random().toString(),
      name: breach.breaches_details?.[0]?.breach || "Unknown Breach",
      domain: breach.breaches_details?.[0]?.domain || "Unknown Domain",
      date: breach.breaches_details?.[0]?.date || new Date().toISOString(),
      description: breach.breaches_details?.[0]?.description || "Your email was found in a data breach.",
      dataClasses: breach.breaches_details?.[0]?.xposed_data?.split(";") || ["Email"],
      source: "XposedOrNot",
    }));
  } catch (error) {
    if (isNotFoundError(error)) {
      // XposedOrNot returns 404 when no breach data is found for an email.
      return [];
    }

    if (isRateLimitError(error)) {
      const cooldownMs = getRetryAfterMs(error);
      xposedRateLimitedUntil = Date.now() + cooldownMs;
      console.warn(`XposedOrNot rate limited (429). Backing off for ${Math.ceil(cooldownMs / 1000)}s.`);
      return [];
    }

    console.error("XposedOrNot API Error", error);
    return [];
  }
}

export async function checkWithBreachDirectory(identifier: string): Promise<BreachApiItem[]> {
  try {
    const trimmed = identifier.trim();
    if (!trimmed) return [];

    if (Date.now() < breachDirectoryRateLimitedUntil) {
      return [];
    }

    const rapidApiKey = await getKey("RAPID_API_KEY");
    if (!rapidApiKey) {
      console.warn("No RapidAPI key set for BreachDirectory");
      return [];
    }

    const response = await axios.get(`https://breachdirectory.p.rapidapi.com/`, {
      params: { func: "auto", term: trimmed },
      headers: {
        "x-rapidapi-key": rapidApiKey,
        "x-rapidapi-host": "breachdirectory.p.rapidapi.com"
      }
    });

    if (response.status !== 200 || !response.data || !response.data.result) {
      return [];
    }

    return response.data.result.map((breach: any) => ({
      id: breach.hash || Math.random().toString(),
      name: breach.sources?.[0] || "Found in Database",
      domain: "Multiple/Unknown",
      date: breach.date || new Date().toISOString(),
      description: "This identifier was found in a compiled list of database dumps on BreachDirectory.",
      dataClasses: breach.passwords?.length > 0 ? ["Password"] : ["Unknown"],
      source: "BreachDirectory",
    }));

  } catch (error) {
    if (isRateLimitError(error)) {
      const cooldownMs = getRetryAfterMs(error);
      breachDirectoryRateLimitedUntil = Date.now() + cooldownMs;
      console.warn(`BreachDirectory rate limited (429). Backing off for ${Math.ceil(cooldownMs / 1000)}s.`);
      return [];
    }

    console.error("BreachDirectory API Error", error);
    return [];
  }
}

export async function checkAllCredentials(emailOrUsernames: string[]): Promise<BreachApiItem[]> {
  const allBreaches: BreachApiItem[] = [];
  const normalizedInputs = Array.from(
    new Set(emailOrUsernames.map((item) => item.trim()).filter((item) => item.length > 0))
  );
  
  for (const item of normalizedInputs) {
    const isEmail = item.includes("@");
    
    if (isEmail) {
      const xoResults = await checkEmailWithXposedOrNot(item);
      allBreaches.push(...xoResults);
      // Fallback
      if (xoResults.length === 0) {
        const bdResults = await checkWithBreachDirectory(item);
        allBreaches.push(...bdResults);
      }
    } else {
      // Username -> use BreachDirectory
      const bdResults = await checkWithBreachDirectory(item);
      allBreaches.push(...bdResults);
    }
  }

  // Deduplicate by ID
  const map = new Map<string, BreachApiItem>();
  for (const b of allBreaches) {
    if (!map.has(b.id)) map.set(b.id, b);
  }

  return Array.from(map.values());
}