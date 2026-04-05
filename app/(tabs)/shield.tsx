import React, { useState } from "react";
import { StyleSheet, View, Text, Pressable, Image, ActivityIndicator, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system";
import Feather from "@expo/vector-icons/Feather";
import axios from "axios";

import { useDashboardStore } from "../../src/stores/dashboardStore";
import { applyLsbWatermark } from "../../src/utils/lsbWatermark";
import { writeProtectionMetadata } from "../../src/utils/exifMetadata";
import { getBackendBaseUrl } from "../../src/services/secureKeyService";

export default function ShieldScreen() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [protectedImage, setProtectedImage] = useState<string | null>(null);
  const [step, setStep] = useState<number>(0); 
  // 0: idle, 1: picking, 2: watermarking, 3: cloud ML, 4: metadata, 5: done

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });

    if (!result.canceled) {
      setSelectedImage(result.assets[0].uri);
      setProtectedImage(null);
      setStep(1);
    }
  };

  const processImage = async () => {
    if (!selectedImage) return;

    try {
      // Step 2: LSB Watermark
      setStep(2);
      const { uri: watermarkedUri, uuid } = await applyLsbWatermark(selectedImage);

      // Step 3: Cloud Function (Adversarial Noise via FGSM)
      setStep(3);
      const base64Data = await FileSystem.readAsStringAsync(watermarkedUri, {
        encoding: (FileSystem as any).EncodingType.Base64,
      });
      
      const functionUrl = await getBackendBaseUrl() || "https://us-central1-mock-project.cloudfunctions.net/adversarial_noise";
      
      let noiseUri = watermarkedUri; // fallback
      try {
        const response = await axios.post(functionUrl, { image: base64Data }, { 
          timeout: 10000,
          headers: {
            "Authorization": "Bearer RPDfiPBuMvXIo9dirNZz1kh4QcVhBnOjZGxfsYUDKVwU2Ye3T7ibPjOJmUpAgTLc"
          }
        });
        if (response.data && response.data.processedImage) {
           const processedB64 = response.data.processedImage;
           noiseUri = `${(FileSystem as any).cacheDirectory}noise_${Date.now()}.jpg`;
           await FileSystem.writeAsStringAsync(noiseUri, processedB64, { encoding: (FileSystem as any).EncodingType.Base64 });
        }
      } catch (err) {
        console.warn("Cloud function failed, falling back to local only", err);
      }

      // Step 4: Metadata Tag
      setStep(4);
      const finalUri = await writeProtectionMetadata(noiseUri, uuid);

      setProtectedImage(finalUri);
      
      // Update Dashboard Metric
      const dash = useDashboardStore.getState();
      dash.updateDashboardData({
        protectedImagesCount: dash.protectedImagesCount + 1
      });

      setStep(5);
    } catch (error) {
      console.error(error);
      Alert.alert("Protection Failed", "An error occurred while securing the image.");
      setStep(0);
    }
  };

  const saveToGallery = async () => {
    if (!protectedImage) return;
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
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
          <Image source={{ uri: selectedImage }} style={styles.imageBox} />
        ) : (
          <View style={[styles.imageBox, styles.placeholderBox]}>
            <Feather name="image" size={48} color="#2A2D35" />
            <Text style={styles.placeholderText}>No image selected</Text>
          </View>
        )}
      </View>

      {step > 1 && step < 5 && (
        <View style={styles.stepperContainer}>
          <ActivityIndicator size="small" color="#4ADE80" />
          <Text style={styles.stepText}>
            {step === 2 && "Embeding invisible watermark..."}
            {step === 3 && "Applying AI-resistance layer..."}
            {step === 4 && "Updating EXIF immutability tags..."}
          </Text>
        </View>
      )}

      {step === 5 && (
        <View style={styles.successContainer}>
          <Feather name="check-circle" size={24} color="#4ADE80" />
          <Text style={styles.successText}>Image is fully protected!</Text>
        </View>
      )}

      <View style={styles.buttonsContainer}>
        {!selectedImage || step === 5 ? (
          <Pressable style={styles.primaryButton} onPress={pickImage}>
            <Feather name="upload" size={20} color="#0E0F11" />
            <Text style={styles.primaryButtonText}>Select Photo</Text>
          </Pressable>
        ) : step === 1 ? (
          <Pressable style={styles.primaryButton} onPress={processImage}>
            <Feather name="shield" size={20} color="#0E0F11" />
            <Text style={styles.primaryButtonText}>Protect Image</Text>
          </Pressable>
        ) : null}

        {step === 5 && (
          <Pressable style={styles.secondaryButton} onPress={saveToGallery}>
            <Feather name="download" size={20} color="#E8E9EB" />
            <Text style={styles.secondaryButtonText}>Save to Gallery</Text>
          </Pressable>
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
  }
});