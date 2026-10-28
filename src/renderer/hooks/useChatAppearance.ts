import { useRef } from "react";
import type { ChatAppearancePreferences } from "@shared/chat-appearance";
import { applyChatAppearance, ChatAppearanceController } from "@/lib/chat-appearance";
import { getUiState, setUiState } from "@/lib/web-platform";

export function useChatAppearance(): {
  preferences: ChatAppearancePreferences;
  loaded: boolean;
  saving: boolean;
  update: (preferences: ChatAppearancePreferences) => Promise<void>;
} {
  const controllerRef = useRef<ChatAppearanceController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new ChatAppearanceController({
      read: () => Promise.resolve(getUiState().chatAppearance),
      write: (preferences) => Promise.resolve(setUiState({ chatAppearance: preferences })),
      apply: (preferences) => applyChatAppearance(document.documentElement, preferences),
    });
    void controllerRef.current.load();
  }
  const controller = controllerRef.current;
  const snapshot = controller.snapshotSignal.value;

  return { ...snapshot, update: (preferences) => controller.update(preferences) };
}
