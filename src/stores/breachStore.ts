import { create } from "zustand";
import { BreachApiItem, checkAllCredentials } from "../services/breachApiService";
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
  
  addCredential: (value: string, type: "email" | "username") => void;
  removeCredential: (id: string) => void;
  runScan: () => Promise<void>;
}

export const useBreachStore = create<BreachState>()((set, get) => ({
  credentials: [],
  breaches: [],
  isScanning: false,
  lastScanTimestamp: 0,

  addCredential: (value, type) => {
    set((state) => {
      const exists = state.credentials.find((c) => c.value === value);
      if (exists) return state;
      return {
        credentials: [...state.credentials, { id: Math.random().toString(), value, type }]
      };
    });
    // Start scan on credential add
    get().runScan();
  },

  removeCredential: (id) => {
    set((state) => ({
      credentials: state.credentials.filter((c) => c.id !== id)
    }));
  },

  runScan: async () => {
    set({ isScanning: true });
    
    try {
      const itemsToScan = get().credentials.map((c) => c.value);
      const results = await checkAllCredentials(itemsToScan);
      
      set({ 
        breaches: results,
        lastScanTimestamp: Date.now(),
        isScanning: false
      });

      // Update the dashboard store with the count
      useDashboardStore.getState().updateDashboardData({
        activeBreachesCount: results.length
      });

    } catch (error) {
      console.error("Scan failed", error);
      set({ isScanning: false });
    }
  }
}));
