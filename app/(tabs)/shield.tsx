import { StyleSheet, Text, View } from "react-native";

export default function ShieldScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Shield</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0E0F11",
  },
  title: {
    color: "#E8E9EB",
    fontSize: 20,
  },
});