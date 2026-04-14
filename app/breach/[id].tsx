import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { useBreachStore } from "../../src/stores/breachStore";
import { generateBreachGuidance } from "../../src/services/geminiService";
import { useDashboardStore } from "../../src/stores/dashboardStore";
import { THEME } from "../../src/constants/theme";

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
      <Pressable style={({ pressed }) => [styles.backHeader, pressed && styles.pressedButton]} onPress={() => router.back()}>
        <Feather name="arrow-left" size={22} color={THEME.colors.textPrimary} />
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
            style={({ pressed }) => [styles.secureButton, pressed && styles.pressedButton]}
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
    backgroundColor: THEME.colors.background,
    padding: 20,
    paddingTop: 56,
  },
  backHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: THEME.radius.pill,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surface,
  },
  backTitle: {
    color: THEME.colors.textPrimary,
    fontSize: 15,
    fontFamily: THEME.fontFamily.dmSans,
    marginLeft: 8,
    fontWeight: "700",
  },
  headerCard: {
    backgroundColor: THEME.colors.surface,
    borderColor: `${THEME.colors.danger}88`,
    borderWidth: 1,
    padding: 22,
    borderRadius: THEME.radius.lg,
    alignItems: "center",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 7,
  },
  headerCardResolved: {
    borderColor: `${THEME.colors.accent}88`,
    backgroundColor: `${THEME.colors.accent}14`,
  },
  title: {
    color: THEME.colors.textPrimary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  date: {
    color: THEME.colors.textSecondary,
    fontFamily: THEME.fontFamily.jetbrainsMono,
    fontSize: 14,
    marginTop: 8,
  },
  matchedCredential: {
    color: THEME.colors.textSecondary,
    fontFamily: THEME.fontFamily.jetbrainsMono,
    fontSize: 12,
    marginTop: 10,
  },
  secureButton: {
    borderColor: THEME.colors.accent,
    borderWidth: 1,
    borderRadius: THEME.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 12,
    backgroundColor: `${THEME.colors.accent}22`,
  },
  secureButtonText: {
    color: THEME.colors.accent,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 13,
    fontWeight: "700",
  },
  securedLabel: {
    color: THEME.colors.accent,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 13,
    marginTop: 12,
  },
  sectionTitle: {
    color: THEME.colors.textPrimary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: THEME.typography.h2,
    fontWeight: "700",
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
    backgroundColor: `${THEME.colors.warning}20`,
    borderColor: `${THEME.colors.warning}9A`,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: THEME.radius.pill,
  },
  dataClassText: {
    color: THEME.colors.warning,
    fontFamily: THEME.fontFamily.jetbrainsMono,
    fontSize: 12,
    fontWeight: "700",
  },
  body: {
    color: THEME.colors.textSecondary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 24,
  },
  guidanceCard: {
    backgroundColor: THEME.colors.surface,
    borderColor: THEME.colors.border,
    borderWidth: 1,
    borderRadius: THEME.radius.lg,
    padding: 16,
    minHeight: 100,
    justifyContent: "center",
    gap: 10,
  },
  guidanceText: {
    color: THEME.colors.textPrimary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 15,
    lineHeight: 23,
  },
  suggestionRow: {
    borderWidth: 1,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surfaceMuted,
    borderRadius: THEME.radius.md,
    padding: 12,
    gap: 10,
  },
  doneButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: THEME.colors.accent,
    borderRadius: THEME.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: `${THEME.colors.accent}1F`,
  },
  doneButtonCompleted: {
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surfaceMuted,
  },
  doneButtonText: {
    color: THEME.colors.accent,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 12,
    fontWeight: "700",
  },
  doneButtonTextCompleted: {
    color: THEME.colors.textTertiary,
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: THEME.colors.accent,
    fontFamily: THEME.fontFamily.dmSans,
    marginTop: 12,
  },
  errorText: {
    color: THEME.colors.danger,
    fontSize: 18,
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: THEME.colors.surface,
    padding: 12,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  backButtonText: {
    color: THEME.colors.textPrimary,
  },
  pressedButton: {
    transform: [{ scale: 0.985 }],
  },
});
