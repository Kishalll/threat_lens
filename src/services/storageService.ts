import { v4 as uuidv4 } from 'uuid';
import * as SQLite from "expo-sqlite";

import { DB_INIT_STATEMENTS } from "../constants/db";
import type { BreachRecord, Credential, ScanResult, WatermarkLog } from "../types";

const DATABASE_NAME = "threatlens.db";
const DEBUG = false;

let dbInstance: SQLite.SQLiteDatabase | null = null;
let dbInitializationPromise: Promise<void> | null = null;

type CredentialRow = {
  id: string;
  type: "email" | "username";
  value: string;
  addedAt: number;
};

type BreachRow = {
  id: string;
  credentialId: string;
  breachName: string;
  date: string;
  dataTypes: string;
  severity: "low" | "medium" | "high" | "critical";
  seen: number;
  geminiGuidance: string | null;
};

type ScanResultRow = {
  id: string;
  timestamp: number;
  classification: "SAFE" | "SPAM" | "SCAM" | "PHISHING";
  confidence: number;
  messagePreview: string;
  redFlags: string;
  suggestedActions: string;
  explanation: string;
};

type WatermarkLogRow = {
  id: string;
  originalFilename: string;
  uuid: string;
  timestamp: number;
};

export function safeJsonParse<T>(value: string): T | [] {
  try {
    return JSON.parse(value) as T;
  } catch {
    return [];
  }
}

export function safeJsonStringify(value: any): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "[]";
  }
}

function toStringArray(value: string): string[] {
  const parsed = safeJsonParse<unknown>(value);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter((item): item is string => typeof item === "string");
}

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  try {
    dbInstance = await SQLite.openDatabaseAsync(DATABASE_NAME);
    return dbInstance;
  } catch (error: unknown) {
    const typedError =
      error instanceof Error ? error : new Error("Unknown database open error");
    // if (DEBUG) console.error("SQLite open error", typedError);
    void typedError;
    throw new Error("Database initialization failed");
  }
}

export async function initDatabase(): Promise<void> {
  try {
    const db = await getDatabase();
    for (const statement of DB_INIT_STATEMENTS) {
      await db.execAsync(statement);
    }
  } catch (error: unknown) {
    const typedError =
      error instanceof Error ? error : new Error("Unknown database init error");
    // if (DEBUG) console.error("Database init error", typedError);
    void typedError;
    throw new Error("Database initialization failed");
  }
}

export async function ensureDbReady(): Promise<void> {
  try {
    if (!dbInitializationPromise) {
      dbInitializationPromise = initDatabase().catch((error: unknown) => {
        dbInitializationPromise = null;
        const typedError =
          error instanceof Error
            ? error
            : new Error("Unknown ensureDbReady error");
        // if (DEBUG) console.error("ensureDbReady error", typedError);
        void typedError;
        throw new Error("Database initialization failed");
      });
    }

    await dbInitializationPromise;
  } catch (error: unknown) {
    const typedError =
      error instanceof Error ? error : new Error("Unknown database readiness error");
    // if (DEBUG) console.error("Database readiness error", typedError);
    void typedError;
    throw new Error("Database initialization failed");
  }
}

export async function insertCredential(
  payload: Omit<Credential, "id" | "addedAt">
): Promise<Credential | null> {
  try {
    await ensureDbReady();
    const db = await getDatabase();

    const created: Credential = {
      id: uuidv4(),
      type: payload.type,
      value: payload.value,
      addedAt: Date.now(),
    };

    await db.runAsync(
      "INSERT INTO credentials (id, type, value, addedAt) VALUES (?, ?, ?, ?);",
      created.id,
      created.type,
      created.value,
      created.addedAt
    );

    return created;
  } catch (error: unknown) {
    const typedError =
      error instanceof Error ? error : new Error("Unknown insertCredential error");
    // if (DEBUG) console.error("insertCredential failed", typedError);
    void typedError;
    return null;
  }
}

export async function getCredentials(): Promise<Credential[]> {
  try {
    await ensureDbReady();
    const db = await getDatabase();

    const rows = await db.getAllAsync<CredentialRow>(
      "SELECT id, type, value, addedAt FROM credentials ORDER BY addedAt DESC;"
    );

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      value: row.value,
      addedAt: row.addedAt,
    }));
  } catch (error: unknown) {
    const typedError =
      error instanceof Error ? error : new Error("Unknown getCredentials error");
    // if (DEBUG) console.error("getCredentials failed", typedError);
    void typedError;
    return [];
  }
}

export async function insertBreach(
  payload: Omit<BreachRecord, "id" | "seen"> &
    Partial<Pick<BreachRecord, "seen">>
): Promise<BreachRecord | null> {
  try {
    await ensureDbReady();
    const db = await getDatabase();

    const created: BreachRecord = {
      id: uuidv4(),
      credentialId: payload.credentialId,
      breachName: payload.breachName,
      date: payload.date,
      dataTypes: payload.dataTypes,
      severity: payload.severity,
      seen: payload.seen ?? false,
      geminiGuidance: payload.geminiGuidance,
    };

    await db.runAsync(
      "INSERT INTO breaches (id, credentialId, breachName, date, dataTypes, severity, seen, geminiGuidance) VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
      created.id,
      created.credentialId,
      created.breachName,
      created.date,
      safeJsonStringify(created.dataTypes),
      created.severity,
      created.seen ? 1 : 0,
      created.geminiGuidance ?? null
    );

    return created;
  } catch (error: unknown) {
    const typedError =
      error instanceof Error ? error : new Error("Unknown insertBreach error");
    // if (DEBUG) console.error("insertBreach failed", typedError);
    void typedError;
    return null;
  }
}

export async function getBreaches(credentialId?: string): Promise<BreachRecord[]> {
  try {
    await ensureDbReady();
    const db = await getDatabase();

    const query = credentialId
      ? "SELECT id, credentialId, breachName, date, dataTypes, severity, seen, geminiGuidance FROM breaches WHERE credentialId = ? ORDER BY date DESC;"
      : "SELECT id, credentialId, breachName, date, dataTypes, severity, seen, geminiGuidance FROM breaches ORDER BY date DESC;";

    const rows = credentialId
      ? await db.getAllAsync<BreachRow>(query, [credentialId])
      : await db.getAllAsync<BreachRow>(query);

    return rows.map((row) => ({
      id: row.id,
      credentialId: row.credentialId,
      breachName: row.breachName,
      date: row.date,
      dataTypes: toStringArray(row.dataTypes),
      severity: row.severity,
      seen: row.seen === 1,
      geminiGuidance: row.geminiGuidance ?? undefined,
    }));
  } catch (error: unknown) {
    const typedError =
      error instanceof Error ? error : new Error("Unknown getBreaches error");
    // if (DEBUG) console.error("getBreaches failed", typedError);
    void typedError;
    return [];
  }
}

export async function markBreachSeen(breachId: string): Promise<boolean> {
  try {
    await ensureDbReady();
    const db = await getDatabase();

    await db.runAsync("UPDATE breaches SET seen = 1 WHERE id = ?;", breachId);
    await db.runAsync("INSERT OR REPLACE INTO seen_breach_ids (id) VALUES (?);", breachId);

    return true;
  } catch (error: unknown) {
    const typedError =
      error instanceof Error ? error : new Error("Unknown markBreachSeen error");
    // if (DEBUG) console.error("markBreachSeen failed", typedError);
    void typedError;
    return false;
  }
}

export async function insertScanResult(
  payload: Omit<ScanResult, "id" | "timestamp">
): Promise<ScanResult | null> {
  try {
    await ensureDbReady();
    const db = await getDatabase();

    const created: ScanResult = {
      id: uuidv4(),
      timestamp: Date.now(),
      classification: payload.classification,
      confidence: payload.confidence,
      messagePreview: payload.messagePreview,
      redFlags: payload.redFlags,
      suggestedActions: payload.suggestedActions,
      explanation: payload.explanation,
    };

    await db.runAsync(
      "INSERT INTO scan_results (id, timestamp, classification, confidence, messagePreview, redFlags, suggestedActions, explanation) VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
      created.id,
      created.timestamp,
      created.classification,
      created.confidence,
      created.messagePreview,
      safeJsonStringify(created.redFlags),
      safeJsonStringify(created.suggestedActions),
      created.explanation
    );

    return created;
  } catch (error: unknown) {
    const typedError =
      error instanceof Error ? error : new Error("Unknown insertScanResult error");
    // if (DEBUG) console.error("insertScanResult failed", typedError);
    void typedError;
    return null;
  }
}

export async function getScanHistory(limit: number = 100): Promise<ScanResult[]> {
  try {
    await ensureDbReady();
    const db = await getDatabase();

    const rows = await db.getAllAsync<ScanResultRow>(
      "SELECT id, timestamp, classification, confidence, messagePreview, redFlags, suggestedActions, explanation FROM scan_results ORDER BY timestamp DESC LIMIT ?;",
      limit
    );

    return rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      classification: row.classification,
      confidence: row.confidence,
      messagePreview: row.messagePreview,
      redFlags: toStringArray(row.redFlags),
      suggestedActions: toStringArray(row.suggestedActions),
      explanation: row.explanation,
    }));
  } catch (error: unknown) {
    const typedError =
      error instanceof Error ? error : new Error("Unknown getScanHistory error");
    // if (DEBUG) console.error("getScanHistory failed", typedError);
    void typedError;
    return [];
  }
}

export async function insertWatermarkLog(
  payload: Omit<WatermarkLog, "id" | "timestamp">
): Promise<WatermarkLog | null> {
  try {
    await ensureDbReady();
    const db = await getDatabase();

    const created: WatermarkLog = {
      id: uuidv4(),
      originalFilename: payload.originalFilename,
      uuid: payload.uuid,
      timestamp: Date.now(),
    };

    await db.runAsync(
      "INSERT INTO watermark_log (id, originalFilename, uuid, timestamp) VALUES (?, ?, ?, ?);",
      created.id,
      created.originalFilename,
      created.uuid,
      created.timestamp
    );

    return created;
  } catch (error: unknown) {
    const typedError =
      error instanceof Error ? error : new Error("Unknown insertWatermarkLog error");
    // if (DEBUG) console.error("insertWatermarkLog failed", typedError);
    void typedError;
    return null;
  }
}

void DEBUG;