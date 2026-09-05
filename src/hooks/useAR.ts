import { useSyncExternalStore } from "react";
import { arManager } from "@/ar/ARManager";

export function useAR() {
  const state = useSyncExternalStore(arManager.subscribe, arManager.getState, arManager.getState);
  return { ...state, ar: arManager };
}
