"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

import {
  DEFAULT_EDITOR_PREFERENCES,
  EditorPreferences,
  loadEditorPreferences,
  saveEditorPreferences,
} from "../utils/editor-preferences";

const useSafeAuth = (): { userId: string | null | undefined; isLoaded: boolean } => {
  try {
    const auth = useAuth();
    return { userId: auth.userId, isLoaded: auth.isLoaded };
  } catch {
    // Outside of ClerkProvider (e.g. lightweight unit tests)
    return { userId: null, isLoaded: true };
  }
};

export const useEditorPreferences = () => {
  const { userId, isLoaded } = useSafeAuth();
  const [preferences, setPreferences] = useState<EditorPreferences>(DEFAULT_EDITOR_PREFERENCES);

  // Synchronize preferences when userId changes or upon initial mount
  useEffect(() => {
    // If auth state is still loading, wait until resolved so we don't accidentally load anonymous preferences
    if (!isLoaded) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreferences(loadEditorPreferences(userId));
  }, [userId, isLoaded]);

  const updatePreferences = useCallback(
    (updates: Partial<EditorPreferences>) => {
      const next = saveEditorPreferences(updates, userId);
      setPreferences(next);
    },
    [userId]
  );

  const toggleLineWrapping = useCallback(() => {
    updatePreferences({ lineWrapping: !preferences.lineWrapping });
  }, [preferences.lineWrapping, updatePreferences]);

  const toggleMinimap = useCallback(() => {
    updatePreferences({ minimapEnabled: !preferences.minimapEnabled });
  }, [preferences.minimapEnabled, updatePreferences]);

  return {
    preferences,
    lineWrapping: preferences.lineWrapping,
    minimapEnabled: preferences.minimapEnabled,
    updatePreferences,
    toggleLineWrapping,
    toggleMinimap,
  };
};
