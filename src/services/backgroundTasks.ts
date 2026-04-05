import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { useBreachStore } from "../stores/breachStore";
import { sendLocalNotification } from "./notificationService";
import { checkAllCredentials } from "./breachApiService";

const BREACH_CHECK_TASK = "BACKGROUND_BREACH_CHECK";

TaskManager.defineTask(BREACH_CHECK_TASK, async () => {
  try {
    const credentials = useBreachStore.getState().credentials;
    if (credentials.length === 0) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const itemsToCheck = credentials.map(c => c.value);
    
    // Remember previous breach IDs to detect new ones
    const previousBreaches = useBreachStore.getState().breaches;
    const prevIds = new Set(previousBreaches.map(b => b.id));

    const results = await checkAllCredentials(itemsToCheck);
    
    // Update state
    useBreachStore.setState({ breaches: results, lastScanTimestamp: Date.now() });

    // Check for NEW breaches
    const newBreaches = results.filter(b => !prevIds.has(b.id));

    if (newBreaches.length > 0) {
      // Fire local notification
      await sendLocalNotification(
        "New Data Breach Detected",
        `${newBreaches.length} new breach(es) found affecting your monitored accounts. Tap to secure.`,
        { type: "BREACH_ALERT", breachIds: newBreaches.map(b => b.id) }
      );
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }

    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (error) {
    console.error("Background fetch failed", error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundFetchTasks() {
  try {
    await BackgroundFetch.registerTaskAsync(BREACH_CHECK_TASK, {
      minimumInterval: 60 * 60, // 1 hour (in seconds)
      stopOnTerminate: false,
      startOnBoot: true,
    });
    console.log("Registered breach check background task");
  } catch (err) {
    console.error("Task Register failed:", err);
  }
}
