import { create } from "zustand";

import { Id } from "../../../../convex/_generated/dataModel";

export interface TabData {
  buffer: string;
  savedContent: string;
  savedUpdatedAt?: number;
  isDirty: boolean;
  isSaving: boolean;
  saveError: string | null;
  remoteContent: string | null;
  remoteUpdatedAt?: number;
  hasConflict: boolean;
}

interface TabState {
  openTabs: Id<"files">[];
  activeTabId: Id<"files"> | null;
  previewTabId: Id<"files"> | null;
  tabData: Map<Id<"files">, TabData>;
}

const defaultTabState: TabState = {
  openTabs: [],
  activeTabId: null,
  previewTabId: null,
  tabData: new Map(),
};

interface EditorStore {
  tabs: Map<Id<"projects">, TabState>;
  getTabState: (projectId: Id<"projects">) => TabState;
  getTabData: (projectId: Id<"projects">, fileId: Id<"files">) => TabData | undefined;
  isFileDirty: (projectId: Id<"projects">, fileId: Id<"files">) => boolean;
  hasDirtyTabs: (projectId?: Id<"projects">) => boolean;

  openFile: (
    projectId: Id<"projects">,
    fileId: Id<"files">,
    options: { pinned: boolean; initialContent?: string; updatedAt?: number }
  ) => void;
  closeTab: (projectId: Id<"projects">, fileId: Id<"files">) => void;
  closeAllTabs: (projectId: Id<"projects">) => void;
  setActiveTab: (projectId: Id<"projects">, fileId: Id<"files">) => void;
  reorderTabs: (
    projectId: Id<"projects">,
    fileId: Id<"files">,
    targetFileId: Id<"files">,
    position: "before" | "after"
  ) => void;

  initFileContent: (
    projectId: Id<"projects">,
    fileId: Id<"files">,
    content: string,
    updatedAt?: number
  ) => void;
  updateBuffer: (
    projectId: Id<"projects">,
    fileId: Id<"files">,
    content: string
  ) => void;
  markSavingStart: (
    projectId: Id<"projects">,
    fileId: Id<"files">
  ) => string | null;
  markSavingSuccess: (
    projectId: Id<"projects">,
    fileId: Id<"files">,
    savedContent: string,
    updatedAt?: number
  ) => void;
  markSavingError: (
    projectId: Id<"projects">,
    fileId: Id<"files">,
    error: string
  ) => void;
  handleRemoteUpdate: (
    projectId: Id<"projects">,
    fileId: Id<"files">,
    remoteContent: string,
    remoteUpdatedAt?: number
  ) => { action: "updated" | "conflict" | "ignored" };
  resolveConflictKeepLocal: (
    projectId: Id<"projects">,
    fileId: Id<"files">
  ) => void;
  resolveConflictAcceptRemote: (
    projectId: Id<"projects">,
    fileId: Id<"files">
  ) => void;
}

export const useEditorStore = create<EditorStore>()((set, get) => ({
  tabs: new Map(),

  getTabState: (projectId) => {
    return get().tabs.get(projectId) ?? defaultTabState;
  },

  getTabData: (projectId, fileId) => {
    const tabState = get().tabs.get(projectId);
    return tabState?.tabData.get(fileId);
  },

  isFileDirty: (projectId, fileId) => {
    const tabData = get().getTabData(projectId, fileId);
    return tabData?.isDirty ?? false;
  },

  hasDirtyTabs: (projectId) => {
    const { tabs } = get();
    if (projectId) {
      const state = tabs.get(projectId);
      if (!state) return false;
      for (const tabId of state.openTabs) {
        if (state.tabData.get(tabId)?.isDirty) return true;
      }
      return false;
    }
    for (const [, state] of tabs) {
      for (const tabId of state.openTabs) {
        if (state.tabData.get(tabId)?.isDirty) return true;
      }
    }
    return false;
  },

  openFile: (projectId, fileId, { pinned, initialContent, updatedAt }) => {
    const tabs = new Map(get().tabs);
    const state = tabs.get(projectId) ?? defaultTabState;
    const { openTabs, previewTabId, tabData } = state;
    const newTabData = new Map(tabData);
    const isOpen = openTabs.includes(fileId);

    if (!newTabData.has(fileId) && initialContent !== undefined) {
      newTabData.set(fileId, {
        buffer: initialContent,
        savedContent: initialContent,
        savedUpdatedAt: updatedAt,
        isDirty: false,
        isSaving: false,
        saveError: null,
        remoteContent: null,
        remoteUpdatedAt: undefined,
        hasConflict: false,
      });
    }

    // Case 1: Opening as preview - replace existing preview or add new
    if (!isOpen && !pinned) {
      const newTabs = previewTabId
        ? openTabs.map((id) => (id === previewTabId ? fileId : id))
        : [...openTabs, fileId];

      if (previewTabId && previewTabId !== fileId) {
        const prevData = newTabData.get(previewTabId);
        if (prevData && !prevData.isDirty) {
          newTabData.delete(previewTabId);
        }
      }

      tabs.set(projectId, {
        openTabs: newTabs,
        activeTabId: fileId,
        previewTabId: fileId,
        tabData: newTabData,
      });
      set({ tabs });
      return;
    }

    // Case 2: Opening as pinned - add new tab
    if (!isOpen && pinned) {
      tabs.set(projectId, {
        ...state,
        openTabs: [...openTabs, fileId],
        activeTabId: fileId,
        tabData: newTabData,
      });
      set({ tabs });
      return;
    }

    // Case 3: File already open - just activate (and pin if double-clicked)
    const shouldPin = pinned && previewTabId === fileId;
    tabs.set(projectId, {
      ...state,
      activeTabId: fileId,
      previewTabId: shouldPin ? null : previewTabId,
      tabData: newTabData,
    });
    set({ tabs });
  },

  closeTab: (projectId, fileId) => {
    const tabs = new Map(get().tabs);
    const state = tabs.get(projectId) ?? defaultTabState;
    const { openTabs, activeTabId, previewTabId, tabData } = state;
    const tabIndex = openTabs.indexOf(fileId);

    if (tabIndex === -1) return;

    const newTabs = openTabs.filter((id) => id !== fileId);
    const newTabData = new Map(tabData);
    newTabData.delete(fileId);

    let newActiveTabId = activeTabId;
    if (activeTabId === fileId) {
      if (newTabs.length === 0) {
        newActiveTabId = null;
      } else if (tabIndex >= newTabs.length) {
        newActiveTabId = newTabs[newTabs.length - 1];
      } else {
        newActiveTabId = newTabs[tabIndex];
      }
    }

    tabs.set(projectId, {
      openTabs: newTabs,
      activeTabId: newActiveTabId,
      previewTabId: previewTabId === fileId ? null : previewTabId,
      tabData: newTabData,
    });
    set({ tabs });
  },

  closeAllTabs: (projectId) => {
    const tabs = new Map(get().tabs);
    tabs.set(projectId, {
      openTabs: [],
      activeTabId: null,
      previewTabId: null,
      tabData: new Map(),
    });
    set({ tabs });
  },

  setActiveTab: (projectId, fileId) => {
    const tabs = new Map(get().tabs);
    const state = tabs.get(projectId) ?? defaultTabState;
    tabs.set(projectId, { ...state, activeTabId: fileId });
    set({ tabs });
  },

  reorderTabs: (projectId, fileId, targetFileId, position) => {
    if (fileId === targetFileId) return;

    const tabs = new Map(get().tabs);
    const state = tabs.get(projectId);
    if (!state) return;

    const fromIndex = state.openTabs.indexOf(fileId);
    const targetIndex = state.openTabs.indexOf(targetFileId);
    if (fromIndex === -1 || targetIndex === -1) return;

    const reorderedTabs = [...state.openTabs];
    const [movedTabId] = reorderedTabs.splice(fromIndex, 1);
    if (!movedTabId) return;

    const adjustedTargetIndex = reorderedTabs.indexOf(targetFileId);
    const insertionIndex = adjustedTargetIndex + (position === "after" ? 1 : 0);
    reorderedTabs.splice(insertionIndex, 0, movedTabId);

    if (reorderedTabs.every((tabId, index) => tabId === state.openTabs[index])) return;

    tabs.set(projectId, { ...state, openTabs: reorderedTabs });
    set({ tabs });
  },

  initFileContent: (projectId, fileId, content, updatedAt) => {
    const tabs = new Map(get().tabs);
    const state = tabs.get(projectId) ?? defaultTabState;
    const tabData = new Map(state.tabData);
    const existing = tabData.get(fileId);

    if (!existing) {
      tabData.set(fileId, {
        buffer: content,
        savedContent: content,
        savedUpdatedAt: updatedAt,
        isDirty: false,
        isSaving: false,
        saveError: null,
        remoteContent: null,
        remoteUpdatedAt: undefined,
        hasConflict: false,
      });
      tabs.set(projectId, { ...state, tabData });
      set({ tabs });
    } else if (!existing.isDirty && existing.buffer !== content) {
      tabData.set(fileId, {
        ...existing,
        buffer: content,
        savedContent: content,
        savedUpdatedAt: updatedAt ?? existing.savedUpdatedAt,
        hasConflict: false,
        remoteContent: null,
      });
      tabs.set(projectId, { ...state, tabData });
      set({ tabs });
    }
  },

  updateBuffer: (projectId, fileId, content) => {
    const tabs = new Map(get().tabs);
    const state = tabs.get(projectId);
    if (!state) return;

    const tabData = new Map(state.tabData);
    const current = tabData.get(fileId);

    if (!current) {
      tabData.set(fileId, {
        buffer: content,
        savedContent: "",
        savedUpdatedAt: undefined,
        isDirty: true,
        isSaving: false,
        saveError: null,
        remoteContent: null,
        remoteUpdatedAt: undefined,
        hasConflict: false,
      });
    } else {
      const isDirty = content !== current.savedContent;
      tabData.set(fileId, {
        ...current,
        buffer: content,
        isDirty,
        saveError: null,
      });
    }

    tabs.set(projectId, { ...state, tabData });
    set({ tabs });
  },

  markSavingStart: (projectId, fileId) => {
    const tabs = new Map(get().tabs);
    const state = tabs.get(projectId);
    if (!state) return null;

    const tabData = new Map(state.tabData);
    const current = tabData.get(fileId);
    if (!current) return null;

    const contentBeingSaved = current.buffer;
    tabData.set(fileId, {
      ...current,
      isSaving: true,
      saveError: null,
    });

    tabs.set(projectId, { ...state, tabData });
    set({ tabs });
    return contentBeingSaved;
  },

  markSavingSuccess: (projectId, fileId, savedContent, updatedAt) => {
    const tabs = new Map(get().tabs);
    const state = tabs.get(projectId);
    if (!state) return;

    const tabData = new Map(state.tabData);
    const current = tabData.get(fileId);
    if (!current) return;

    // Only clear isDirty if the buffer hasn't changed since saving started
    const stillMatches = current.buffer === savedContent;
    tabData.set(fileId, {
      ...current,
      savedContent,
      savedUpdatedAt: updatedAt ?? Date.now(),
      isDirty: !stillMatches,
      isSaving: false,
      saveError: null,
      hasConflict: false,
      remoteContent: null,
      remoteUpdatedAt: undefined,
    });

    tabs.set(projectId, { ...state, tabData });
    set({ tabs });
  },

  markSavingError: (projectId, fileId, error) => {
    const tabs = new Map(get().tabs);
    const state = tabs.get(projectId);
    if (!state) return;

    const tabData = new Map(state.tabData);
    const current = tabData.get(fileId);
    if (!current) return;

    tabData.set(fileId, {
      ...current,
      isSaving: false,
      saveError: error,
    });

    tabs.set(projectId, { ...state, tabData });
    set({ tabs });
  },

  handleRemoteUpdate: (projectId, fileId, remoteContent, remoteUpdatedAt) => {
    const tabs = new Map(get().tabs);
    const state = tabs.get(projectId);
    if (!state) return { action: "ignored" };

    const tabData = new Map(state.tabData);
    const current = tabData.get(fileId);

    // If tabData doesn't exist yet, initialize it cleanly
    if (!current) {
      tabData.set(fileId, {
        buffer: remoteContent,
        savedContent: remoteContent,
        savedUpdatedAt: remoteUpdatedAt,
        isDirty: false,
        isSaving: false,
        saveError: null,
        remoteContent: null,
        remoteUpdatedAt: undefined,
        hasConflict: false,
      });
      tabs.set(projectId, { ...state, tabData });
      set({ tabs });
      return { action: "updated" };
    }

    // Ignore outdated remote updates if we have newer saved baseline
    if (
      remoteUpdatedAt &&
      current.savedUpdatedAt &&
      remoteUpdatedAt < current.savedUpdatedAt
    ) {
      return { action: "ignored" };
    }

    // If remote content matches our current saved content, nothing to do
    if (remoteContent === current.savedContent) {
      if (remoteUpdatedAt && remoteUpdatedAt !== current.savedUpdatedAt) {
        tabData.set(fileId, {
          ...current,
          savedUpdatedAt: remoteUpdatedAt,
        });
        tabs.set(projectId, { ...state, tabData });
        set({ tabs });
      }
      return { action: "ignored" };
    }

    // Case 1: Local tab is clean
    if (!current.isDirty) {
      tabData.set(fileId, {
        ...current,
        buffer: remoteContent,
        savedContent: remoteContent,
        savedUpdatedAt: remoteUpdatedAt,
        isDirty: false,
        hasConflict: false,
        remoteContent: null,
        remoteUpdatedAt: undefined,
      });
      tabs.set(projectId, { ...state, tabData });
      set({ tabs });
      return { action: "updated" };
    }

    // If local buffer happens to match remote content identically
    if (current.buffer === remoteContent) {
      tabData.set(fileId, {
        ...current,
        savedContent: remoteContent,
        savedUpdatedAt: remoteUpdatedAt,
        isDirty: false,
        hasConflict: false,
        remoteContent: null,
        remoteUpdatedAt: undefined,
      });
      tabs.set(projectId, { ...state, tabData });
      set({ tabs });
      return { action: "updated" };
    }

    // Case 3: Local tab is dirty and remote content differs from saved content
    tabData.set(fileId, {
      ...current,
      hasConflict: true,
      remoteContent,
      remoteUpdatedAt,
    });
    tabs.set(projectId, { ...state, tabData });
    set({ tabs });
    return { action: "conflict" };
  },

  resolveConflictKeepLocal: (projectId, fileId) => {
    const tabs = new Map(get().tabs);
    const state = tabs.get(projectId);
    if (!state) return;

    const tabData = new Map(state.tabData);
    const current = tabData.get(fileId);
    if (!current) return;

    tabData.set(fileId, {
      ...current,
      hasConflict: false,
      remoteContent: null,
      remoteUpdatedAt: undefined,
    });

    tabs.set(projectId, { ...state, tabData });
    set({ tabs });
  },

  resolveConflictAcceptRemote: (projectId, fileId) => {
    const tabs = new Map(get().tabs);
    const state = tabs.get(projectId);
    if (!state) return;

    const tabData = new Map(state.tabData);
    const current = tabData.get(fileId);
    if (!current || current.remoteContent === null) return;

    const newContent = current.remoteContent;
    const newUpdatedAt = current.remoteUpdatedAt ?? Date.now();

    tabData.set(fileId, {
      ...current,
      buffer: newContent,
      savedContent: newContent,
      savedUpdatedAt: newUpdatedAt,
      isDirty: false,
      hasConflict: false,
      remoteContent: null,
      remoteUpdatedAt: undefined,
    });

    tabs.set(projectId, { ...state, tabData });
    set({ tabs });
  },
}));