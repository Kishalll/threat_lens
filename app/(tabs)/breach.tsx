import React, { useState } from "react";
import { StyleSheet, View, Text, ScrollView, Pressable, TextInput, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { useBreachStore } from "../../src/stores/breachStore";

export default function BreachScreen() {
  const router = useRouter();
  const breachStore = useBreachStore();
  const [newEmail, setNewEmail] = useState("");

  const handleAddCredential = () => {
    if (newEmail.trim().length > 3) {
      breachStore.addCredential(newEmail.trim(), newEmail.includes("@") ? "email" : "username");
      setNewEmail("");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Data Breaches</Text>
      
      <View style={styles.addSection}>
        <TextInput
          style={styles.input}
          placeholder="Add email or username to monitor"
          placeholderTextColor="#8B8F99"
          value={newEmail}
          onChangeText={setNewEmail}
          autoCapitalize="none"
        />
        <Pressable style={styles.addButton} onPress={handleAddCredential}>
          <Feather name="plus" size={24} color="#0E0F11" />
        </Pressable>
      </View>

      <ScrollView style={styles.listContainer}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Active Monitored Accounts</Text>
        </View>
        
        {breachStore.credentials.length === 0 ? (
          <Text style={styles.emptyText}>No accounts monitored.</Text>
        ) : (
          breachStore.credentials.map((cred) => (
            <View key={cred.id} style={styles.credentialRow}>
              <Text style={styles.credentialText}>{cred.value}</Text>
              <Pressable onPress={() => breachStore.removeCredential(cred.id)}>
                <Feather name="trash-2" size={20} color="#F87171" />
              </Pressable>
            </View>
          ))
        )}

        <View style={[styles.sectionHeader, { marginTop: 24 }]}>
          <Text style={styles.sectionTitle}>Detected Breaches</Text>
          <Pressable onPress={() => breachStore.runScan()}>
             {breachStore.isScanning ? (
                <ActivityIndicator size="small" color="#4ADE80" />
             ) : (
                <Feather name="refresh-cw" size={20} color="#4ADE80" />
             )}
          </Pressable>
        </View>

        {breachStore.breaches.length === 0 && !breachStore.isScanning ? (
          <Text style={styles.safeText}>No breaches detected! You are secure.</Text>
        ) : (
          breachStore.breaches.map((breach) => (
            <Pressable 
              key={breach.id} 
              style={styles.breachCard}
              onPress={() => router.push(`/breach/${breach.id}`)}
            >
              <View style={styles.breachHeader}>
                <Feather name="alert-triangle" size={20} color="#F87171" style={{ marginRight: 8 }} />
                <Text style={styles.breachName}>{breach.name}</Text>
              </View>
              <Text style={styles.breachDate}>Date: {new Date(breach.date).toLocaleDateString()}</Text>
              <Text style={styles.breachDataTypes}>
                Leaked: {breach.dataClasses.join(", ")}
              </Text>
              <Text style={styles.tapToView}>Tap to view guidance ›</Text>
            </Pressable>
          ))
        )}
        <View style={{height: 40}} />
      </ScrollView>
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
  addSection: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  input: {
    flex: 1,
    backgroundColor: "#16181C",
    borderWidth: 1,
    borderColor: "#2A2D35",
    color: "#E8E9EB",
    padding: 12,
    borderRadius: 8,
    fontFamily: "DMSans-Regular",
  },
  addButton: {
    backgroundColor: "#4ADE80",
    width: 48,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  listContainer: {
    flex: 1,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2D35",
  },
  sectionTitle: {
    color: "#E8E9EB",
    fontSize: 18,
    fontFamily: "DMSans-Regular",
    fontWeight: "bold",
  },
  credentialRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#16181C",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#2A2D35",
  },
  credentialText: {
    color: "#E8E9EB",
    fontFamily: "JetBrainsMono-Regular",
    fontSize: 14,
  },
  emptyText: {
    color: "#8B8F99",
    fontFamily: "DMSans-Regular",
    fontStyle: "italic",
    marginBottom: 16,
  },
  safeText: {
    color: "#4ADE80",
    fontFamily: "DMSans-Regular",
    marginTop: 8,
  },
  breachCard: {
    backgroundColor: "#16181C",
    borderColor: "#F87171",
    borderWidth: 1,
    padding: 16,
    borderRadius: 10,
    marginBottom: 12,
  },
  breachHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  breachName: {
    color: "#E8E9EB",
    fontFamily: "DMSans-Regular",
    fontSize: 18,
    fontWeight: "bold",
  },
  breachDate: {
    color: "#8B8F99",
    fontFamily: "JetBrainsMono-Regular",
    fontSize: 12,
    marginBottom: 4,
  },
  breachDataTypes: {
    color: "#FBBF24",
    fontFamily: "DMSans-Regular",
    fontSize: 14,
    marginBottom: 8,
  },
  tapToView: {
    color: "#4ADE80",
    fontFamily: "DMSans-Regular",
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "right",
  }
});