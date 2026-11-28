import { useCallback, useEffect, useRef, useState } from "react";
import { WebContainer, WebContainerProcess } from "@webcontainer/api";

import {
  buildFileTree,
  extractFileTreeSnapshot,
  computeFileTreeDiff,
  FileTreeSnapshot,
} from "@/features/preview/utils/file-tree";
import { parseCommand } from "@/features/preview/utils/command-parser";
import { useFiles } from "@/features/projects/hooks/use-files";

import { Id } from "../../../../convex/_generated/dataModel";

// Singleton WebContainer instance
let webcontainerInstance: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;

const getWebContainer = async (): Promise<WebContainer> => {
  if (webcontainerInstance) return webcontainerInstance;

  if (!bootPromise) bootPromise = WebContainer.boot({ coep: "credentialless" });

  webcontainerInstance = await bootPromise;
  return webcontainerInstance;
};

const teardownWebContainer = () => {
  if (webcontainerInstance) {
    try {
      webcontainerInstance.teardown();
    } catch {
      // Ignore teardown error if already torn down
    }
    webcontainerInstance = null;
  }
  bootPromise = null;
};

interface UseWebContainerProps {
  projectId: Id<"projects">;
  enabled: boolean;
  settings?: {
    installCommand?: string;
    devCommand?: string;
    envVariables?: Record<string, string>;
  };
}

export const useWebContainer = ({
  projectId,
  enabled,
  settings,
}: UseWebContainerProps) => {
  const [status, setStatus] = useState<
    "idle" | "booting" | "installing" | "running" | "error"
  >("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restartKey, setRestartKey] = useState(0);
  const [terminalOutput, setTerminalOutput] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [resyncTrigger, setResyncTrigger] = useState(0);

  const containerRef = useRef<WebContainer | null>(null);
  const hasStartedRef = useRef(false);
  const previousSnapshotRef = useRef<FileTreeSnapshot>({
    files: new Map(),
    directories: new Set(),
  });
  const syncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const currentProjectIdRef = useRef<Id<"projects">>(projectId);
  const syncSequenceRef = useRef(0);
  const activeSyncCountRef = useRef(0);

  // References to active processes and streams
  const shellProcessRef = useRef<WebContainerProcess | null>(null);
  const shellInputWriterRef = useRef<WritableStreamDefaultWriter<string> | null>(null);
  const devProcessRef = useRef<WebContainerProcess | null>(null);
  const installProcessRef = useRef<WebContainerProcess | null>(null);

  // Clean reset when switching projects
  useEffect(() => {
    if (currentProjectIdRef.current !== projectId) {
      currentProjectIdRef.current = projectId;

      if (shellInputWriterRef.current) {
        shellInputWriterRef.current.releaseLock();
        shellInputWriterRef.current = null;
      }
      if (shellProcessRef.current) {
        shellProcessRef.current.kill();
        shellProcessRef.current = null;
      }
      if (devProcessRef.current) {
        devProcessRef.current.kill();
        devProcessRef.current = null;
      }
      if (installProcessRef.current) {
        installProcessRef.current.kill();
        installProcessRef.current = null;
      }

      teardownWebContainer();
      containerRef.current = null;
      hasStartedRef.current = false;
      previousSnapshotRef.current = { files: new Map(), directories: new Set() };
      syncQueueRef.current = Promise.resolve();
      syncSequenceRef.current += 1;
      activeSyncCountRef.current = 0;
      setStatus("idle");
      setPreviewUrl(null);
      setError(null);
      setTerminalOutput("");
      setIsSyncing(false);
      setSyncError(null);
    }
  }, [projectId]);

  // Terminal dimensions tracking
  const terminalDimensionsRef = useRef<{ cols: number; rows: number }>({
    cols: 80,
    rows: 24,
  });

  // Fetch files from Convex (auto-updates on changes)
  const files = useFiles(projectId);

  // Append data safely to terminal output
  const appendOutput = useCallback((data: string) => {
    setTerminalOutput((prev) => prev + data);
  }, []);

  // Send input data from xterm directly to interactive shell input stream
  const sendTerminalInput = useCallback((data: string) => {
    if (shellInputWriterRef.current) {
      shellInputWriterRef.current.write(data).catch(() => {
        // Handle writer closure or failure
      });
    }
  }, []);

  // Resize active shell process when terminal dimensions change
  const resizeTerminal = useCallback((dimensions: { cols: number; rows: number }) => {
    if (dimensions.cols <= 0 || dimensions.rows <= 0) return;

    const previous = terminalDimensionsRef.current;
    if (previous.cols === dimensions.cols && previous.rows === dimensions.rows) return;

    terminalDimensionsRef.current = dimensions;
    try {
      shellProcessRef.current?.resize(dimensions);
    } catch {
      // Ignore resize errors if process already exited
    }
  }, []);

  // Kill/Interrupt running foreground process or reset shell
  const interruptForegroundProcess = useCallback(() => {
    sendTerminalInput("\x03");
  }, [sendTerminalInput]);

  // Initial boot and mount
  useEffect(() => {
    if (!enabled || !files || files.length === 0 || hasStartedRef.current) {
      return;
    }

    hasStartedRef.current = true;
    let isMounted = true;

    const start = async () => {
      try {
        setStatus("booting");
        setError(null);
        setTerminalOutput("");

        const container = await getWebContainer();
        if (!isMounted) return;
        containerRef.current = container;

        const fileTree = buildFileTree(files);
        await container.mount(fileTree);
        if (!isMounted) return;

        // Initialize snapshot of mounted files and directories to prevent redundant re-syncs
        previousSnapshotRef.current = extractFileTreeSnapshot(files);

        const unsubscribeServerReady = container.on("server-ready", (_port, url) => {
          if (!isMounted) return;
          setPreviewUrl(url);
          setStatus("running");
        });

        // 1. Run installation process
        setStatus("installing");

        const installCmd = settings?.installCommand?.trim() || "npm install";
        let installParsed;
        try {
          installParsed = parseCommand(installCmd);
        } catch (parseErr) {
          throw new Error(
            `Invalid install command configuration: ${parseErr instanceof Error ? parseErr.message : "Parse error"}`
          );
        }

        const { executable: installBin, args: installArgs } = installParsed;
        appendOutput(`$ ${installCmd}\n`);

        const installProcess = await container.spawn(installBin, installArgs, {
          env: settings?.envVariables,
          terminal: terminalDimensionsRef.current,
        });
        if (!isMounted) {
          installProcess.kill();
          unsubscribeServerReady();
          return;
        }
        installProcessRef.current = installProcess;

        installProcess.output.pipeTo(
          new WritableStream({
            write(data) {
              if (isMounted) appendOutput(data);
            },
          }),
        ).catch(() => {});

        const installExitCode = await installProcess.exit;
        installProcessRef.current = null;
        if (!isMounted) {
          unsubscribeServerReady();
          return;
        }

        if (installExitCode !== 0) {
          throw new Error(`${installCmd} failed with code ${installExitCode}`);
        }

        // 2. Start development server process
        const devCmd = settings?.devCommand?.trim() || "npm run dev";
        let devParsed;
        try {
          devParsed = parseCommand(devCmd);
        } catch (parseErr) {
          throw new Error(
            `Invalid development command configuration: ${parseErr instanceof Error ? parseErr.message : "Parse error"}`
          );
        }

        const { executable: devBin, args: devArgs } = devParsed;
        appendOutput(`\n$ ${devCmd}\n`);

        const devProcess = await container.spawn(devBin, devArgs, {
          env: settings?.envVariables,
          terminal: terminalDimensionsRef.current,
        });
        if (!isMounted) {
          devProcess.kill();
          unsubscribeServerReady();
          return;
        }
        devProcessRef.current = devProcess;

        devProcess.output.pipeTo(
          new WritableStream({
            write(data) {
              if (isMounted) appendOutput(data);
            },
          }),
        ).catch(() => {});

        devProcess.exit.then((exitCode) => {
          devProcessRef.current = null;
          if (isMounted && exitCode !== 0) {
            appendOutput(`\nDev server exited with code ${exitCode}\n`);
          }
        }).catch(() => {});

        // 3. Spawn persistent interactive jsh shell
        appendOutput(`\nStarting interactive shell...\n`);
        const shellProcess = await container.spawn("jsh", {
          env: settings?.envVariables,
          terminal: terminalDimensionsRef.current,
        });
        if (!isMounted) {
          shellProcess.kill();
          return;
        }
        shellProcessRef.current = shellProcess;
        shellInputWriterRef.current = shellProcess.input.getWriter();

        shellProcess.output.pipeTo(
          new WritableStream({
            write(data) {
              if (isMounted) appendOutput(data);
            },
          }),
        ).catch(() => {});

        shellProcess.exit.then((code) => {
          if (shellProcessRef.current === shellProcess) {
            shellProcessRef.current = null;
            shellInputWriterRef.current = null;
          }
          if (isMounted) {
            appendOutput(`\n[Process completed - exit code ${code}]\n`);
          }
        }).catch(() => {});

      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Unknown error");
        setStatus("error");
      }
    };

    start();

    return () => {
      isMounted = false;
      if (shellInputWriterRef.current) {
        shellInputWriterRef.current.releaseLock();
        shellInputWriterRef.current = null;
      }
      if (shellProcessRef.current) {
        shellProcessRef.current.kill();
        shellProcessRef.current = null;
      }
      if (devProcessRef.current) {
        devProcessRef.current.kill();
        devProcessRef.current = null;
      }
      if (installProcessRef.current) {
        installProcessRef.current.kill();
        installProcessRef.current = null;
      }
    };
  }, [
    projectId,
    enabled,
    files,
    restartKey,
    settings?.devCommand,
    settings?.installCommand,
    settings?.envVariables,
    appendOutput,
  ]);

  // Sync file changes (hot-reload with sequential queue diffing, mkdir, and folder pruning)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !files || status !== "running") return;

    let isEffectActive = true;
    const currentSyncSeq = ++syncSequenceRef.current;
    activeSyncCountRef.current += 1;
    setIsSyncing(true);

    // Chain sync task onto sequential promise queue to guard against concurrent interleaving
    syncQueueRef.current = syncQueueRef.current
      .then(async () => {
        if (!isEffectActive || containerRef.current !== container) return;

        const currentSnapshot = extractFileTreeSnapshot(files);
        const prevSnapshot = previousSnapshotRef.current;

        // If initial snapshot was not set, set it and return
        if (
          prevSnapshot.files.size === 0 &&
          prevSnapshot.directories.size === 0
        ) {
          previousSnapshotRef.current = currentSnapshot;
          if (currentSyncSeq >= syncSequenceRef.current) {
            setSyncError(null);
          }
          return;
        }

        const diff = computeFileTreeDiff(prevSnapshot, currentSnapshot);

        // 1. Create newly added directories (e.g. empty folders or folders for new files)
        for (const dir of diff.directoriesToCreate) {
          try {
            await container.fs.mkdir(dir, { recursive: true });
          } catch {
            // Ignore if directory already exists
          }
        }

        // 2. Prune files deleted from Convex
        for (const oldPath of diff.filesToDelete) {
          try {
            await container.fs.rm(oldPath, { recursive: true });
          } catch {
            // Ignore if file was already removed
          }
        }

        // 3. Prune deleted directories (deepest first to cleanly remove nested empty folders)
        for (const dirPath of diff.directoriesToDelete) {
          try {
            await container.fs.rm(dirPath, { recursive: true });
          } catch {
            // Ignore if directory was already removed
          }
        }

        // 4. Write new or modified files (ensuring directories exist)
        let writeFailed = false;
        let lastWriteError: unknown = null;
        for (const { path: filePath, content } of diff.filesToWrite) {
          const dir = filePath.includes("/")
            ? filePath.substring(0, filePath.lastIndexOf("/"))
            : null;

          if (dir) {
            try {
              await container.fs.mkdir(dir, { recursive: true });
            } catch {
              // Ignore if directory already exists
            }
          }

          try {
            await container.fs.writeFile(filePath, content);
          } catch (writeErr) {
            console.error(`[WebContainer] Failed to sync ${filePath}:`, writeErr);
            writeFailed = true;
            lastWriteError = writeErr;
          }
        }

        if (writeFailed) {
          throw lastWriteError || new Error("Failed to write updated files to container");
        }

        if (isEffectActive) {
          previousSnapshotRef.current = currentSnapshot;
          if (currentSyncSeq >= syncSequenceRef.current) {
            setSyncError(null);
          }
        }
      })
      .catch((err) => {
        console.error("[WebContainer] File synchronization error:", err);
        if (isEffectActive && currentSyncSeq >= syncSequenceRef.current) {
          setSyncError(
            err instanceof Error && err.message
              ? err.message
              : "Failed to synchronize files with preview",
          );
        }
      })
      .finally(() => {
        activeSyncCountRef.current = Math.max(0, activeSyncCountRef.current - 1);
        if (isEffectActive && activeSyncCountRef.current === 0) {
          setIsSyncing(false);
        }
      });

    return () => {
      isEffectActive = false;
    };
  }, [files, status, resyncTrigger]);

  // Reset when disabled
  useEffect(() => {
    if (!enabled) {
      if (shellInputWriterRef.current) {
        shellInputWriterRef.current.releaseLock();
        shellInputWriterRef.current = null;
      }
      if (shellProcessRef.current) {
        shellProcessRef.current.kill();
        shellProcessRef.current = null;
      }
      if (devProcessRef.current) {
        devProcessRef.current.kill();
        devProcessRef.current = null;
      }
      if (installProcessRef.current) {
        installProcessRef.current.kill();
        installProcessRef.current = null;
      }
      hasStartedRef.current = false;
      previousSnapshotRef.current = { files: new Map(), directories: new Set() };
      syncQueueRef.current = Promise.resolve();
      syncSequenceRef.current += 1;
      activeSyncCountRef.current = 0;
      setIsSyncing(false);
      setSyncError(null);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("idle");
      setPreviewUrl(null);
      setError(null);
    }
  }, [enabled]);

  // Restart the entire WebContainer process
  const restart = useCallback(() => {
    if (shellInputWriterRef.current) {
      shellInputWriterRef.current.releaseLock();
      shellInputWriterRef.current = null;
    }
    if (shellProcessRef.current) {
      shellProcessRef.current.kill();
      shellProcessRef.current = null;
    }
    if (devProcessRef.current) {
      devProcessRef.current.kill();
      devProcessRef.current = null;
    }
    if (installProcessRef.current) {
      installProcessRef.current.kill();
      installProcessRef.current = null;
    }

    teardownWebContainer();
    containerRef.current = null;
    hasStartedRef.current = false;
    previousSnapshotRef.current = { files: new Map(), directories: new Set() };
    syncQueueRef.current = Promise.resolve();
    syncSequenceRef.current += 1;
    activeSyncCountRef.current = 0;
    setStatus("idle");
    setPreviewUrl(null);
    setError(null);
    setIsSyncing(false);
    setSyncError(null);
    setRestartKey((k) => k + 1);
  }, []);

  const resync = useCallback(() => {
    setResyncTrigger((prev) => prev + 1);
  }, []);

  const isStale = Boolean(syncError || (isSyncing && status === "running"));

  return {
    status,
    previewUrl,
    error,
    restart,
    isSyncing,
    syncError,
    isStale,
    resync,
    terminalOutput,
    sendTerminalInput,
    resizeTerminal,
    interruptForegroundProcess,
  };
};
