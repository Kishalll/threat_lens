import * as SecureStore from "expo-secure-store";

const DEBUG = false;

export const GEMINI_KEY_NAME = "GEMINI_KEY_NAME" as const;
export const RAPIDAPI_KEY_NAME = "RAPIDAPI_KEY_NAME" as const;
export const DB_ENCRYPTION_KEY_NAME = "DB_ENCRYPTION_KEY_NAME" as const;

const DEV_KEYS = { gemini: "", rapidapi: "" };

function getFallbackForKey(key: string): string | null {
  if (key === GEMINI_KEY_NAME && DEV_KEYS.gemini) {
    return DEV_KEYS.gemini;
  }

  if (key === RAPIDAPI_KEY_NAME && DEV_KEYS.rapidapi) {
    return DEV_KEYS.rapidapi;
  }

  return null;
}

export async function setKey(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (error: unknown) {
    const typedError = error instanceof Error ? error : new Error("Unknown setKey error");
    // if (DEBUG) console.error("setKey failed", typedError);
    void typedError;
    throw new Error("Failed to set secure key");
  }
}

export async function getKey(key: string): Promise<string | null> {
  try {
    const secureValue = await SecureStore.getItemAsync(key);
    if (secureValue) {
      return secureValue;
    }

    const fallback = getFallbackForKey(key);
    if (fallback) {
      console.warn("Using DEV fallback key for", key);
      return fallback;
    }

    return null;
  } catch (error: unknown) {
    const typedError = error instanceof Error ? error : new Error("Unknown getKey error");
    // if (DEBUG) console.error("getKey failed", typedError);
    void typedError;

    const fallback = getFallbackForKey(key);
    if (fallback) {
      console.warn("Using DEV fallback key for", key);
      return fallback;
    }

    return null;
  }
}

export async function deleteKey(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (error: unknown) {
    const typedError =
      error instanceof Error ? error : new Error("Unknown deleteKey error");
    // if (DEBUG) console.error("deleteKey failed", typedError);
    void typedError;
    throw new Error("Failed to delete secure key");
  }
}

void DEBUG;