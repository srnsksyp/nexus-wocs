"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Allotment } from "allotment";
import { FileIcon } from "@react-symbols/icons/utils";

import { cn } from "@/lib/utils";
import { EditorView } from "@/features/editor/components/editor-view";
import { useEditor } from "@/features/editor/hooks/use-editor";
import { useFiles } from "@/features/projects/hooks/use-files";
import { useProject } from "@/features/projects/hooks/use-projects";
import { useSelectedProjectStore } from "../store/use-selected-project-store";
import { getFilePath } from "@/features/preview/utils/file-tree";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

import { FileExplorer } from "./file-explorer";
import { PreviewView } from "./preview-view";
import { Doc, Id } from "../../../../convex/_generated/dataModel";
import { ExportPopover } from "./export-popover";
import type { SelectedCodeContext } from "@/features/editor/extensions/selection-tooltip";

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 800;
const DEFAULT_SIDEBAR_WIDTH = 350;
const DEFAULT_MAIN_SIZE = 1000;

const Tab = ({
  label,
  isActive,
  onClick,
  onKeyDown,
  tabRef,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  tabRef?: (el: HTMLDivElement | null) => void;
}) => {
  return (
    <div
      ref={tabRef}
      role="tab"
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={cn(
        "flex items-center gap-2 h-full px-3 cursor-pointer text-muted-foreground border-r hover:bg-accent/30 outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
        isActive && "bg-background text-foreground",
      )}
    >
      <span className="text-sm">{label}</span>
    </div>
  );
};

export const ProjectIdView = ({
  projectId,
  conversationId,
  onSelectedCode,
}: {
  projectId: Id<"projects">;
  conversationId?: Id<"conversations">;
  onSelectedCode?: (context: SelectedCodeContext) => void;
}) => {
  const [activeView, setActiveView] = useState<"editor" | "preview">("editor");
  const [quickOpen, setQuickOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [prevProjectId, setPrevProjectId] = useState(projectId);

  const editorTabRef = useRef<HTMLDivElement | null>(null);
  const previewTabRef = useRef<HTMLDivElement | null>(null);

  const { openFile } = useEditor(projectId);
  const files = useFiles(projectId);
  const project = useProject(projectId);
  const setSelectedProjectId = useSelectedProjectStore((state) => state.setSelectedProjectId);
  const clearSelectedProjectId = useSelectedProjectStore((state) => state.clearSelectedProjectId);

  useEffect(() => {
    if (project === undefined) return;

    if (project === null) {
      clearSelectedProjectId(projectId);
      return;
    }

    setSelectedProjectId(projectId);
  }, [project, projectId, setSelectedProjectId, clearSelectedProjectId]);

  // Close and reset quick open when projectId changes during render (recommended by React docs over useEffect)
  if (projectId !== prevProjectId) {
    setPrevProjectId(projectId);
    setQuickOpen(false);
    setSearchQuery("");
  }

  // Keyboard shortcut: Ctrl+P / Cmd+P to toggle quick open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
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

        // Prevent browser print dialog
        e.preventDefault();
        setQuickOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Compute file paths for search and display
  const fileItems = useMemo(() => {
    if (!files) return null;

    const filesMap = new Map<Id<"files">, Doc<"files">>(
      files.map((f) => [f._id, f])
    );

    return files
      .filter((item) => item.type === "file")
      .map((item) => {
        const path = getFilePath(item, filesMap);
        return {
          id: item._id,
          name: item.name,
          path,
          searchValue: `${path} ${item.name}`,
        };
      })
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [files]);

  const handleSelectFile = (fileId: Id<"files">) => {
    openFile(fileId, { pinned: false });
    setQuickOpen(false);
    setSearchQuery("");
  };

  const views: Array<"editor" | "preview"> = ["editor", "preview"];

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
    currentView: "editor" | "preview"
  ) => {
    const currentIndex = views.indexOf(currentView);
    let targetIndex = -1;

    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        targetIndex = (currentIndex + 1) % views.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        targetIndex = (currentIndex - 1 + views.length) % views.length;
        break;
      case "Home":
        e.preventDefault();
        targetIndex = 0;
        break;
      case "End":
        e.preventDefault();
        targetIndex = views.length - 1;
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        setActiveView(currentView);
        return;
      default:
        return;
    }

    if (targetIndex >= 0 && targetIndex < views.length) {
      const targetView = views[targetIndex];
      const targetEl = targetView === "editor" ? editorTabRef.current : previewTabRef.current;
      if (targetEl) {
        targetEl.focus();
      }
    }
  };

  return (
    <div className="h-full flex flex-col">
      <nav role="tablist" aria-label="Project views" className="h-8.75 flex items-center bg-sidebar border-b">
        <Tab
          label="Code"
          isActive={activeView === "editor"}
          onClick={() => setActiveView("editor")}
          tabRef={(el) => {
            editorTabRef.current = el;
          }}
          onKeyDown={(e) => handleKeyDown(e, "editor")}
        />
        <Tab
          label="Preview"
          isActive={activeView === "preview"}
          onClick={() => setActiveView("preview")}
          tabRef={(el) => {
            previewTabRef.current = el;
          }}
          onKeyDown={(e) => handleKeyDown(e, "preview")}
        />
        <div className="flex-1 flex justify-end h-full">
          <ExportPopover projectId={projectId} />
        </div>
      </nav>
      <div className="flex-1 relative">
        <div
          className={cn(
            "absolute inset-0",
            activeView === "editor" ? "visible" : "invisible",
          )}
        >
          <Allotment defaultSizes={[DEFAULT_SIDEBAR_WIDTH, DEFAULT_MAIN_SIZE]}>
            <Allotment.Pane
              snap
              minSize={MIN_SIDEBAR_WIDTH}
              maxSize={MAX_SIDEBAR_WIDTH}
              preferredSize={DEFAULT_SIDEBAR_WIDTH}
            >
              <FileExplorer projectId={projectId} />
            </Allotment.Pane>
            <Allotment.Pane>
              <EditorView
                projectId={projectId}
                conversationId={conversationId}
                onSelectedCode={onSelectedCode}
              />
            </Allotment.Pane>
          </Allotment>
        </div>
        <div
          className={cn(
            "absolute inset-0",
            activeView === "preview" ? "visible" : "invisible",
          )}
        >
          <PreviewView projectId={projectId} />
        </div>
      </div>

      <CommandDialog
        open={quickOpen}
        onOpenChange={(open) => {
          setQuickOpen(open);
          if (!open) setSearchQuery("");
        }}
        title="Quick Open"
        description="Search files by name or path"
      >
        <CommandInput
          placeholder="Search files by name or path..."
          value={searchQuery}
          onValueChange={setSearchQuery}
        />
        <CommandList>
          {fileItems === null ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Loading files...
            </div>
          ) : fileItems.length === 0 ? (
            <CommandEmpty>No files in project.</CommandEmpty>
          ) : (
            <>
              <CommandEmpty>No matching files found.</CommandEmpty>
              <CommandGroup heading="Files">
                {fileItems.map((file) => (
                  <CommandItem
                    key={file.id}
                    value={file.searchValue}
                    onSelect={() => handleSelectFile(file.id)}
                    className="flex items-center gap-2"
                  >
                    <FileIcon fileName={file.name} autoAssign className="size-4 shrink-0" />
                    <div className="flex items-baseline gap-2 overflow-hidden truncate">
                      <span className="font-medium text-sm truncate">{file.name}</span>
                      <span className="text-xs text-muted-foreground truncate">{file.path}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </div>
  );
};
