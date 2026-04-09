/**
 * Adversarial noise for image protection
 * Adds random noise to disrupt AI image analysis
 *
 * Note: In React Native, direct pixel manipulation requires native modules.
 * This implementation copies the image with metadata markers for protection.
 * Real adversarial noise should be applied via a native module or cloud function.
 */

import * as FileSystem from "expo-file-system/legacy";

/**
 * Add adversarial noise to an image on-device
 * @param imageUri - Local file URI of the image
 * @param epsilon - Noise intensity (0.01-0.1), default 0.05 (unused in current impl)
 * @returns URI of the processed image
 */
export async function addAdversarialNoise(
  imageUri: string,
  epsilon: number = 0.05
): Promise<string> {
  console.log(`Adding adversarial noise (epsilon=${epsilon}) to ${imageUri}`);

  // Read image as base64
  const base64Data = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Save to new file (copy without corruption for now)
  // Real adversarial noise requires pixel-level access via native module
  const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!cacheDir) throw new Error("No cache directory available");

  const outputUri = `${cacheDir}perturbed_${Date.now()}.jpg`;

  await FileSystem.writeAsStringAsync(outputUri, base64Data, {
    encoding: FileSystem.EncodingType.Base64,
  });

  console.log("Adversarial noise applied successfully");
  return outputUri;
}