"use client";

import { useEffect, useRef, useState } from "react";
import { Allotment } from "allotment";
import {
  Loader2Icon,
  TerminalSquareIcon,
  AlertTriangleIcon,
  RefreshCwIcon,
  EraserIcon,
  CircleStopIcon,
  CopyIcon,
  ExternalLinkIcon,
} from "lucide-react";
import { toast } from "sonner";

import { useWebContainer } from "@/features/preview/hooks/use-webcontainer";
import { PreviewSettingsPopover } from "@/features/preview/components/preview-settings-popover";
import { PreviewTerminal } from "@/features/preview/components/preview-terminal";

import { Button } from "@/components/ui/button";

import { useProject } from "../hooks/use-projects";

import { Id } from "../../../../convex/_generated/dataModel";

export const PreviewView = ({ projectId }: { projectId: Id<"projects"> }) => {
  const project = useProject(projectId);
  const [showTerminal, setShowTerminal] = useState(true);
  const clearTerminalRef = useRef<(() => void) | null>(null);

  const {
    status,
    previewUrl,
    error,
    restart,
    isSyncing,
    syncError,
    resync,
    terminalOutput,
    sendTerminalInput,
    resizeTerminal,
    interruptForegroundProcess,
  } = useWebContainer({
    projectId,
    enabled: true,
    settings: project?.settings,
  });

  const isLoading = status === "booting" || status === "installing";

  const previewUrlRef = useRef<string | null>(previewUrl);
  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  const hasValidPreviewUrl = Boolean(previewUrl && previewUrl.trim());

  const handleCopyUrl = async () => {
    const targetUrl = previewUrl?.trim();
    if (!targetUrl) return;

    if (!navigator?.clipboard?.writeText) {
      toast.error("Clipboard access is unavailable. Copy the preview URL manually.");
      return;
    }

    try {
      await navigator.clipboard.writeText(targetUrl);
      if (previewUrlRef.current?.trim() === targetUrl) {
        toast.success("Preview URL copied to clipboard");
      }
    } catch {
      if (previewUrlRef.current?.trim() === targetUrl) {
        toast.error("Couldn't copy the preview URL. Check clipboard permissions or copy it manually.");
      }
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="h-8.75 flex items-center border-b bg-sidebar shrink-0">
        <Button
          size="sm"
          variant="ghost"
          className="h-full rounded-none"
          disabled={isLoading}
          onClick={restart}
          title="Restart container"
        >
          <RefreshCwIcon className="size-3" />
        </Button>

        <div className="flex-1 h-full flex items-center justify-between px-3 bg-background border-x text-xs text-muted-foreground min-w-0 font-mono">
          <div className="truncate min-w-0 mr-2 flex items-center gap-2">
            {isLoading && (
              <div className="flex items-center gap-1.5">
                <Loader2Icon className="size-3 animate-spin" />
                {status === "booting" ? "Starting..." : "Installing..."}
              </div>
            )}
            {previewUrl && <span className="truncate">{previewUrl}</span>}
            {!isLoading && !previewUrl && !error && <span>Ready to preview</span>}

            {status === "running" && (
              <>
                {syncError && (
                  <div
                    role="status"
                    className="flex items-center gap-1.5 text-destructive bg-destructive/10 px-2 py-0.5 rounded text-xs font-sans shrink-0"
                    title={syncError}
                  >
                    <AlertTriangleIcon className="size-3 shrink-0" />
                    <span>Preview may be out of date</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-4 px-1 text-[11px] underline font-medium hover:bg-destructive/20 text-destructive hover:text-destructive"
                      onClick={resync}
                      disabled={isSyncing}
                      title="Retry sync"
                      aria-label="Retry sync"
                    >
                      Retry sync
                    </Button>
                  </div>
                )}
                {!syncError && isSyncing && (
                  <div
                    role="status"
                    className="flex items-center gap-1.5 text-muted-foreground bg-muted/60 px-2 py-0.5 rounded text-xs font-sans shrink-0"
                  >
                    <Loader2Icon className="size-3 animate-spin shrink-0" />
                    <span>Syncing preview...</span>
                  </div>
                )}
              </>
            )}
          </div>

          {previewUrl && (
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="sm"
                variant="ghost"
                className="h-5 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                title="Copy preview URL"
                aria-label="Copy preview URL"
                disabled={!hasValidPreviewUrl}
                onClick={handleCopyUrl}
              >
                <CopyIcon className="size-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                title="Open preview URL"
                aria-label="Open preview URL"
                asChild
              >
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLinkIcon className="size-3" />
                </a>
              </Button>
            </div>
          )}
        </div>

        <Button
          size="sm"
          variant="ghost"
          className="h-full rounded-none"
          title="Toggle terminal"
          onClick={() => setShowTerminal((value) => !value)}
        >
          <TerminalSquareIcon className="size-3" />
        </Button>
        <PreviewSettingsPopover
          projectId={projectId}
          initialValues={project?.settings}
          onSave={restart}
        />
      </div>

      <div className="flex-1 min-h-0">
        <Allotment vertical>
          <Allotment.Pane>
            {error && (
              <div className="size-full flex items-center justify-center text-muted-foreground">
                <div className="flex flex-col items-center gap-2 max-w-md mx-auto text-center">
                  <AlertTriangleIcon className="size-6" />
                  <p className="text-sm font-medium">{error}</p>
                  <Button size="sm" variant="outline" onClick={restart}>
                    <RefreshCwIcon className="size-4" />
                    Restart
                  </Button>
                </div>
              </div>
            )}

            {isLoading && !error && (
              <div className="size-full flex items-center justify-center text-muted-foreground">
                <div className="flex flex-col items-center gap-2 max-w-md mx-auto text-center">
                  <Loader2Icon className="size-6 animate-spin" />
                  <p className="text-sm font-medium">Installing...</p>
                </div>
              </div>
            )}

            {previewUrl && (
              <iframe
                src={previewUrl}
                className="size-full border-0"
                title="Preview"
              />
            )}
          </Allotment.Pane>

          {showTerminal && (
            <Allotment.Pane minSize={100} maxSize={500} preferredSize={200}>
              <div className="h-full flex flex-col bg-background border-t">
                <div className="h-7 flex items-center justify-between px-3 text-xs text-muted-foreground border-b border-border/50 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <TerminalSquareIcon className="size-3" />
                    Terminal
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                      title="Interrupt foreground process"
                      aria-label="Interrupt foreground process"
                      onClick={interruptForegroundProcess}
                    >
                      <CircleStopIcon className="size-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                      title="Clear terminal"
                      aria-label="Clear terminal"
                      onClick={() => clearTerminalRef.current?.()}
                    >
                      <EraserIcon className="size-3" />
                    </Button>
                  </div>
                </div>
                <PreviewTerminal
                  output={terminalOutput}
                  onData={sendTerminalInput}
                  onResize={resizeTerminal}
                  onClearRef={clearTerminalRef}
                />
              </div>
            </Allotment.Pane>
          )}
        </Allotment>
      </div>
    </div>
  );
};