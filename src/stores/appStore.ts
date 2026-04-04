import { create } from "zustand";

type AppState = {
  isLoading: boolean;
  setLoading: (v: boolean) => void;
};

export const useAppStore = create<AppState>()((set) => ({
  isLoading: false,
  setLoading: (v: boolean) =>
    set(() => ({
      isLoading: v,
    })),
}));