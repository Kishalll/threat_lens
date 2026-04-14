import Feather from "@expo/vector-icons/Feather";
import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import { THEME } from "../constants/theme";
import type { ScanResult } from "../types";

type ClassificationCardProps = {
  result: ScanResult;
};

const CLASSIFICATION_COLORS: Record<ScanResult["classification"], string> = {
  SAFE: "#4ADE80",
  SPAM: "#FBBF24",
  SCAM: "#F97316",
  PHISHING: "#F87171",
  UNAVAILABLE: "#8B8F99",
};

const CLASSIFICATION_BACKGROUNDS: Record<ScanResult["classification"], string> = {
  SAFE: "rgba(74,222,128,0.10)",
  SPAM: "rgba(251,191,36,0.10)",
  SCAM: "rgba(249,115,22,0.10)",
  PHISHING: "rgba(248,113,113,0.10)",
  UNAVAILABLE: "rgba(139,143,153,0.12)",
};

function getClassificationIcon(
  classification: ScanResult["classification"]
): "check-circle" | "alert-triangle" | "alert-octagon" | "slash" {
  if (classification === "UNAVAILABLE") {
    return "slash";
  }

  if (classification === "SAFE") {
    return "check-circle";
  }

  if (classification === "PHISHING") {
    return "alert-octagon";
  }

  return "alert-triangle";
}

export default function ClassificationCard({
  result,
}: ClassificationCardProps): ReactElement {
  const accentColor = CLASSIFICATION_COLORS[result.classification];
  const tintColor = CLASSIFICATION_BACKGROUNDS[result.classification];

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: accentColor,
          backgroundColor: tintColor,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={styles.classificationWrap}>
          <Feather
            name={getClassificationIcon(result.classification)}
            size={18}
            color={accentColor}
          />
          <Text style={[styles.classificationLabel, { color: accentColor }]}>
            {result.classification}
          </Text>
        </View>
        <Text style={styles.confidenceText}>{result.confidence.toFixed(1)}%</Text>
      </View>

      <Text style={styles.explanationText}>{result.explanation}</Text>

      <View style={styles.sectionWrap}>
        <Text style={styles.sectionTitle}>Red Flags</Text>
        {result.redFlags.length > 0 ? (
          result.redFlags.map((flag, index) => (
            <Text key={`${flag}-${index}`} style={styles.listText}>
              {`\u2022 ${flag}`}
            </Text>
          ))
        ) : (
          <Text style={styles.listText}>None identified.</Text>
        )}
      </View>

      <View style={styles.sectionWrap}>
        <Text style={styles.sectionTitle}>Suggested Actions</Text>
        {result.suggestedActions.length > 0 ? (
          result.suggestedActions.map((action, index) => (
            <Text key={`${action}-${index}`} style={styles.listText}>
              {`${index + 1}. ${action}`}
            </Text>
          ))
        ) : (
          <Text style={styles.listText}>No immediate action suggested.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: THEME.borderRadius,
    padding: 14,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  classificationWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  classificationLabel: {
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  confidenceText: {
    fontFamily: THEME.fontFamily.jetbrainsMono,
    fontSize: 15,
    color: THEME.colors.textPrimary,
  },
  explanationText: {
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 14,
    color: THEME.colors.textPrimary,
    lineHeight: 20,
  },
  sectionWrap: {
    gap: 6,
  },
  sectionTitle: {
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 14,
    color: THEME.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  listText: {
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 14,
    color: THEME.colors.textPrimary,
    lineHeight: 20,
  },
});