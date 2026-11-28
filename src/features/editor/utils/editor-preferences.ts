export interface EditorPreferences {
  lineWrapping: boolean;
  minimapEnabled: boolean;
}

export const DEFAULT_EDITOR_PREFERENCES: EditorPreferences = {
  lineWrapping: false,
  minimapEnabled: true,
};

const STORAGE_PREFIX = "nexus:editor-preferences";
const SCHEMA_VERSION = 1;

interface StoredPayload {
  version: number;
  preferences: {
    lineWrapping?: unknown;
    minimapEnabled?: unknown;
  };
}

export const getEditorPreferencesStorageKey = (userId?: string | null): string => {
  const scopedId = userId && typeof userId === "string" && userId.trim().length > 0
    ? userId.trim()
    : "anonymous";
  return `${STORAGE_PREFIX}:${scopedId}`;
};

export const parseStoredPreferences = (raw: string | null): EditorPreferences => {
  if (!raw) {
    return { ...DEFAULT_EDITOR_PREFERENCES };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ...DEFAULT_EDITOR_PREFERENCES };
    }

    // Support payload structure: either { version, preferences: { ... } } or plain { lineWrapping, minimapEnabled }
    const candidateObj = (parsed as StoredPayload).preferences && typeof (parsed as StoredPayload).preferences === "object"
      ? (parsed as StoredPayload).preferences
      : (parsed as Record<string, unknown>);

    const lineWrapping = typeof candidateObj.lineWrapping === "boolean"
      ? candidateObj.lineWrapping
      : DEFAULT_EDITOR_PREFERENCES.lineWrapping;

    const minimapEnabled = typeof candidateObj.minimapEnabled === "boolean"
      ? candidateObj.minimapEnabled
      : DEFAULT_EDITOR_PREFERENCES.minimapEnabled;

    return {
      lineWrapping,
      minimapEnabled,
    };
  } catch {
    return { ...DEFAULT_EDITOR_PREFERENCES };
  }
};

export const loadEditorPreferences = (userId?: string | null): EditorPreferences => {
  if (typeof window === "undefined" || !window.localStorage) {
    return { ...DEFAULT_EDITOR_PREFERENCES };
  }

  try {
    const key = getEditorPreferencesStorageKey(userId);
    const raw = window.localStorage.getItem(key);
    return parseStoredPreferences(raw);
  } catch {
    return { ...DEFAULT_EDITOR_PREFERENCES };
  }
};

export const saveEditorPreferences = (
  preferences: Partial<EditorPreferences>,
  userId?: string | null
): EditorPreferences => {
  const current = loadEditorPreferences(userId);
  const next: EditorPreferences = {
    lineWrapping: typeof preferences.lineWrapping === "boolean"
      ? preferences.lineWrapping
      : current.lineWrapping,
    minimapEnabled: typeof preferences.minimapEnabled === "boolean"
      ? preferences.minimapEnabled
      : current.minimapEnabled,
  };

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const key = getEditorPreferencesStorageKey(userId);
      const payload: StoredPayload = {
        version: SCHEMA_VERSION,
        preferences: next,
      };
      window.localStorage.setItem(key, JSON.stringify(payload));
    } catch {
      // Ignore localStorage write failures (e.g. quota exceeded or storage disabled)
    }
  }

  return next;
};
