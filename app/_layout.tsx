import { DMSans_400Regular } from "@expo-google-fonts/dm-sans";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { initDatabase } from "../src/services/storageService";
import { insertCredential, getCredentials } from "../src/services/storageService";
import { setKey, getKey } from "../src/services/secureKeyService";

const DEBUG = false;

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    "DMSans-Regular": DMSans_400Regular,
    "JetBrainsMono-Regular": JetBrainsMono_400Regular,
  });

   useEffect(() => {
     void initDatabase().catch((error: unknown) => {
       const typedError =
         error instanceof Error ? error : new Error("Database initialization failed");
       if (DEBUG) console.error("Root initDatabase failed", typedError);
        void typedError;
     });
    }, []);


  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: styles.stackContent,
          }}
        />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0E0F11",
  },
  stackContent: {
    backgroundColor: "#0E0F11",
  },
});

void DEBUG;