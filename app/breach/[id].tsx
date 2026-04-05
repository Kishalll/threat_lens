import React, { useEffect, useState } from "react";
import { StyleSheet, View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { useBreachStore } from "../../src/stores/breachStore";
import { generateBreachGuidance } from "../../src/services/geminiService";

export default function BreachDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const breachStore = useBreachStore();
  
  const breach = breachStore.breaches.find(b => b.id === id);
  
  const [guidance, setGuidance] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (breach) {
      setLoading(true);
      generateBreachGuidance(breach).then((result) => {
        setGuidance(result);
        setLoading(false);
      });
    }
  }, [breach]);

  if (!breach) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Breach not found.</Text>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Pressable style={styles.backHeader} onPress={() => router.back()}>
        <Feather name="arrow-left" size={24} color="#E8E9EB" />
        <Text style={styles.backTitle}>Back</Text>
      </Pressable>

      <View style={styles.headerCard}>
        <Feather name="alert-triangle" size={32} color="#F87171" style={{marginBottom: 12}} />
        <Text style={styles.title}>{breach.name}</Text>
        <Text style={styles.date}>Occurred: {new Date(breach.date).toLocaleDateString()}</Text>
      </View>

      <Text style={styles.sectionTitle}>What was leaked?</Text>
      <View style={styles.tagsContainer}>
        {breach.dataClasses.map((item, index) => (
          <View key={index} style={styles.dataClassTag}>
            <Text style={styles.dataClassText}>{item}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Description</Text>
      <Text style={styles.body}>{breach.description}</Text>

      <Text style={styles.sectionTitle}>Action Plan (AI Guided)</Text>
      <View style={styles.guidanceCard}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4ADE80" />
            <Text style={styles.loadingText}>Generating AI recovery plan...</Text>
          </View>
        ) : (
          <Text style={styles.body}>{guidance}</Text>
        )}
      </View>

      <View style={{height: 60}} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0E0F11",
    padding: 20,
    paddingTop: 60,
  },
  backHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },
  backTitle: {
    color: "#E8E9EB",
    fontSize: 18,
    fontFamily: "DMSans-Regular",
    marginLeft: 8,
  },
  headerCard: {
    backgroundColor: "#16181C",
    borderColor: "#F87171",
    borderWidth: 1,
    padding: 20,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    color: "#E8E9EB",
    fontFamily: "DMSans-Regular",
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
  },
  date: {
    color: "#8B8F99",
    fontFamily: "JetBrainsMono-Regular",
    fontSize: 14,
    marginTop: 8,
  },
  sectionTitle: {
    color: "#E8E9EB",
    fontFamily: "DMSans-Regular",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
    marginTop: 12,
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 24,
  },
  dataClassTag: {
    backgroundColor: "#FBBF241A",
    borderColor: "#FBBF24",
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  dataClassText: {
    color: "#FBBF24",
    fontFamily: "JetBrainsMono-Regular",
    fontSize: 12,
    fontWeight: "bold",
  },
  body: {
    color: "#E8E9EB",
    fontFamily: "DMSans-Regular",
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
  },
  guidanceCard: {
    backgroundColor: "#16181C",
    borderColor: "#4ADE80",
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    minHeight: 100,
    justifyContent: "center",
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: "#4ADE80",
    fontFamily: "DMSans-Regular",
    marginTop: 12,
  },
  errorText: {
    color: "#F87171",
    fontSize: 18,
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: "#2A2D35",
    padding: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: "#E8E9EB",
  }
});
