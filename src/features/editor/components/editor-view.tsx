import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangleIcon, CheckIcon, MapIcon, RefreshCwIcon, SaveIcon, WrapTextIcon } from "lucide-react";

import { useFile, useUpdateFile } from "@/features/projects/hooks/use-files";

import { CodeEditor, type CursorPosition } from "./code-editor";
import { useEditor } from "../hooks/use-editor";
import { useEditorPreferences } from "../hooks/use-editor-preferences";
import { TopNavigation } from "./top-navigation";
import { FileBreadcrumbs } from "./file-breadcrumbs";
import { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import type { SelectedCodeContext } from "../extensions/selection-tooltip";

const DEBOUNCE_MS = 1500;

export const EditorView = ({
  projectId,
  conversationId,
  onSelectedCode,
}: {
  projectId: Id<"projects">;
  conversationId?: Id<"conversations">;
  onSelectedCode?: (context: SelectedCodeContext) => void;
}) => {
  const {
    activeTabId,
    getTabData,
    updateBuffer,
    markSavingStart,
    markSavingSuccess,
    markSavingError,
    handleRemoteUpdate,
    resolveConflictKeepLocal,
    resolveConflictAcceptRemote,
    hasDirtyTabs,
  } = useEditor(projectId);

  const {
    lineWrapping,
    minimapEnabled,
    toggleLineWrapping,
    toggleMinimap,
  } = useEditorPreferences();

  const activeFile = useFile(activeTabId);
  const updateFile = useUpdateFile();
  const [cursorPosition, setCursorPosition] = useState<CursorPosition>({ line: 1, column: 1 });
  const autosaveTimersRef = useRef<Map<Id<"files">, NodeJS.Timeout>>(new Map());

  // Reset cursor position to Line 1, Column 1 when switching active tabs
  useEffect(() => {
    setCursorPosition({ line: 1, column: 1 });
  }, [activeTabId]);

  // Cleanup all pending autosave timers on unmount or project change
  useEffect(() => {
    const timers = autosaveTimersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, [projectId]);

  // Browser navigation and close protection (beforeunload)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasDirtyTabs()) {
        e.preventDefault();
        // Standard modern browser convention: setting returnValue triggers confirmation dialog
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasDirtyTabs]);

  // Synchronize remote Convex updates with local editor store
  useEffect(() => {
    if (activeFile && !activeFile.storageId && activeFile.content !== undefined) {
      handleRemoteUpdate(
        activeFile._id,
        activeFile.content,
        activeFile.updatedAt
      );
    }
  }, [activeFile, handleRemoteUpdate]);

  const activeTabData = activeTabId ? getTabData(activeTabId) : undefined;
  const isDirty = activeTabData?.isDirty ?? false;
  const isSaving = activeTabData?.isSaving ?? false;
  const saveError = activeTabData?.saveError ?? null;
  const hasConflict = activeTabData?.hasConflict ?? false;

  // Immediate save implementation (used by debounce and manual shortcut Ctrl+S / Cmd+S)
  const performSave = useCallback(
    async (fileId: Id<"files">) => {
      const existingTimer = autosaveTimersRef.current.get(fileId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        autosaveTimersRef.current.delete(fileId);
      }

      const contentToSave = markSavingStart(fileId);
      if (contentToSave === null) return;

      try {
        await updateFile({ id: fileId, content: contentToSave });
        markSavingSuccess(fileId, contentToSave, Date.now());
      } catch (err: unknown) {
        const errorMsg =
          err instanceof Error ? err.message : "Failed to save file";
        markSavingError(fileId, errorMsg);
      }
    },
    [markSavingStart, markSavingSuccess, markSavingError, updateFile]
  );

  const handleManualSave = useCallback(() => {
    if (activeTabId) {
      performSave(activeTabId);
    }
  }, [activeTabId, performSave]);

  const handleBufferChange = useCallback(
    (newContent: string) => {
      if (!activeTabId) return;

      const fileId = activeTabId;
      updateBuffer(fileId, newContent);

      const existingTimer = autosaveTimersRef.current.get(fileId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timer = setTimeout(() => {
        autosaveTimersRef.current.delete(fileId);
        performSave(fileId);
      }, DEBOUNCE_MS);

      autosaveTimersRef.current.set(fileId, timer);
    },
    [activeTabId, updateBuffer, performSave]
  );

  const isActiveFileBinary = activeFile && activeFile.storageId;
  const isActiveFileText = activeFile && !activeFile.storageId;

  // Initial content for editor: local dirty/clean buffer if present, otherwise remote activeFile content
  const editorValue =
    activeTabData?.buffer !== undefined
      ? activeTabData.buffer
      : (activeFile?.content ?? "");

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center">
        <TopNavigation projectId={projectId} />
      </div>
      <div className="flex items-center justify-between border-b px-2 py-0.5 text-xs text-muted-foreground bg-muted/20">
        <div className="flex items-center">
          {activeTabId && <FileBreadcrumbs projectId={projectId} />}
        </div>
        <div className="flex items-center gap-2 pr-2">
          <Button
            variant="ghost"
            size="xs"
            onClick={toggleMinimap}
            aria-label="Minimap"
            aria-pressed={minimapEnabled}
            title={minimapEnabled ? "Disable minimap" : "Enable minimap"}
            className={`h-5 px-1.5 text-xs transition-colors ${
              minimapEnabled
                ? "bg-accent text-accent-foreground hover:bg-accent/80"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <MapIcon className="size-3" />
            <span>Minimap</span>
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={toggleLineWrapping}
            aria-label="Line wrapping"
            aria-pressed={lineWrapping}
            title={lineWrapping ? "Disable line wrapping" : "Enable line wrapping"}
            className={`h-5 px-1.5 text-xs transition-colors ${
              lineWrapping
                ? "bg-accent text-accent-foreground hover:bg-accent/80"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <WrapTextIcon className="size-3" />
            <span>Wrap</span>
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={handleManualSave}
            disabled={!activeTabId || !isDirty || isSaving}
            aria-label="Save file"
            title="Save file (Ctrl+S / Cmd+S)"
            className="h-5 px-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <SaveIcon className="size-3" />
            <span>Save</span>
          </Button>
          {isSaving && (
            <span className="flex items-center gap-1 text-blue-500">
              <RefreshCwIcon className="size-3 animate-spin" /> Saving...
            </span>
          )}
          {!isSaving && saveError && (
            <span className="flex items-center gap-1 text-red-500 font-medium">
              <AlertTriangleIcon className="size-3" /> Save failed: {saveError}
            </span>
          )}
          {!isSaving && !saveError && isDirty && (
            <span className="flex items-center gap-1 text-amber-500">
              <span className="size-1.5 rounded-full bg-amber-500" /> Unsaved changes
            </span>
          )}
          {!isSaving && !saveError && !isDirty && activeFile && (
            <span className="flex items-center gap-1 text-emerald-500">
              <CheckIcon className="size-3" /> Saved
            </span>
          )}
          {isActiveFileText && (
            <span className="text-muted-foreground select-none" data-testid="editor-cursor-position">
              Ln {cursorPosition.line}, Col {cursorPosition.column}
            </span>
          )}
        </div>
      </div>

      {/* Conflict Resolution Banner */}
      {hasConflict && activeTabId && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangleIcon className="size-4 text-amber-500 shrink-0" />
            <p className="text-xs text-amber-200">
              <strong className="font-semibold">Conflict Detected:</strong> This file was modified externally (e.g., by the background AI agent). Your local changes have been preserved.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => resolveConflictAcceptRemote(activeTabId)}
              className="px-2.5 py-1 text-xs font-medium rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 transition-colors"
            >
              Accept external changes
            </button>
            <button
              onClick={() => {
                resolveConflictKeepLocal(activeTabId);
                performSave(activeTabId);
              }}
              className="px-2.5 py-1 text-xs font-medium rounded bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-1 transition-colors"
            >
              <SaveIcon className="size-3" /> Keep my changes & save
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 bg-background">
        {!activeFile && (
          <div className="size-full flex items-center justify-center">
            <Image
              src="/logo-alt.svg"
              alt="Nexus"
              width={50}
              height={50}
              className="opacity-25"
            />
          </div>
        )}
        {isActiveFileText && (
          <CodeEditor
            key={activeFile._id}
            projectId={projectId}
            fileId={activeFile._id}
            fileName={activeFile.name}
            initialValue={editorValue}
            lineWrapping={lineWrapping}
            minimapEnabled={minimapEnabled}
            onChange={handleBufferChange}
            onSave={handleManualSave}
            conversationId={conversationId}
            onSelectedCode={onSelectedCode}
            onCursorPositionChange={setCursorPosition}
          />
        )}
        {isActiveFileBinary && (
          <div className="size-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-2.5 max-w-md text-center">
              <AlertTriangleIcon className="size-10 text-yellow-500" />
              <p className="text-sm">
                The file is not displayed in the text editor because it is either binary or uses an unsupported text encoding.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};