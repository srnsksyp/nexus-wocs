import { useCallback } from "react";

import { useEditorStore } from "../store/use-editor-store";
import { Id } from "../../../../convex/_generated/dataModel";

export const useEditor = (projectId: Id<"projects">) => {
  const store = useEditorStore();
  const tabState = useEditorStore((state) => state.getTabState(projectId));

  const openFile = useCallback(
    (
      fileId: Id<"files">,
      options: { pinned: boolean; initialContent?: string; updatedAt?: number },
  ) => {
    store.openFile(projectId, fileId, options);
  }, [store, projectId]);

  const closeTab = useCallback(
    (fileId: Id<"files">) => {
      store.closeTab(projectId, fileId);
    },
    [store, projectId]
  );

  const closeAllTabs = useCallback(() => {
    store.closeAllTabs(projectId);
  }, [store, projectId]);

  const reorderTabs = useCallback(
    (fileId: Id<"files">, targetFileId: Id<"files">, position: "before" | "after") => {
      store.reorderTabs(projectId, fileId, targetFileId, position);
    },
    [store, projectId]
  );

  const setActiveTab = useCallback(
    (fileId: Id<"files">) => {
      store.setActiveTab(projectId, fileId);
    },
    [store, projectId]
  );

  const getTabData = useCallback(
    (fileId: Id<"files">) => {
      return store.getTabData(projectId, fileId);
    },
    [store, projectId]
  );

  const isFileDirty = useCallback(
    (fileId: Id<"files">) => {
      return store.isFileDirty(projectId, fileId);
    },
    [store, projectId]
  );

  const updateBuffer = useCallback(
    (fileId: Id<"files">, content: string) => {
      store.updateBuffer(projectId, fileId, content);
    },
    [store, projectId]
  );

  const initFileContent = useCallback(
    (fileId: Id<"files">, content: string, updatedAt?: number) => {
      store.initFileContent(projectId, fileId, content, updatedAt);
    },
    [store, projectId]
  );

  const markSavingStart = useCallback(
    (fileId: Id<"files">) => {
      return store.markSavingStart(projectId, fileId);
    },
    [store, projectId]
  );

  const markSavingSuccess = useCallback(
    (fileId: Id<"files">, savedContent: string, updatedAt?: number) => {
      store.markSavingSuccess(projectId, fileId, savedContent, updatedAt);
    },
    [store, projectId]
  );

  const markSavingError = useCallback(
    (fileId: Id<"files">, error: string) => {
      store.markSavingError(projectId, fileId, error);
    },
    [store, projectId]
  );

  const handleRemoteUpdate = useCallback(
    (fileId: Id<"files">, remoteContent: string, remoteUpdatedAt?: number) => {
      return store.handleRemoteUpdate(projectId, fileId, remoteContent, remoteUpdatedAt);
    },
    [store, projectId]
  );

  const resolveConflictKeepLocal = useCallback(
    (fileId: Id<"files">) => {
      store.resolveConflictKeepLocal(projectId, fileId);
    },
    [store, projectId]
  );

  const resolveConflictAcceptRemote = useCallback(
    (fileId: Id<"files">) => {
      store.resolveConflictAcceptRemote(projectId, fileId);
    },
    [store, projectId]
  );

  const hasDirtyTabs = useCallback(() => {
    return store.hasDirtyTabs(projectId);
  }, [store, projectId]);

  return {
    openTabs: tabState.openTabs,
    activeTabId: tabState.activeTabId,
    previewTabId: tabState.previewTabId,
    tabData: tabState.tabData,
    openFile,
    closeTab,
    closeAllTabs,
    reorderTabs,
    setActiveTab,
    getTabData,
    isFileDirty,
    updateBuffer,
    initFileContent,
    markSavingStart,
    markSavingSuccess,
    markSavingError,
    handleRemoteUpdate,
    resolveConflictKeepLocal,
    resolveConflictAcceptRemote,
    hasDirtyTabs,
  };
};