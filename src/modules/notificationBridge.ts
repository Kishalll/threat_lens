import { NativeModules, NativeEventEmitter, Platform } from "react-native";
import { classifyMessage } from "../services/geminiService";
import { sendLocalNotification } from "../services/notificationService";
import { useDashboardStore } from "../stores/dashboardStore";

// Get the native module
const { NotificationModule } = NativeModules;

// Create event emitter
export const notificationEmitter = NotificationModule 
  ? new NativeEventEmitter(NotificationModule)
  : null;

/**
 * Initializes the React Native listener that intercepts events from the Kotlin NotificationService
 */
export function initializeNotificationInterceptor() {
  if (Platform.OS !== "android" || !notificationEmitter) {
    console.warn("Notification interceptor is only supported on Android or NativeModule not found.");
    return;
  }

  console.log("Initializing React Native Notification Interceptor");

  notificationEmitter.addListener("NotificationReceived", async (event: any) => {
    const { packageName, text, isTruncated } = event;
    console.log(`Intercepted notification from ${packageName}`);

    if (text.length < 10) return; // Ignore very short notifications

    // Classify using Gemini
    const result = await classifyMessage(text);
    
    // Auto-save to a store or standard callback needed here, but for now we focus on the alert
    useDashboardStore.getState().updateDashboardData({
      totalMessagesScanCount: useDashboardStore.getState().totalMessagesScanCount + 1
    });

    if (result.classification === "SCAM" || result.classification === "PHISHING") {
      
      useDashboardStore.getState().updateDashboardData({
        flaggedMessagesScanCount: useDashboardStore.getState().flaggedMessagesScanCount + 1
      });

      // Fire a local warning notification
      await sendLocalNotification(
        "Warning: Malicious Message Detected",
        `We detected a potential ${result.classification} from ${packageName}. Do not click any links!`,
        { type: "SCAM_ALERT", text }
      );
    }
  });
}
