import React, { useEffect, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  AppState,
  AppStateStatus,
} from "react-native";
import { useRouter } from "expo-router";
import { useDashboardStore } from "../../src/stores/dashboardStore";
import SafetyScoreBar from "../../src/components/SafetyScoreBar";
import FeatureSummaryCard from "../../src/components/FeatureSummaryCard";
import { THEME } from "../../src/constants/theme";

export default function HomeScreen() {
  const router = useRouter();
  const refreshScore = useDashboardStore((state) => state.refreshScore);
  const safetyScore = useDashboardStore((state) => state.SafetyScore);
  const activeBreachesCount = useDashboardStore((state) => state.activeBreachesCount);
  const scannedMessages = useDashboardStore((state) => state.scannedMessages);
  const protectedImagesCount = useDashboardStore((state) => state.protectedImagesCount);
  const lastUpdateTimestamp = useDashboardStore((state) => state.lastUpdateTimestamp);
  const flaggedMessagesScanCount = useMemo(
    () => scannedMessages.filter((message) => message.riskType !== "SAFE").length,
    [scannedMessages]
  );

  useEffect(() => {
    // Refresh score if needed on mount
    refreshScore();

    // Foreground app state listener simulation as per PRD
    const subscription = AppState.addEventListener(
      "change",
      (nextAppState: AppStateStatus) => {
        if (nextAppState === "active") {
          // Trigger updates, background scans, etc.
          refreshScore();
        }
      }
    );

    return () => {
      subscription.remove();
    };
  }, [refreshScore]);

  const timeAgo = (timestamp: number) => {
    const diff = Math.floor((Date.now() - timestamp) / 60000);
    return diff < 1 ? "Just now" : `${diff} min ago`;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.appName}>ThreatLens</Text>
        <Text style={styles.tagline}>
          See risks. Act fast. Stay protected.
        </Text>
      </View>

      <SafetyScoreBar score={safetyScore} />

      <View style={styles.cardsContainer}>
        <FeatureSummaryCard
          title="Data Breaches"
          value={
            activeBreachesCount === 0
              ? "All Clear"
              : `${activeBreachesCount} Found`
          }
          icon="shield-off"
          statusColor={
            activeBreachesCount === 0 ? "#4ADE80" : "#F87171"
          }
          badgeCount={activeBreachesCount}
          timestampText={`Last checked: ${timeAgo(lastUpdateTimestamp)}`}
          onPress={() => router.push("/(tabs)/breach")}
        />

        <FeatureSummaryCard
          title="Message Safety"
          value={`${flaggedMessagesScanCount} Flagged`}
          icon="message-square"
          statusColor={
            flaggedMessagesScanCount === 0 ? "#4ADE80" : "#FBBF24"
          }
          timestampText={`Last 30 days`}
          onPress={() => router.push("/(tabs)/scanner")}
        />

        <FeatureSummaryCard
          title="Image Shield"
          value={`${protectedImagesCount} Protected`}
          icon="image"
          statusColor="#2A2D35" // Neutral outline
          timestampText={`Last 30 days`}
          onPress={() => router.push("/(tabs)/shield")}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  content: {
    padding: 20,
    paddingTop: 56,
    paddingBottom: 96,
  },
  header: {
    marginBottom: 4,
  },
  appName: {
  fontFamily: THEME.fontFamily.dmSans,
  fontSize: 32,
  fontWeight: "700",
  color: THEME.colors.textPrimary,
  letterSpacing: 0.5,
  },

  tagline: {
    marginTop: 6,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 14,
    color: THEME.colors.textSecondary,
    opacity: 0.8,
  },
  subheading: {
    marginTop: 4,
    color: THEME.colors.textSecondary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 14,
  },
  cardsContainer: {
    marginTop: 10,
    gap: 4,
  },
});