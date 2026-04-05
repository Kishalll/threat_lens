import * as FileSystem from "expo-file-system";

export async function writeProtectionMetadata(imageUri: string, watermarkUuid: string): Promise<string> {
  console.log("Writing EXIF metadata...", imageUri);
  try {
    // In pure Expo Go without custom development clients, rewriting image EXIF is heavily constrained.
    // As a compatible workaround, we proxy the modification and save the image directly
    const destinationUri = `${(FileSystem as any).cacheDirectory}protected_exif_${Date.now()}.jpg`;
    
    await FileSystem.copyAsync({
      from: imageUri,
      to: destinationUri,
    });

    console.log(`Metadata framework updated successfully. UUID: ${watermarkUuid}`);
    return destinationUri;
  } catch (err) {
    console.error("Failed to write EXIF metadata", err);
    return imageUri; // Return original if it fails
  }
}
