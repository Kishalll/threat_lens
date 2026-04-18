import * as SecureStore from 'expo-secure-store';

export const GEMINI_KEY_NAME = "GEMINI_API_KEY";
export const TRUST_REGISTRY_BASE_URL_KEY_NAME = "THREATLENS_TRUST_REGISTRY_BASE_URL";
export const TRUST_REGISTRY_API_KEY_NAME = "THREATLENS_TRUST_REGISTRY_API_KEY";
export const MASTER_PUBLIC_KEY_PEM_KEY_NAME = "THREATLENS_MASTER_PUBLIC_KEY_PEM";

function normalizeTrustBaseUrl(value: string): string {
  let normalized = value.trim().replace(/\/+$/, "");

  if (normalized.endsWith("/register")) {
    normalized = normalized.slice(0, -"/register".length);
  }

  if (normalized.endsWith("/verify")) {
    normalized = normalized.slice(0, -"/verify".length);
  }

  return normalized;
}

export async function setKey(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (error) {
    console.error(`Failed to set key ${key}`, error);
  }
}

export async function getKey(key: string): Promise<string | null> {
  if (key === GEMINI_KEY_NAME) {
    const envGemini = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    if (typeof envGemini === "string" && envGemini.trim().length > 0) {
      return envGemini.trim();
    }
  }

  try {
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    console.error(`Failed to get key ${key}`, error);
    return null;
  }
}

export async function getTrustRegistryBaseUrl(): Promise<string | null> {
  const envUrl = process.env.EXPO_PUBLIC_TRUST_REGISTRY_BASE_URL;
  if (typeof envUrl === "string" && envUrl.trim().length > 0) {
    return normalizeTrustBaseUrl(envUrl);
  }

  try {
    const stored = await SecureStore.getItemAsync(TRUST_REGISTRY_BASE_URL_KEY_NAME);
    if (stored) return normalizeTrustBaseUrl(stored);
  } catch {
    // Ignore SecureStore errors
  }

  return null;
}

export async function getTrustRegistryApiKey(): Promise<string | null> {
  const envKey = process.env.EXPO_PUBLIC_TRUST_REGISTRY_API_KEY;
  if (typeof envKey === "string" && envKey.trim().length > 0) {
    return envKey.trim();
  }

  try {
    const stored = await SecureStore.getItemAsync(TRUST_REGISTRY_API_KEY_NAME);
    if (typeof stored === "string" && stored.trim().length > 0) {
      return stored.trim();
    }
  } catch {
    // Ignore SecureStore errors
  }

  return null;
}

export async function getMasterPublicKeyPem(): Promise<string | null> {
  const envPem = process.env.EXPO_PUBLIC_MASTER_PUBLIC_KEY_PEM;
  if (typeof envPem === "string" && envPem.trim().length > 0) {
    return envPem.trim().replace(/\\n/g, "\n");
  }

  try {
    const stored = await SecureStore.getItemAsync(MASTER_PUBLIC_KEY_PEM_KEY_NAME);
    if (typeof stored === "string" && stored.trim().length > 0) {
      return stored.trim().replace(/\\n/g, "\n");
    }
  } catch {
    // Ignore SecureStore errors
  }

  return null;
}

export async function getRegisterEndpointUrl(): Promise<string | null> {
  const base = await getTrustRegistryBaseUrl();
  if (!base) {
    return null;
  }
  if (base.endsWith("/register")) {
    return base;
  }
  if (base.endsWith("/verify")) {
    return `${base.slice(0, -"/verify".length)}/register`;
  }
  return `${base}/register`;
}

export async function getVerifyEndpointUrl(): Promise<string | null> {
  const base = await getTrustRegistryBaseUrl();
  if (!base) {
    return null;
  }
  if (base.endsWith("/verify")) {
    return base;
  }
  if (base.endsWith("/register")) {
    return `${base.slice(0, -"/register".length)}/verify`;
  }
  return `${base}/verify`;
}

// Ensure defaults for mock environment
export async function initializeMockKeys() {
  // Intentionally no mocked Gemini key. Set EXPO_PUBLIC_GEMINI_API_KEY
  // or store GEMINI_API_KEY securely via setKey.
}