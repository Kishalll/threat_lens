import { create } from "zustand";
import { calculateSafetyScore, getScoreColor } from "../utils/scoreCalculator";

export interface DashboardState {
  activeBreachesCount: number;
  flaggedMessagesScanCount: number;
  totalMessagesScanCount: number;
  protectedImagesCount: number;
  totalSuggestions: number;
  actedSuggestions: number;
  lastUpdateTimestamp: number;

  SafetyScore: number;
  ScoreColor: string;

  updateDashboardData: (data: Partial<DashboardState>) => void;
  refreshScore: () => void;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  activeBreachesCount: 0,
  flaggedMessagesScanCount: 0,
  totalMessagesScanCount: 0,
  protectedImagesCount: 0,
  totalSuggestions: 0,
  actedSuggestions: 0,
  lastUpdateTimestamp: Date.now(),

  SafetyScore: 100,
  ScoreColor: "#4ADE80", // default safe

  updateDashboardData: (data) => {
    set((state) => {
      const newState = { ...state, ...data, lastUpdateTimestamp: Date.now() };
      return newState;
    });
    get().refreshScore();
  },

  refreshScore: () => {
    const s = get();
    const score = calculateSafetyScore({
      activeBreachesCount: s.activeBreachesCount,
      totalMessagesScanCount: s.totalMessagesScanCount,
      flaggedMessagesScanCount: s.flaggedMessagesScanCount,
      protectedImagesCount: s.protectedImagesCount,
      totalSuggestions: s.totalSuggestions,
      actedSuggestions: s.actedSuggestions,
    });
    set({ SafetyScore: score, ScoreColor: getScoreColor(score) });
  },
}));
