import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { getScoreColor } from "../utils/scoreCalculator";

interface Props {
  score: number;
}

export default function SafetyScoreBar({ score }: Props) {
  const animatedWidth = useRef(new Animated.Value(0)).current;
  const color = getScoreColor(score);

  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: score,
      duration: 1000,
      useNativeDriver: false,
    }).start();
  }, [score]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Digital Safety Score</Text>
        <Text style={[styles.scoreText, { color }]}>{score} / 100</Text>
      </View>
      <View style={styles.barBackground}>
        <Animated.View
          style={[
            styles.barFill,
            {
              backgroundColor: color,
              width: animatedWidth.interpolate({
                inputRange: [0, 100],
                outputRange: ["0%", "100%"],
              }),
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
    width: "100%",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: {
    color: "#E8E9EB",
    fontFamily: "DMSans-Regular",
    fontSize: 16,
  },
  scoreText: {
    fontFamily: "JetBrainsMono-Regular",
    fontSize: 18,
    fontWeight: "bold",
  },
  barBackground: {
    height: 12,
    backgroundColor: "#16181C",
    borderRadius: 6,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#2A2D35",
  },
  barFill: {
    height: "100%",
    borderRadius: 6,
  },
});
