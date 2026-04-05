import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Feather from "@expo/vector-icons/Feather";

interface Props {
  title: string;
  value: string | number;
  icon: keyof typeof Feather.glyphMap;
  statusColor: string;
  onPress: () => void;
  timestampText?: string;
  badgeCount?: number;
}

export default function FeatureSummaryCard({
  title,
  value,
  icon,
  statusColor,
  onPress,
  timestampText,
  badgeCount,
}: Props) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: `${statusColor}1A`, // 10% opacity hex
          borderColor: statusColor !== "#2A2D35" ? statusColor : "#2A2D35",
          opacity: pressed ? 0.8 : 1,
        },
      ]}
      onPress={onPress}
    >
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Feather name={icon} size={20} color={statusColor} />
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.valueContainer}>
          <Text style={styles.value}>{value}</Text>
          {badgeCount !== undefined && badgeCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badgeCount}</Text>
            </View>
          )}
        </View>
      </View>
      {timestampText && (
        <View style={styles.footer}>
          <Text style={styles.timestamp}>{timestampText}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    width: "100%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  iconContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    color: "#E8E9EB",
    fontFamily: "DMSans-Regular",
    fontSize: 16,
  },
  valueContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  value: {
    color: "#E8E9EB",
    fontFamily: "JetBrainsMono-Regular",
    fontSize: 16,
  },
  badge: {
    backgroundColor: "#F87171",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#0E0F11",
    fontSize: 12,
    fontWeight: "bold",
    fontFamily: "JetBrainsMono-Regular",
  },
  footer: {
    marginTop: 12,
  },
  timestamp: {
    color: "#8B8F99",
    fontSize: 12,
    fontFamily: "DMSans-Regular",
  },
});
