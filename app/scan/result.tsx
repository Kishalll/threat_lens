import React, { useEffect, useMemo } from "react";
import { StyleSheet, View, Text, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { useScannerStore } from "../../src/stores/scannerStore";
import { useDashboardStore } from "../../src/stores/dashboardStore";

export default function ScanResultScreen() {
  const { index, id } = useLocalSearchParams<{ index?: string; id?: string }>();
  const router = useRouter();
  const scannerStore = useScannerStore();
  const suggestions = useDashboardStore((state) => state.suggestions);
  const registerSuggestions = useDashboardStore((state) => state.registerSuggestions);
  const markSuggestionAsDone = useDashboardStore((state) => state.markSuggestionAsDone);
  
  const parsedIndex = Number(index);
  const recordById = id ? scannerStore.history.find((item) => item.id === id) : undefined;
  const recordByIndex = Number.isInteger(parsedIndex) ? scannerStore.history[parsedIndex] : undefined;
  const record = recordById ?? recordByIndex ?? scannerStore.history[0];
  const trackedSuggestions = useMemo(
    () =>
      suggestions.filter(
        (suggestion) =>
          suggestion.source === "scan" && suggestion.sourceId === (record?.id ?? "")
      ),
    [suggestions, record?.id]
  );

  useEffect(() => {
    if (!record || record.suggestedActions.length === 0) {
      return;
    }

    registerSuggestions("scan", record.id, record.suggestedActions);
  }, [record, registerSuggestions]);

  if (!record) {
    return (
      <View style={styles.container}>
        <Text style={{color: "#E8E9EB"}}>Scan result not found.</Text>
        <Pressable onPress={() => router.back()} style={{marginTop: 20}}><Text style={{color:"#4ADE80"}}>Go Back</Text></Pressable>
      </View>
    );
  }

  const isUnavailable = record.classification === "UNAVAILABLE";
  const isDangerous = record.classification === "SCAM" || record.classification === "PHISHING";
  const mainColor = isUnavailable ? "#8B8F99" : isDangerous ? "#F87171" : record.classification === "SPAM" ? "#FBBF24" : "#4ADE80";
  const iconName = isUnavailable ? "slash" : isDangerous ? "alert-octagon" : record.classification === "SPAM" ? "info" : "shield";
  return (
    <ScrollView style={styles.container}>
      <Pressable style={styles.backHeader} onPress={() => router.back()}>
        <Feather name="arrow-left" size={24} color="#E8E9EB" />
        <Text style={styles.backTitle}>Back to Scanner</Text>
      </Pressable>

      <View style={[styles.headerCard, { borderColor: mainColor, backgroundColor: `${mainColor}11` }]}>
        <Feather name={iconName} size={48} color={mainColor} style={{marginBottom: 16}} />
        <Text style={styles.classificationTitle}>{record.classification}</Text>
        <Text style={styles.confidenceText}>Confidence: {record.confidence}%</Text>
      </View>

      <Text style={styles.sectionTitle}>AI Analysis</Text>
      <Text style={styles.explanationText}>{record.explanation}</Text>

      {record.redFlags && record.redFlags.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Red Flags Detected</Text>
          <View style={styles.listContainer}>
            {record.redFlags.map((flag, i) => (
              <View key={i} style={styles.listItem}>
                <Feather name="flag" size={16} color="#F87171" />
                <Text style={styles.listText}>{flag}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {trackedSuggestions.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Suggested Actions</Text>
          <View style={styles.listContainer}>
            {trackedSuggestions.map((suggestion) => (
              <View key={suggestion.id} style={styles.listItem}>
                <Feather
                  name={suggestion.acted ? "check-square" : "square"}
                  size={16}
                  color={suggestion.acted ? "#4ADE80" : "#8B8F99"}
                />
                <Text style={styles.listText}>{suggestion.text}</Text>
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
            ))}
          </View>
        </>
      )}

      <Text style={styles.sectionTitle}>Original Message Preview</Text>
      <View style={styles.previewCard}>
        <Text style={styles.previewText}>{record.messagePreview}...</Text>
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
    borderWidth: 1,
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    marginBottom: 24,
  },
  classificationTitle: {
    color: "#E8E9EB",
    fontFamily: "JetBrainsMono-Regular",
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 8,
  },
  confidenceText: {
    color: "#8B8F99",
    fontFamily: "DMSans-Regular",
    fontSize: 16,
  },
  sectionTitle: {
    color: "#E8E9EB",
    fontSize: 18,
    fontFamily: "DMSans-Regular",
    fontWeight: "bold",
    marginBottom: 12,
    marginTop: 8,
  },
  explanationText: {
    color: "#8B8F99",
    fontFamily: "DMSans-Regular",
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
  },
  listContainer: {
    backgroundColor: "#16181C",
    borderWidth: 1,
    borderColor: "#2A2D35",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 12,
  },
  listText: {
    color: "#E8E9EB",
    fontFamily: "DMSans-Regular",
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  doneButton: {
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
  previewCard: {
    backgroundColor: "#16181C",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2A2D35",
  },
  previewText: {
    color: "#8B8F99",
    fontFamily: "JetBrainsMono-Regular",
    fontSize: 12,
    lineHeight: 18,
  }
});
