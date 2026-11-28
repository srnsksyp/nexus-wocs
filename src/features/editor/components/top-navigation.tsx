import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"

import { useFile } from "@/features/projects/hooks/use-files";

import { useEditor } from "../hooks/use-editor";
import { Id } from "../../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { FileIcon } from "@react-symbols/icons/utils";
import { XIcon, XCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const Tab = ({
  fileId,
  isFirst,
  projectId,
  tabRef,
  onKeyDown,
  onTabClick,
  onTabPointerDown,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  dropPosition,
}: {
  fileId: Id<"files">;
  isFirst: boolean;
  projectId: Id<"projects">;
  tabRef?: (el: HTMLDivElement | null) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>, fileId: Id<"files">) => void;
  onTabClick: (e: React.MouseEvent<HTMLDivElement>, fileId: Id<"files">) => void;
  onTabPointerDown: () => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, fileId: Id<"files">) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>, fileId: Id<"files">) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>, fileId: Id<"files">) => void;
  onDragEnd: () => void;
  dropPosition?: "before" | "after" | null;
}) => {
  const file = useFile(fileId);
  const {
    activeTabId,
    previewTabId,
    openFile,
    closeTab,
    isFileDirty,
    getTabData,
  } = useEditor(projectId);

  const isActive = activeTabId === fileId;
  const isPreview = previewTabId === fileId;
  const isDirty = isFileDirty(fileId);
  const tabData = getTabData(fileId);
  const hasConflict = tabData?.hasConflict ?? false;
  const isSaving = tabData?.isSaving ?? false;
  const fileName = file?.name ?? "Loading...";

  return (
    <div
      ref={tabRef}
      draggable
      onPointerDown={onTabPointerDown}
      onDragStart={(e) => onDragStart(e, fileId)}
      onDragOver={(e) => onDragOver(e, fileId)}
      onDrop={(e) => onDrop(e, fileId)}
      onDragEnd={onDragEnd}
      role="tab"
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      aria-keyshortcuts="Control+Shift+ArrowLeft Control+Shift+ArrowRight Meta+Shift+ArrowLeft Meta+Shift+ArrowRight"
      onClick={(e) => onTabClick(e, fileId)}
      onDoubleClick={() => openFile(fileId, { pinned: true })}
      onKeyDown={(e) => onKeyDown(e, fileId)}
      className={cn(
        "flex items-center gap-2 h-8.75 pl-2 pr-1.5 cursor-pointer text-muted-foreground group border-y border-x border-transparent hover:bg-accent/30 outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
        isActive &&
          "bg-background text-foreground border-x-border border-b-background -mb-px drop-shadow",
        isFirst && dropPosition !== "before" && "border-l-transparent!",
        dropPosition === "before" && "border-l-2 border-l-primary",
        dropPosition === "after" && "border-r-2 border-r-primary"
      )}
    >
      {file === undefined ? (
        <Spinner className="text-ring" />
      ) : (
        <FileIcon fileName={fileName} autoAssign className="size-4" />
      )}
      <span className={cn(
        "text-sm whitespace-nowrap",
        isPreview && "italic"
      )}>
        {fileName}
      </span>
      {/* Dirty / Conflict / Saving indicator */}
      {hasConflict ? (
        <span
          className="size-2 rounded-full bg-red-500 shrink-0"
          title="External update conflict"
        />
      ) : isSaving ? (
        <span
          className="size-2 rounded-full bg-blue-500 animate-pulse shrink-0"
          title="Saving..."
        />
      ) : isDirty ? (
        <span
          className="size-2 rounded-full bg-amber-500 shrink-0"
          title="Unsaved changes"
        />
      ) : null}
      <button
        draggable={false}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          closeTab(fileId);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            closeTab(fileId);
          }
        }}
        aria-label={`Close ${fileName}`}
        title={`Close ${fileName}`}
        className={cn(
          "p-0.5 rounded-sm hover:bg-white/10 opacity-0 group-hover:opacity-100",
          isActive && "opacity-100"
        )}
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
};

export const TopNavigation = ({ 
  projectId
}: { 
  projectId: Id<"projects">
}) => {
  const { openTabs, activeTabId, setActiveTab, closeTab, closeAllTabs, hasDirtyTabs, reorderTabs } = useEditor(projectId);
  const tabElementsRef = useRef<Map<Id<"files">, HTMLDivElement | null>>(new Map());
  const draggedTabIdRef = useRef<Id<"files"> | null>(null);
  const suppressNextClickRef = useRef(false);
  const [dropTarget, setDropTarget] = useState<{ fileId: Id<"files">; position: "before" | "after" } | null>(null);
  const [reorderAnnouncement, setReorderAnnouncement] = useState("");
  const reorderInstructionsId = useId();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleTabClick = (e: React.MouseEvent<HTMLDivElement>, fileId: Id<"files">) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    setActiveTab(fileId);
  };

  const handleTabPointerDown = () => {
    // A real pointer sequence after a drag starts a fresh click interaction.
    suppressNextClickRef.current = false;
  };

  const handleTabDragStart = (e: React.DragEvent<HTMLDivElement>, fileId: Id<"files">) => {
    if (e.target instanceof Element && e.target.closest("button")) {
      e.preventDefault();
      return;
    }
    draggedTabIdRef.current = fileId;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", fileId);
    setDropTarget(null);
  };

  const handleTabDragOver = (e: React.DragEvent<HTMLDivElement>, fileId: Id<"files">) => {
    const draggedFileId = draggedTabIdRef.current;
    if (!draggedFileId || draggedFileId === fileId) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const bounds = e.currentTarget.getBoundingClientRect();
    const position = e.clientX < bounds.left + bounds.width / 2 ? "before" : "after";
    setDropTarget((current) =>
      current?.fileId === fileId && current.position === position
        ? current
        : { fileId, position }
    );
  };

  const handleTabDrop = (e: React.DragEvent<HTMLDivElement>, fileId: Id<"files">) => {
    const draggedFileId = draggedTabIdRef.current;
    if (!draggedFileId || draggedFileId === fileId) return;

    e.preventDefault();
    const bounds = e.currentTarget.getBoundingClientRect();
    const position = e.clientX < bounds.left + bounds.width / 2 ? "before" : "after";
    const remainingTabs = openTabs.filter((tabId) => tabId !== draggedFileId);
    const targetIndex = remainingTabs.indexOf(fileId);
    if (targetIndex !== -1) {
      const nextIndex = targetIndex + (position === "after" ? 1 : 0);
      reorderTabs(draggedFileId, fileId, position);
      setReorderAnnouncement(`Moved tab to position ${nextIndex + 1} of ${openTabs.length}.`);
      suppressNextClickRef.current = true;
    }
    setDropTarget(null);
  };

  const handleTabDragEnd = () => {
    if (draggedTabIdRef.current) suppressNextClickRef.current = true;
    draggedTabIdRef.current = null;
    setDropTarget(null);
  };

  const handleCloseAllClick = () => {
    if (hasDirtyTabs()) {
      setConfirmOpen(true);
    } else {
      closeAllTabs();
    }
  };

  const handleConfirmCloseAll = () => {
    setConfirmOpen(false);
    closeAllTabs();
  };

  // Handle Ctrl+W / Cmd+W shortcut to close active tab
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "w") {
        // Protect input fields, textareas, contenteditable elements, and CodeMirror editors
        const target = e.target;
        if (target && target instanceof Element) {
          const tagName = target.tagName;
          if (
            tagName === "INPUT" ||
            tagName === "TEXTAREA" ||
            tagName === "SELECT" ||
            (target as HTMLElement).isContentEditable ||
            target.closest(".cm-editor") !== null ||
            target.closest(".cm-content") !== null ||
            target.closest("[contenteditable='true']") !== null
          ) {
            return;
          }
        }

        if (activeTabId && openTabs.includes(activeTabId)) {
          e.preventDefault();
          closeTab(activeTabId);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeTabId, openTabs, closeTab]);

  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>, fileId: Id<"files">) => {
      const currentIndex = openTabs.indexOf(fileId);
      if (currentIndex === -1) return;

      // Ctrl/Cmd + Shift + ArrowLeft/ArrowRight reorders the focused tab.
      // Plain arrow keys continue to provide the existing roving-focus behavior.
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        const targetIndex = currentIndex + (e.key === "ArrowLeft" ? -1 : 1);
        const targetFileId = openTabs[targetIndex];
        if (targetFileId) {
          reorderTabs(fileId, targetFileId, e.key === "ArrowLeft" ? "before" : "after");
          setReorderAnnouncement(`Moved tab to position ${targetIndex + 1} of ${openTabs.length}.`);
        }
        return;
      }

      let targetIndex = -1;

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          targetIndex = (currentIndex + 1) % openTabs.length;
          break;
        case "ArrowLeft":
          e.preventDefault();
          targetIndex = (currentIndex - 1 + openTabs.length) % openTabs.length;
          break;
        case "Home":
          e.preventDefault();
          targetIndex = 0;
          break;
        case "End":
          e.preventDefault();
          targetIndex = openTabs.length - 1;
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          setActiveTab(fileId);
          return;
        default:
          return;
      }

      if (targetIndex >= 0 && targetIndex < openTabs.length) {
        const targetFileId = openTabs[targetIndex];
        const targetElement = tabElementsRef.current.get(targetFileId);
        if (targetElement) {
          targetElement.focus();
        }
      }
    },
    [openTabs, setActiveTab, reorderTabs]
  );

  return (
    <>
      <div className="flex items-center border-b bg-sidebar">
        <ScrollArea className="flex-1">
          <span id={reorderInstructionsId} className="sr-only">
            Drag tabs to reorder them. Or use Control or Command plus Shift and the Left or Right Arrow key to move the focused tab.
          </span>
          <div role="status" aria-live="polite" className="sr-only">{reorderAnnouncement}</div>
          <nav role="tablist" aria-label="Open files" aria-describedby={reorderInstructionsId} className="flex items-center h-8.75">
            {openTabs.map((fileId, index) => (
              <Tab
                key={fileId}
                fileId={fileId}
                isFirst={index === 0}
                projectId={projectId}
                tabRef={(el) => {
                  if (el) {
                    tabElementsRef.current.set(fileId, el);
                  } else {
                    tabElementsRef.current.delete(fileId);
                  }
                }}
                onKeyDown={handleTabKeyDown}
                onTabClick={handleTabClick}
                onTabPointerDown={handleTabPointerDown}
                onDragStart={handleTabDragStart}
                onDragOver={handleTabDragOver}
                onDrop={handleTabDrop}
                onDragEnd={handleTabDragEnd}
                dropPosition={dropTarget?.fileId === fileId ? dropTarget.position : null}
              />
            ))}
          </nav>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        {openTabs.length > 0 && (
          <div className="flex items-center px-1 border-l shrink-0">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleCloseAllClick}
              aria-label="Close all tabs"
              title="Close all tabs"
              className="text-muted-foreground hover:text-foreground"
            >
              <XCircleIcon className="size-3.5" />
            </Button>
          </div>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close all tabs?</AlertDialogTitle>
            <AlertDialogDescription>
              Some tabs contain unsaved changes. Closing all tabs will discard those changes. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCloseAll}>
              Close All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};