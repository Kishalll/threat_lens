import { create } from "zustand";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import { BreachApiItem, checkAllCredentials } from "../services/breachApiService";
import {
  getCachedBreaches,
  getCredentials,
  replaceCachedBreaches,
  replaceCredentials,
  type StoredCredential,
} from "../services/storageService";
import { sendLocalNotification } from "../services/notificationService";
import { useDashboardStore } from "./dashboardStore";

// Type mapping for credentials
export type Credential = {
  id: string;
  value: string; // emails or usernames
  type: "email" | "username";
};

export interface BreachState {
  credentials: Credential[];
  breaches: BreachApiItem[];
  isScanning: boolean;
  lastScanTimestamp: number;
  scanError: string | null;
  isHydrated: boolean;
  
  addCredential: (value: string, type: "email" | "username") => void;
  removeCredential: (id: string) => void;
  markBreachAsResolved: (id: string) => void;
  syncBreachResolutionFromSuggestions: (resolutionById: Record<string, boolean>) => void;
  runScan: (options?: { notifyOnNew?: boolean }) => Promise<void>;
  hydrateFromStorage: () => Promise<void>;
}

function sortBreachesNewestFirst(breaches: BreachApiItem[]): BreachApiItem[] {
  return [...breaches].sort((a, b) => {
    const aTime = new Date(a.date).getTime();
    const bTime = new Date(b.date).getTime();
    return bTime - aTime;
  });
}

function toStoredCredentials(credentials: Credential[]): StoredCredential[] {
  return credentials.map((credential) => ({
    id: credential.id,
    value: credential.value,
    type: credential.type,
  }));
}

function formatCredentialSummary(breaches: BreachApiItem[]): string {
  const values = Array.from(
    new Set(
      breaches
        .map((breach) => breach.matchedCredential)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    )
  );

  if (values.length === 0) {
    return "your monitored accounts";
  }

  if (values.length === 1) {
    return values[0];
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values[0]}, ${values[1]}, and ${values.length - 2} more`;
}

function countActiveBreaches(breaches: BreachApiItem[]): number {
  return breaches.filter((breach) => !breach.resolved).length;
}

function applyResolvedState(
  breaches: BreachApiItem[],
  resolvedById: Map<string, boolean>
): BreachApiItem[] {
  return breaches.map((breach) => ({
    ...breach,
    resolved: resolvedById.get(breach.id) ?? Boolean(breach.resolved),
  }));
}

export const useBreachStore = create<BreachState>()((set, get) => ({
  credentials: [],
  breaches: [],
  isScanning: false,
  lastScanTimestamp: 0,
  scanError: null,
  isHydrated: false,

  addCredential: (value, type) => {
    const normalized = value.trim();
    if (!normalized) {
      return;
    }

    set((state) => {
      const exists = state.credentials.find(
        (c) => c.value.toLowerCase() === normalized.toLowerCase()
      );
      if (exists) return state;

      const nextCredentials = [
        ...state.credentials,
        { id: uuidv4(), value: normalized, type },
      ];

      void replaceCredentials(toStoredCredentials(nextCredentials));

      return {
        credentials: nextCredentials,
        scanError: null,
      };
    });

    // Start scan on credential add
    void get().runScan({ notifyOnNew: true });
  },

  removeCredential: (id) => {
    let nextActiveBreachesCount = 0;

    set((state) => {
      const nextCredentials = state.credentials.filter((c) => c.id !== id);
      const allowedValues = new Set(nextCredentials.map((credential) => credential.value));
      const nextBreaches = state.breaches.filter((breach) => {
        if (!breach.matchedCredential) {
          return true;
        }
        return allowedValues.has(breach.matchedCredential);
      });

      nextActiveBreachesCount = countActiveBreaches(nextBreaches);

      void replaceCredentials(toStoredCredentials(nextCredentials));
      void replaceCachedBreaches(nextBreaches);

      return {
        credentials: nextCredentials,
        breaches: nextBreaches,
      };
    });

    useDashboardStore.getState().updateDashboardData({
      activeBreachesCount: nextActiveBreachesCount,
    });
  },

  markBreachAsResolved: (id) => {
    let didUpdate = false;
    let nextActiveBreachesCount = 0;

    set((state) => {
      const target = state.breaches.find((breach) => breach.id === id);
      if (!target || target.resolved) {
        return state;
      }

      didUpdate = true;
      const breaches = state.breaches.map((breach) =>
        breach.id === id ? { ...breach, resolved: true } : breach
      );

      nextActiveBreachesCount = countActiveBreaches(breaches);

      void replaceCachedBreaches(breaches);

      return {
        ...state,
        breaches,
      };
    });

    if (didUpdate) {
      useDashboardStore.getState().updateDashboardData({
        activeBreachesCount: nextActiveBreachesCount,
      });
    }
  },

  syncBreachResolutionFromSuggestions: (resolutionById) => {
    let didUpdate = false;
    let nextActiveBreachesCount = 0;

    set((state) => {
      const nextBreaches = state.breaches.map((breach) => {
        const nextResolved = resolutionById[breach.id];
        if (typeof nextResolved !== "boolean") {
          return breach;
        }

        if (Boolean(breach.resolved) === nextResolved) {
          return breach;
        }

        didUpdate = true;
        return {
          ...breach,
          resolved: nextResolved,
        };
      });

      if (!didUpdate) {
        return state;
      }

      nextActiveBreachesCount = countActiveBreaches(nextBreaches);
      void replaceCachedBreaches(nextBreaches);

      return {
        ...state,
        breaches: nextBreaches,
      };
    });

    if (didUpdate) {
      useDashboardStore.getState().updateDashboardData({
        activeBreachesCount: nextActiveBreachesCount,
      });
    }
  },

  hydrateFromStorage: async () => {
    try {
      const [credentials, breaches] = await Promise.all([
        getCredentials(),
        getCachedBreaches(),
      ]);

      const sortedBreaches = sortBreachesNewestFirst(breaches).map((breach) => ({
        ...breach,
        resolved: Boolean(breach.resolved),
      }));

      set({
        credentials,
        breaches: sortedBreaches,
        isHydrated: true,
      });

      useDashboardStore.getState().updateDashboardData({
        activeBreachesCount: countActiveBreaches(sortedBreaches),
      });
    } catch (error) {
      console.error("Failed to hydrate breach data", error);
      set({ isHydrated: true });
    }
  },

  runScan: async (options = {}) => {
    const notifyOnNew = options.notifyOnNew === true;
    const currentCredentials = get().credentials;

    if (currentCredentials.length === 0) {
      set({ breaches: [], isScanning: false, scanError: null });
      void replaceCachedBreaches([]);
      useDashboardStore.getState().updateDashboardData({
        activeBreachesCount: 0,
      });
      return;
    }

    set({ isScanning: true, scanError: null });
    
    try {
      const previousBreaches = get().breaches;
      const previousIds = new Set(previousBreaches.map((breach) => breach.id));
      const resolvedById = new Map(
        previousBreaches.map((breach) => [breach.id, Boolean(breach.resolved)])
      );

      const itemsToScan = get().credentials.map((c) => c.value);
      const results = await checkAllCredentials(itemsToScan);
      const sortedResults = applyResolvedState(
        sortBreachesNewestFirst(results),
        resolvedById
      );
      const newBreaches = sortedResults.filter((breach) => !previousIds.has(breach.id));
      
      set({ 
        breaches: sortedResults,
        lastScanTimestamp: Date.now(),
        isScanning: false,
        scanError: null,
      });

      void replaceCachedBreaches(sortedResults);
      void replaceCredentials(toStoredCredentials(get().credentials));

      // Update the dashboard store with the count
      useDashboardStore.getState().updateDashboardData({
        activeBreachesCount: countActiveBreaches(sortedResults)
      });

      if (notifyOnNew && newBreaches.length > 0) {
        const credentialSummary = formatCredentialSummary(newBreaches);
        await sendLocalNotification(
          "New Data Breach Detected",
          `New breach data found for ${credentialSummary}. Tap to review in Breach tab.`,
          {
            type: "BREACH_ALERT",
            breachIds: newBreaches.map((breach) => breach.id),
            credentials: newBreaches
              .map((breach) => breach.matchedCredential)
              .filter((value): value is string => typeof value === "string" && value.length > 0),
            threatlensInternal: true,
          }
        );
      }

    } catch (error) {
      console.error("Scan failed", error);
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Breach data fetch failed. Please try again.";

      set({
        breaches: [],
        isScanning: false,
        scanError: `${message} Please try again.`,
      });

      void replaceCachedBreaches([]);
      useDashboardStore.getState().updateDashboardData({
        activeBreachesCount: 0,
      });
    }
  }
}));
