import * as SQLite from "expo-sqlite";

// For SDK 51, expo-sqlite returns a synchronous DB context for standard executeSql 
// or async via new APIs
let db: SQLite.SQLiteDatabase | null = null;

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
    `);
    
    console.log("Database initialized successfully.");
  } catch (error) {
    console.error("Database initialization failed", error);
    throw error;
  }
}

export async function insertCredential(id: string, value: string, type: string) {
  if (!db) return;
  await db.runAsync('INSERT INTO credentials (id, value, type) VALUES (?, ?, ?)', [id, value, type]);
}

export async function getCredentials() {
  if (!db) return [];
  const allRows = await db.getAllAsync('SELECT * FROM credentials');
  return allRows as any[];
}