import React, { useState, useRef } from "react";
import { StyleSheet, View, Text, Pressable, Image, ActivityIndicator, Alert, TouchableOpacity } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system/legacy";
import Feather from "@expo/vector-icons/Feather";

import { useDashboardStore } from "../../src/stores/dashboardStore";
import { applyLsbWatermark } from "../../src/utils/lsbWatermark";
import { writeProtectionMetadata } from "../../src/utils/exifMetadata";
import { addAdversarialNoise } from "../../src/utils/adversarialNoise";

type ProcessStep = 'idle' | 'picked' | 'watermarking' | 'noise' | 'metadata' | 'done' | 'error';

export default function ShieldScreen() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [protectedImage, setProtectedImage] = useState<string | null>(null);
  const [step, setStep] = useState<ProcessStep>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const cancellingRef = useRef(false);

  const resetState = () => {
    setSelectedImage(null);
    setProtectedImage(null);
    setStep('idle');
    setErrorMessage(null);
    cancellingRef.current = false;
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

  const cancelProcessing = () => {
    cancellingRef.current = true;
    setStep('error');
    setErrorMessage("Protection cancelled by user.");
  };

  const processImage = async () => {
    if (!selectedImage) return;

    const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
    if (!cacheDir) {
      setStep('error');
      setErrorMessage("No writable cache directory available on this device.");
      return;
    }

    cancellingRef.current = false;

    try {
      // Step 2: LSB Watermark (UUID generation)
      setStep('watermarking');
      const { uri: watermarkedUri, uuid } = await applyLsbWatermark(selectedImage);
      if (cancellingRef.current) return;

      // Step 3: On-device Adversarial Noise
      setStep('noise');
      const noiseUri = await addAdversarialNoise(watermarkedUri, 0.05);
      if (cancellingRef.current) return;

      // Step 4: Metadata Tag
      setStep('metadata');
      const finalUri = await writeProtectionMetadata(noiseUri, uuid);
      if (cancellingRef.current) return;

      setProtectedImage(finalUri);

      // Update Dashboard Metric
      const dash = useDashboardStore.getState();
      dash.updateDashboardData({
        protectedImagesCount: dash.protectedImagesCount + 1
      });

      setStep('done');
    } catch (error) {
      console.error(error);
      if (cancellingRef.current) {
        setErrorMessage("Protection cancelled by user.");
      } else {
        setErrorMessage("An error occurred while securing the image.");
      }
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
    } catch(err) {
      console.error(err);
      Alert.alert("Save Failed", "Could not save to gallery.");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Image Shield</Text>
      <Text style={styles.subtitle}>
        Protect your images from AI deepfake extraction by applying steganographic metadata and adversarial noise.
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

      {/* Processing stepper */}
      {['watermarking', 'noise', 'metadata'].includes(step) && (
        <View style={styles.stepperContainer}>
          <ActivityIndicator size="small" color="#4ADE80" />
          <Text style={styles.stepText}>
            {step === 'watermarking' && "Embedding invisible watermark..."}
            {step === 'noise' && "Applying AI-resistance layer..."}
            {step === 'metadata' && "Updating EXIF immutability tags..."}
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
        {['watermarking', 'noise', 'metadata'].includes(step) && (
          <Pressable style={styles.cancelButton} onPress={cancelProcessing}>
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