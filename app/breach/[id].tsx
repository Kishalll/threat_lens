import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { useBreachStore } from "../../src/stores/breachStore";
import { generateBreachGuidance } from "../../src/services/geminiService";
import { useDashboardStore } from "../../src/stores/dashboardStore";

function parseGuidanceSuggestions(guidance: string): string[] {
  const lines = guidance
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, "").trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0 && guidance.trim().length > 0) {
    return [guidance.trim()];
  }

  const seen = new Set<string>();
  const unique: string[] = [];

  for (const line of lines) {
    const key = line.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(line);
    }
  }

  return unique;
}

export default function BreachDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const breachStore = useBreachStore();
  const suggestions = useDashboardStore((state) => state.suggestions);
  const registerSuggestions = useDashboardStore((state) => state.registerSuggestions);
  const markSuggestionAsDone = useDashboardStore((state) => state.markSuggestionAsDone);
  
  const breach = breachStore.breaches.find(b => b.id === id);
  const breachSuggestions = useMemo(
    () =>
      suggestions.filter(
        (suggestion) =>
          suggestion.source === "breach" && suggestion.sourceId === (breach?.id ?? "")
      ),
    [suggestions, breach?.id]
  );
  
  const [guidance, setGuidance] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (breach) {
      let isCancelled = false;
      setLoading(true);
      generateBreachGuidance(breach).then((result) => {
        if (isCancelled) {
          return;
        }

        setGuidance(result);
        setLoading(false);
      });

      return () => {
        isCancelled = true;
      };
    }
  }, [breach]);

  useEffect(() => {
    if (!breach || loading || guidance.trim().length === 0) {
      return;
    }

    registerSuggestions("breach", breach.id, parseGuidanceSuggestions(guidance));
  }, [breach, guidance, loading, registerSuggestions]);

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

      <View style={[styles.headerCard, breach.resolved && styles.headerCardResolved]}>
        <Feather
          name={breach.resolved ? "check-circle" : "alert-triangle"}
          size={32}
          color={breach.resolved ? "#4ADE80" : "#F87171"}
          style={{marginBottom: 12}}
        />
        <Text style={styles.title}>{breach.name}</Text>
        <Text style={styles.date}>Occurred: {new Date(breach.date).toLocaleDateString()}</Text>
        {!!breach.matchedCredential && (
          <Text style={styles.matchedCredential}>
            Matched {breach.matchedCredentialType ?? "credential"}: {breach.matchedCredential}
          </Text>
        )}
        {!breach.resolved ? (
          <Pressable
            style={styles.secureButton}
            onPress={() => breachStore.markBreachAsResolved(breach.id)}
          >
            <Text style={styles.secureButtonText}>Mark as Secured</Text>
          </Pressable>
        ) : (
          <Text style={styles.securedLabel}>This breach is marked as secured.</Text>
        )}
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
        ) : breachSuggestions.length > 0 ? (
          breachSuggestions.map((suggestion) => (
            <View key={suggestion.id} style={styles.suggestionRow}>
              <Text style={styles.guidanceText}>{suggestion.text}</Text>
              <Pressable
                style={[
                  styles.doneButton,
                  suggestion.acted && styles.doneButtonCompleted,
                ]}
                onPress={() => markSuggestionAsDone(suggestion.id)}
                disabled={suggestion.acted}
              >
                <Text
                  style={[
                    styles.doneButtonText,
                    suggestion.acted && styles.doneButtonTextCompleted,
                  ]}
                >
                  {suggestion.acted ? "Done" : "Mark as Done"}
                </Text>
              </Pressable>
            </View>
          ))
        ) : (
          <Text style={styles.guidanceText}>{guidance}</Text>
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
  headerCardResolved: {
    borderColor: "#4ADE80",
    backgroundColor: "#4ADE8012",
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
  matchedCredential: {
    color: "#E8E9EB",
    fontFamily: "JetBrainsMono-Regular",
    fontSize: 12,
    marginTop: 10,
  },
  secureButton: {
    borderColor: "#4ADE80",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 12,
  },
  secureButtonText: {
    color: "#4ADE80",
    fontFamily: "DMSans-Regular",
    fontSize: 13,
    fontWeight: "bold",
  },
  securedLabel: {
    color: "#4ADE80",
    fontFamily: "DMSans-Regular",
    fontSize: 13,
    marginTop: 12,
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
    gap: 10,
  },
  guidanceText: {
    color: "#E8E9EB",
    fontFamily: "DMSans-Regular",
    fontSize: 16,
    lineHeight: 24,
  },
  suggestionRow: {
    borderWidth: 1,
    borderColor: "#2A2D35",
    backgroundColor: "#121419",
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  doneButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#4ADE80",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  doneButtonCompleted: {
    borderColor: "#2A2D35",
    backgroundColor: "#2A2D35",
  },
  doneButtonText: {
    color: "#4ADE80",
    fontFamily: "DMSans-Regular",
    fontSize: 12,
    fontWeight: "bold",
  },
  doneButtonTextCompleted: {
    color: "#8B8F99",
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
