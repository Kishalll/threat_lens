import React, { useState } from "react";
import { StyleSheet, View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { useScannerStore } from "../../src/stores/scannerStore";

export default function ScannerScreen() {
  const router = useRouter();
  const scannerStore = useScannerStore();
  const [textToScan, setTextToScan] = useState("");

  const handleScan = async () => {
    if (textToScan.trim().length === 0) return;
    
    await scannerStore.scanManualText(textToScan.trim());
    setTextToScan("");
    
    // Once scan is done, the history[0] contains the result
    router.push("/scan/result");
  };

  const getStatusColor = (classification: string) => {
    switch (classification) {
      case "SAFE": return "#4ADE80";
      case "SPAM": return "#FBBF24";
      case "SCAM": return "#F87171";
      case "PHISHING": return "#F87171";
      default: return "#8B8F99";
    }
  };

  const getStatusIcon = (classification: string) => {
    switch (classification) {
      case "SAFE": return "shield";
      case "SPAM": return "info";
      case "SCAM": return "alert-triangle";
      case "PHISHING": return "alert-octagon";
      default: return "help-circle";
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Message Scanner</Text>
      
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          multiline
          numberOfLines={6}
          placeholder="Paste or type a message, email, or link here to analyze it for scams or phishing..."
          placeholderTextColor="#8B8F99"
          value={textToScan}
          onChangeText={setTextToScan}
          textAlignVertical="top"
        />
        <Pressable 
          style={[styles.scanButton, (textToScan.trim().length === 0 || scannerStore.isScanning) && styles.disabledButton]} 
          onPress={handleScan}
          disabled={textToScan.trim().length === 0 || scannerStore.isScanning}
        >
          {scannerStore.isScanning ? (
            <ActivityIndicator color="#0E0F11" />
          ) : (
            <Text style={styles.scanButtonText}>Analyze Message</Text>
          )}
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Scan History</Text>
      
      {scannerStore.history.length === 0 ? (
        <Text style={styles.emptyText}>No manual scans yet. Paste a message above.</Text>
      ) : (
        <ScrollView style={styles.historyList}>
          {scannerStore.history.map((record, index) => {
            const statusColor = getStatusColor(record.classification);
            return (
              <Pressable 
                key={record.id} 
                style={[styles.historyCard, index === 0 && { marginTop: 8 }]}
                onPress={() => router.push({ pathname: "/scan/result", params: { index: index.toString() } })}
              >
                <View style={styles.historyHeader}>
                   <View style={styles.historyTitleRow}>
                     <Feather name={getStatusIcon(record.classification)} size={16} color={statusColor} />
                     <Text style={[styles.historyClassification, { color: statusColor }]}>
                       {record.classification} ({record.confidence}%)
                     </Text>
                   </View>
                   <Text style={styles.timestamp}>{new Date(record.timestamp).toLocaleTimeString()}</Text>
                </View>
                <Text style={styles.previewText} numberOfLines={2}>{record.messagePreview}</Text>
              </Pressable>
            );
          })}
          <View style={{height: 20}} />
        </ScrollView>
      )}
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
    marginBottom: 20,
  },
  inputContainer: {
    marginBottom: 24,
  },
  textInput: {
    backgroundColor: "#16181C",
    borderColor: "#2A2D35",
    borderWidth: 1,
    color: "#E8E9EB",
    padding: 16,
    borderRadius: 12,
    fontFamily: "DMSans-Regular",
    fontSize: 16,
    minHeight: 120,
    marginBottom: 16,
  },
  scanButton: {
    backgroundColor: "#4ADE80",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  disabledButton: {
    backgroundColor: "#4ADE8080",
  },
  scanButtonText: {
    color: "#0E0F11",
    fontFamily: "DMSans-Regular",
    fontSize: 16,
    fontWeight: "bold",
  },
  sectionTitle: {
    color: "#E8E9EB",
    fontSize: 18,
    fontFamily: "DMSans-Regular",
    fontWeight: "bold",
    marginBottom: 12,
  },
  historyList: {
    flex: 1,
  },
  historyCard: {
    backgroundColor: "#16181C",
    borderWidth: 1,
    borderColor: "#2A2D35",
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    flexDirection: "column"
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  historyTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  historyClassification: {
    fontFamily: "JetBrainsMono-Regular",
    fontWeight: "bold",
    fontSize: 14,
  },
  timestamp: {
    color: "#8B8F99",
    fontFamily: "JetBrainsMono-Regular",
    fontSize: 10,
  },
  previewText: {
    color: "#8B8F99",
    fontFamily: "DMSans-Regular",
    fontSize: 14,
  },
  emptyText: {
    color: "#8B8F99",
    fontFamily: "DMSans-Regular",
    fontStyle: "italic",
  }
});