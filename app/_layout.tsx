import { DMSans_400Regular } from "@expo-google-fonts/dm-sans";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono";
import { Stack, useRouter } from "expo-router";
import { useFonts } from "expo-font";
import * as Linking from "expo-linking";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { initDatabase } from "../src/services/storageService";
import { registerBackgroundFetchTasks } from "../src/services/backgroundTasks";
import { initializeNotificationInterceptor } from "../src/modules/notificationBridge";
import { useScannerStore } from "../src/stores/scannerStore";

const DEBUG = false;

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    "DMSans-Regular": DMSans_400Regular,
    "JetBrainsMono-Regular": JetBrainsMono_400Regular,
  });

  const router = useRouter();

   useEffect(() => {
     void registerBackgroundFetchTasks();
     initializeNotificationInterceptor();

     const handleUrl = (url: string | null) => {
       if (url) {
         try {
           const parsed = Linking.parse(url);
           const textAttr = parsed.queryParams?.text || parsed.queryParams?.['android.intent.extra.TEXT'];
           
           if (textAttr && typeof textAttr === "string") {
             setTimeout(() => {
               void useScannerStore.getState().scanManualText(textAttr);
               router.push("/scan/result");
             }, 500);
           }
         } catch (e) {}
       }
     };

     Linking.getInitialURL().then(handleUrl);
     const subscription = Linking.addEventListener("url", ({ url }: { url: string }) => handleUrl(url));

     void initDatabase().catch((error: unknown) => {
       const typedError =
         error instanceof Error ? error : new Error("Database initialization failed");
       if (DEBUG) console.error("Root initDatabase failed", typedError);
        void typedError;
     });

     return () => {
       subscription.remove();
     }
    }, [router]);


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