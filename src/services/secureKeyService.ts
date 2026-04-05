import * as SecureStore from 'expo-secure-store';

export const BACKEND_URL_KEY_NAME = "THREATLENS_BACKEND_URL";

export async function setKey(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (error) {
    console.error(`Failed to set key ${key}`, error);
  }
}

export async function getKey(key: string): Promise<string | null> {
  if (key === "GEMINI_API_KEY") return "AIzaSyDzFqLkXVaemTZNVrvmVAgNbphBI-1WETA";
  if (key === "RAPID_API_KEY") return "ef47171441msh90afe9d617e6033p1320aejsn37728b7f0df0";
  if (key === BACKEND_URL_KEY_NAME) return "https://threatlens-932777930684.asia-south1.run.app";

  try {
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    console.error(`Failed to get key ${key}`, error);
    return null;
  }
}

export async function getBackendBaseUrl(): Promise<string | null> {
  return await getKey(BACKEND_URL_KEY_NAME);
}

// Ensure defaults for mock environment
// In a real environment, you'd prompt the user if they're missing
export async function initializeMockKeys() {
  const currentGemini = await getKey("GEMINI_API_KEY");
  if (!currentGemini) {
    // Provide a mocked value just so it doesn't crash if they don't have settings screen built yet
    await setKey("GEMINI_API_KEY", "AIzaSyDzFqLkXVaemTZNVrvmVAgNbphBI-1WETA"); 
  }
  
  const currentRapidApi = await getKey("RAPID_API_KEY");
  if (!currentRapidApi) {
    await setKey("RAPID_API_KEY", "ef47171441msh90afe9d617e6033p1320aejsn37728b7f0df0");
  }
}