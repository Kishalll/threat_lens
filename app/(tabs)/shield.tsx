import React, { useState } from "react";
import { StyleSheet, View, Text, Pressable, Image, ActivityIndicator, Alert, TouchableOpacity } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system/legacy";
import Feather from "@expo/vector-icons/Feather";

import { useDashboardStore } from "../../src/stores/dashboardStore";
import { getCloudFunctionUrl } from "../../src/services/secureKeyService";

type ProcessStep = 'idle' | 'picked' | 'protecting' | 'done' | 'error';

export default function ShieldScreen() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [protectedImage, setProtectedImage] = useState<string | null>(null);
  const [step, setStep] = useState<ProcessStep>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resetState = () => {
    setSelectedImage(null);
    setProtectedImage(null);
    setStep('idle');
    setErrorMessage(null);
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });

    if (!result.canceled) {
      setSelectedImage(result.assets[0].uri);
      setProtectedImage(null);
      setStep('picked');
      setErrorMessage(null);
    }
  };

  const processImage = async () => {
    if (!selectedImage) return;

    setStep('protecting');
    setErrorMessage(null);

    try {
      // Read the selected image as base64
      const base64Data = await FileSystem.readAsStringAsync(selectedImage, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Get the cloud function URL
      const functionUrl = await getCloudFunctionUrl();
      if (!functionUrl) {
        throw new Error("Cloud function URL not configured. Please set it in Settings.");
      }

      const normalizedBase = functionUrl.trim().replace(/\/+$/, "");
      const endpointUrl = normalizedBase.endsWith("/protect-image")
        ? normalizedBase
        : `${normalizedBase}/protect-image`;

      // Send as JSON with base64 image (supported by cloud function)
      const requestBody = {
        image: base64Data,
        strength: 0.05,
      };

      const response = await fetch(endpointUrl, {
        method: "POST",
        body: JSON.stringify(requestBody),
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Protection failed");
      }

      // The cloud function returns base64 image data
      // Parse the data URI: "data:image/jpeg;base64,<base64data>"
      const dataUri = result.image;
      const base64Match = dataUri.match(/^data:image\/(jpeg|png|jpg|webp);base64,(.+)$/);

      if (!base64Match) {
        throw new Error("Invalid image data received from server.");
      }

      const imageType = base64Match[1];
      const imageData = base64Match[2];

      // Save protected image to cache
      const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      if (!cacheDir) throw new Error("No cache directory available");

      const fileExt = imageType === 'jpeg' || imageType === 'jpg' ? 'jpg' : imageType;
      const protectedUri = `${cacheDir}protected_${Date.now()}.${fileExt}`;

      await FileSystem.writeAsStringAsync(protectedUri, imageData, {
        encoding: FileSystem.EncodingType.Base64,
      });

      setProtectedImage(protectedUri);

      // Update Dashboard Metric
      const dash = useDashboardStore.getState();
      dash.updateDashboardData({
        protectedImagesCount: dash.protectedImagesCount + 1,
      });

      setStep('done');
    } catch (error: any) {
      console.error("Image protection error:", error);
      setErrorMessage(error.message || "An error occurred while securing the image.");
      setStep('error');
    }
  };

  const saveToGallery = async () => {
    if (!protectedImage) return;
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync(false, ["photo"]);
      if (status === 'granted') {
        await MediaLibrary.saveToLibraryAsync(protectedImage);
        Alert.alert("Success", "Protected image saved to your gallery!");
      } else {
        Alert.alert("Permission Required", "Allow access to save images.");
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Save Failed", "Could not save to gallery.");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Image Shield</Text>
      <Text style={styles.subtitle}>
        Protect your images from AI deepfake extraction by applying adversarial noise via cloud processing.
      </Text>

      <View style={styles.imageContainer}>
        {protectedImage ? (
          <Image source={{ uri: protectedImage }} style={styles.imageBox} />
        ) : selectedImage ? (
          <Image source={{ uri: selectedImage } as any} style={styles.imageBox} />
        ) : (
          <View style={[styles.imageBox, styles.placeholderBox]}>
            <Feather name="image" size={48} color="#2A2D35" />
            <Text style={styles.placeholderText}>No image selected</Text>
          </View>
        )}
        {/* X button to clear image */}
        {(selectedImage || protectedImage) && (
          <TouchableOpacity style={styles.clearButton} onPress={resetState}>
            <Feather name="x" size={20} color="#E8E9EB" />
          </TouchableOpacity>
        )}
      </View>

      {/* Processing indicator */}
      {step === 'protecting' && (
        <View style={styles.stepperContainer}>
          <ActivityIndicator size="small" color="#4ADE80" />
          <Text style={styles.stepText}>
            Applying 6-layer adversarial protection via cloud...
          </Text>
        </View>
      )}

      {/* Success message */}
      {step === 'done' && (
        <View style={styles.successContainer}>
          <Feather name="check-circle" size={24} color="#4ADE80" />
          <Text style={styles.successText}>Image is fully protected!</Text>
        </View>
      )}

      {/* Error message */}
      {step === 'error' && errorMessage && (
        <View style={styles.errorContainer}>
          <Feather name="alert-circle" size={24} color="#EF4444" />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}

      <View style={styles.buttonsContainer}>
        {/* Idle state - show select button */}
        {step === 'idle' && (
          <Pressable style={styles.primaryButton} onPress={pickImage}>
            <Feather name="upload" size={20} color="#0E0F11" />
            <Text style={styles.primaryButtonText}>Select Photo</Text>
          </Pressable>
        )}

        {/* Picked state - show protect button */}
        {step === 'picked' && (
          <Pressable style={styles.primaryButton} onPress={processImage}>
            <Feather name="shield" size={20} color="#0E0F11" />
            <Text style={styles.primaryButtonText}>Protect Image</Text>
          </Pressable>
        )}

        {/* Processing state - show cancel button */}
        {step === 'protecting' && (
          <Pressable style={styles.cancelButton} onPress={resetState}>
            <Feather name="x-circle" size={20} color="#EF4444" />
            <Text style={styles.cancelButtonText}>Cancel Protection</Text>
          </Pressable>
        )}

        {/* Done state - show download button */}
        {step === 'done' && (
          <Pressable style={styles.secondaryButton} onPress={saveToGallery}>
            <Feather name="download" size={20} color="#E8E9EB" />
            <Text style={styles.secondaryButtonText}>Save to Gallery</Text>
          </Pressable>
        )}

        {/* Error state - show retry buttons */}
        {step === 'error' && (
          <>
            <Pressable style={styles.primaryButton} onPress={pickImage}>
              <Feather name="upload" size={20} color="#0E0F11" />
              <Text style={styles.primaryButtonText}>Select New Photo</Text>
            </Pressable>
            {selectedImage && (
              <Pressable style={styles.secondaryButton} onPress={processImage}>
                <Feather name="shield" size={20} color="#E8E9EB" />
                <Text style={styles.secondaryButtonText}>Try Again</Text>
              </Pressable>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0E0F11",
    padding: 20,
    paddingTop: 60,
  },
  headerTitle: {
    color: "#E8E9EB",
    fontSize: 28,
    fontFamily: "DMSans-Regular",
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    color: "#8B8F99",
    fontSize: 14,
    fontFamily: "DMSans-Regular",
    marginBottom: 24,
    lineHeight: 20,
  },
  imageContainer: {
    alignItems: "center",
    marginBottom: 24,
  },
  imageBox: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2A2D35",
  },
  placeholderBox: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#16181C",
  },
  placeholderText: {
    color: "#8B8F99",
    marginTop: 12,
    fontFamily: "DMSans-Regular",
  },
  stepperContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16181C",
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2A2D35",
    marginBottom: 24,
  },
  stepText: {
    color: "#E8E9EB",
    fontFamily: "DMSans-Regular",
    marginLeft: 12,
  },
  successContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#4ADE801A",
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#4ADE80",
    marginBottom: 24,
  },
  successText: {
    color: "#4ADE80",
    fontFamily: "DMSans-Regular",
    fontWeight: "bold",
    marginLeft: 12,
  },
  buttonsContainer: {
    marginTop: "auto",
    paddingBottom: 24,
    gap: 16,
  },
  primaryButton: {
    backgroundColor: "#4ADE80",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  primaryButtonText: {
    color: "#0E0F11",
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: "DMSans-Regular",
  },
  secondaryButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#2A2D35",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  secondaryButtonText: {
    color: "#E8E9EB",
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: "DMSans-Regular",
  },
  clearButton: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: "#2A2D35",
    borderRadius: 16,
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  cancelButton: {
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: "#EF4444",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  cancelButtonText: {
    color: "#EF4444",
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: "DMSans-Regular",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EF44441A",
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#EF4444",
    marginBottom: 24,
  },
  errorText: {
    color: "#EF4444",
    fontFamily: "DMSans-Regular",
    fontWeight: "bold",
    marginLeft: 12,
    flex: 1,
  }
});