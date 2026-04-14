import * as SQLite from "expo-sqlite";
import type { BreachApiItem } from "./breachApiService";

// For SDK 51, expo-sqlite returns a synchronous DB context for standard executeSql 
// or async via new APIs
let db: SQLite.SQLiteDatabase | null = null;
let credentialsWriteQueue: Promise<void> = Promise.resolve();

function enqueueCredentialsWrite(task: () => Promise<void>): Promise<void> {
  credentialsWriteQueue = credentialsWriteQueue
    .catch(() => {
      // Swallow previous write failures so future writes can proceed.
    })
    .then(task);

  return credentialsWriteQueue;
}

export type StoredCredential = {
  id: string;
  value: string;
  type: "email" | "username";
};

export async function initDatabase() {
  try {
    db = await SQLite.openDatabaseAsync("threatlens_secure.db");
    
    // Create Tables
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      
      CREATE TABLE IF NOT EXISTS credentials (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        type TEXT NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS seen_breach_ids (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS watermark_log (
        uuid TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        original_filename TEXT
      );
      
      CREATE TABLE IF NOT EXISTS scan_results (
        id TEXT PRIMARY KEY,
        classification TEXT,
        confidence INTEGER,
        messagePreview TEXT,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS breach_cache (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    
    console.log("Database initialized successfully.");
  } catch (error) {
    console.error("Database initialization failed", error);
    throw error;
  }
}

export async function insertCredential(id: string, value: string, type: string) {
  if (!db) return;
  await enqueueCredentialsWrite(async () => {
    if (!db) return;
    await db.runAsync('INSERT OR REPLACE INTO credentials (id, value, type) VALUES (?, ?, ?)', [id, value, type]);
  });
}

export async function getCredentials(): Promise<StoredCredential[]> {
  if (!db) return [];
  const allRows = await db.getAllAsync('SELECT * FROM credentials');
  return allRows
    .map((row) => {
      const typed = row as { id?: unknown; value?: unknown; type?: unknown };
      if (
        typeof typed.id !== "string" ||
        typeof typed.value !== "string" ||
        (typed.type !== "email" && typed.type !== "username")
      ) {
        return null;
      }

      return {
        id: typed.id,
        value: typed.value,
        type: typed.type,
      };
    })
    .filter((row): row is StoredCredential => row !== null);
}

export async function replaceCredentials(credentials: StoredCredential[]): Promise<void> {
  if (!db) return;

  await enqueueCredentialsWrite(async () => {
    if (!db) return;

    await db.runAsync("DELETE FROM credentials");
    for (const credential of credentials) {
      await db.runAsync(
        "INSERT OR REPLACE INTO credentials (id, value, type) VALUES (?, ?, ?)",
        [credential.id, credential.value, credential.type]
      );
    }
  });
}

export async function getCachedBreaches(): Promise<BreachApiItem[]> {
  if (!db) return [];

  const rows = await db.getAllAsync("SELECT payload FROM breach_cache");
  return rows
    .map((row) => {
      const typed = row as { payload?: unknown };
      if (typeof typed.payload !== "string") {
        return null;
      }

      try {
        return JSON.parse(typed.payload) as BreachApiItem;
      } catch {
        return null;
      }
    })
    .filter((item): item is BreachApiItem => item !== null);
}

export async function replaceCachedBreaches(breaches: BreachApiItem[]): Promise<void> {
  if (!db) return;

  await db.runAsync("DELETE FROM breach_cache");
  const now = Date.now();

  for (const breach of breaches) {
    await db.runAsync(
      "INSERT INTO breach_cache (id, payload, updated_at) VALUES (?, ?, ?)",
      [breach.id, JSON.stringify(breach), now]
    );
  }
}