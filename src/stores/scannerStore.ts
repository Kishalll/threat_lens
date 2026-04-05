import { create } from "zustand";
import { ScanResult } from "../types";
import { classifyMessage } from "../services/geminiService";
import { useDashboardStore } from "./dashboardStore";

export interface ScannerState {
  history: ScanResult[];
  isScanning: boolean;
  
  scanManualText: (text: string) => Promise<ScanResult>;
  clearHistory: () => void;
}

export const useScannerStore = create<ScannerState>()((set, get) => ({
  history: [],
  isScanning: false,

  scanManualText: async (text: string) => {
    set({ isScanning: true });
    try {
      const result = await classifyMessage(text);
      
      set((state) => ({
        history: [result, ...state.history],
        isScanning: false
      }));

      // Update Dashboard score metrics
      const dash = useDashboardStore.getState();
      dash.updateDashboardData({
        totalMessagesScanCount: dash.totalMessagesScanCount + 1,
        flaggedMessagesScanCount: 
          (result.classification === "SCAM" || result.classification === "PHISHING") 
            ? dash.flaggedMessagesScanCount + 1 
            : dash.flaggedMessagesScanCount
      });

      return result;
    } catch (error) {
      console.error(error);
      set({ isScanning: false });
      throw error;
    }
  },

  clearHistory: () => set({ history: [] })
}));