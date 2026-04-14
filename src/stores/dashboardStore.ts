import { create } from "zustand";
import { calculateSafetyScore, getScoreColor } from "../utils/scoreCalculator";

export type SuggestionSource = "scan" | "breach";

export interface TrackedSuggestion {
  id: string;
  text: string;
  acted: boolean;
  source: SuggestionSource;
  sourceId: string;
}

function normalizeSuggestionText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function getSuggestionCounts(suggestions: TrackedSuggestion[]): {
  totalSuggestions: number;
  actedSuggestions: number;
} {
  const totalSuggestions = suggestions.length;
  const actedSuggestions = suggestions.filter((item) => item.acted).length;
  return { totalSuggestions, actedSuggestions };
}

export interface DashboardState {
  activeBreachesCount: number;
  flaggedMessagesScanCount: number;
  totalMessagesScanCount: number;
  protectedImagesCount: number;
  totalSuggestions: number;
  actedSuggestions: number;
  suggestions: TrackedSuggestion[];
  lastUpdateTimestamp: number;

  SafetyScore: number;
  ScoreColor: string;

  updateDashboardData: (
    data:
      | Partial<DashboardState>
      | ((state: DashboardState) => Partial<DashboardState>)
  ) => void;
  incrementProtectedImagesCount: () => void;
  registerSuggestions: (
    source: SuggestionSource,
    sourceId: string,
    suggestionTexts: string[]
  ) => void;
  markSuggestionAsDone: (id: string) => void;
  getSuggestionsForSource: (
    source: SuggestionSource,
    sourceId: string
  ) => TrackedSuggestion[];
  refreshScore: () => void;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  activeBreachesCount: 0,
  flaggedMessagesScanCount: 0,
  totalMessagesScanCount: 0,
  protectedImagesCount: 0,
  totalSuggestions: 0,
  actedSuggestions: 0,
  suggestions: [],
  lastUpdateTimestamp: Date.now(),

  SafetyScore: 100,
  ScoreColor: "#4ADE80", // default safe

  updateDashboardData: (data) => {
    set((state) => {
      const patch = typeof data === "function" ? data(state) : data;
      const nextState = {
        ...state,
        ...patch,
        lastUpdateTimestamp: Date.now(),
      };
      const score = calculateSafetyScore({
        activeBreachesCount: nextState.activeBreachesCount,
        totalMessagesScanCount: nextState.totalMessagesScanCount,
        flaggedMessagesScanCount: nextState.flaggedMessagesScanCount,
        protectedImagesCount: nextState.protectedImagesCount,
        totalSuggestions: nextState.totalSuggestions,
        actedSuggestions: nextState.actedSuggestions,
      });

      return {
        ...nextState,
        SafetyScore: score,
        ScoreColor: getScoreColor(score),
      };
    });
  },

  incrementProtectedImagesCount: () => {
    get().updateDashboardData((state) => ({
      protectedImagesCount: state.protectedImagesCount + 1,
    }));
  },

  registerSuggestions: (source, sourceId, suggestionTexts) => {
    const normalized = suggestionTexts
      .map(normalizeSuggestionText)
      .filter((text) => text.length > 0);

    if (normalized.length === 0) {
      return;
    }

    set((state) => {
      const uniqueIncoming = Array.from(
        new Set(normalized.map((text) => text.toLowerCase()))
      ).map(
        (textLower) =>
          normalized.find((value) => value.toLowerCase() === textLower) as string
      );

      const existingTextSet = new Set(
        state.suggestions
          .filter(
            (suggestion) =>
              suggestion.source === source && suggestion.sourceId === sourceId
          )
          .map((suggestion) => suggestion.text.toLowerCase())
      );

      const additions: TrackedSuggestion[] = uniqueIncoming
        .filter((text) => !existingTextSet.has(text.toLowerCase()))
        .map((text, index) => ({
          id: `${source}-${sourceId}-${Date.now()}-${index}`,
          text,
          acted: false,
          source,
          sourceId,
        }));

      if (additions.length === 0) {
        return state;
      }

      const suggestions = [...state.suggestions, ...additions];
      const { totalSuggestions, actedSuggestions } = getSuggestionCounts(suggestions);
      const score = calculateSafetyScore({
        activeBreachesCount: state.activeBreachesCount,
        totalMessagesScanCount: state.totalMessagesScanCount,
        flaggedMessagesScanCount: state.flaggedMessagesScanCount,
        protectedImagesCount: state.protectedImagesCount,
        totalSuggestions,
        actedSuggestions,
      });

      return {
        ...state,
        suggestions,
        totalSuggestions,
        actedSuggestions,
        lastUpdateTimestamp: Date.now(),
        SafetyScore: score,
        ScoreColor: getScoreColor(score),
      };
    });
  },

  markSuggestionAsDone: (id) => {
    set((state) => {
      const current = state.suggestions.find((suggestion) => suggestion.id === id);
      if (!current || current.acted) {
        return state;
      }

      const suggestions = state.suggestions.map((suggestion) =>
        suggestion.id === id ? { ...suggestion, acted: true } : suggestion
      );
      const { totalSuggestions, actedSuggestions } = getSuggestionCounts(suggestions);
      const score = calculateSafetyScore({
        activeBreachesCount: state.activeBreachesCount,
        totalMessagesScanCount: state.totalMessagesScanCount,
        flaggedMessagesScanCount: state.flaggedMessagesScanCount,
        protectedImagesCount: state.protectedImagesCount,
        totalSuggestions,
        actedSuggestions,
      });

      return {
        ...state,
        suggestions,
        totalSuggestions,
        actedSuggestions,
        lastUpdateTimestamp: Date.now(),
        SafetyScore: score,
        ScoreColor: getScoreColor(score),
      };
    });
  },

  getSuggestionsForSource: (source, sourceId) => {
    return get().suggestions.filter(
      (suggestion) => suggestion.source === source && suggestion.sourceId === sourceId
    );
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
