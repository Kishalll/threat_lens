import React, { useEffect } from "react";
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

export default function HomeScreen() {
  const router = useRouter();
  const refreshScore = useDashboardStore((state) => state.refreshScore);
  const safetyScore = useDashboardStore((state) => state.SafetyScore);
  const activeBreachesCount = useDashboardStore((state) => state.activeBreachesCount);
  const flaggedMessagesScanCount = useDashboardStore((state) => state.flaggedMessagesScanCount);
  const protectedImagesCount = useDashboardStore((state) => state.protectedImagesCount);
  const lastUpdateTimestamp = useDashboardStore((state) => state.lastUpdateTimestamp);

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
        <Text style={styles.greeting}>Digital Safety Overview</Text>
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
    backgroundColor: "#0E0F11",
  },
  content: {
    padding: 20,
    paddingTop: 60,
  },
  header: {
    marginBottom: 10,
  },
  greeting: {
    fontFamily: "DMSans-Regular",
    fontSize: 24,
    color: "#E8E9EB",
    fontWeight: "bold",
  },
  cardsContainer: {
    marginTop: 20,
    gap: 0,
  },
});