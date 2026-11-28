"use client";

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

import "@xterm/xterm/css/xterm.css";

interface PreviewTerminalProps {
  output?: string;
  onData?: (data: string) => void;
  onResize?: (dimensions: { cols: number; rows: number }) => void;
  onClearRef?: React.MutableRefObject<(() => void) | null>;
  disabled?: boolean;
}

export const PreviewTerminal = ({
  output = "",
  onData,
  onResize,
  onClearRef,
  disabled = false,
}: PreviewTerminalProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastLengthRef = useRef(0);
  const resizeFrameRef = useRef<number | null>(null);
  const lastDimensionsRef = useRef<{ cols: number; rows: number } | null>(null);
  const onDataRef = useRef(onData);
  const onResizeRef = useRef(onResize);

  useEffect(() => {
    onDataRef.current = onData;
    onResizeRef.current = onResize;
  }, [onData, onResize]);

  // Connect clear callback to parent ref if provided
  useEffect(() => {
    if (onClearRef) {
      onClearRef.current = () => {
        if (terminalRef.current) {
          terminalRef.current.clear();
        }
      };
    }
    return () => {
      if (onClearRef) {
        onClearRef.current = null;
      }
    };
  }, [onClearRef]);

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      cursorStyle: "bar",
      disableStdin: disabled,
      fontSize: 12,
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      theme: {
        background: "#1f2228",
        foreground: "#f0f6fc",
        cursor: "#58a6ff",
        selectionBackground: "#3b5070",
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Connect user input directly to onData callback
    const dataDisposable = terminal.onData((data) => {
      onDataRef.current?.(data);
    });

    // Fit once per animation frame so ResizeObserver and window resize bursts coalesce.
    // Only report a dimension change when xterm's actual grid changes.
    lastDimensionsRef.current = null;
    const handleFit = () => {
      if (!containerRef.current || !terminalRef.current || !fitAddonRef.current) {
        return;
      }
      try {
        const { clientWidth, clientHeight } = containerRef.current;
        if (clientWidth <= 0 || clientHeight <= 0) return;

        fitAddon.fit();
        const dimensions = { cols: terminal.cols, rows: terminal.rows };
        if (dimensions.cols <= 0 || dimensions.rows <= 0) return;

        const previous = lastDimensionsRef.current;
        if (previous?.cols === dimensions.cols && previous.rows === dimensions.rows) return;

        lastDimensionsRef.current = dimensions;
        onResizeRef.current?.(dimensions);
      } catch {
        // Ignore fit errors when container is momentarily invisible or detaching
      }
    };

    const scheduleFit = () => {
      if (resizeFrameRef.current !== null) return;
      resizeFrameRef.current = requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        handleFit();
      });
    };

    scheduleFit();

    const resizeObserver = new ResizeObserver(scheduleFit);
    resizeObserver.observe(containerRef.current);

    window.addEventListener("resize", scheduleFit);

    return () => {
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      window.removeEventListener("resize", scheduleFit);
      resizeObserver.disconnect();
      dataDisposable.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [disabled]);

  // Handle output streaming
  useEffect(() => {
    if (!terminalRef.current) return;

    if (output.length < lastLengthRef.current) {
      terminalRef.current.clear();
      lastLengthRef.current = 0;
    }

    const newData = output.slice(lastLengthRef.current);
    if (newData) {
      terminalRef.current.write(newData);
      lastLengthRef.current = output.length;
    }
  }, [output]);

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 p-3 [&_.xterm]:h-full! [&_.xterm-viewport]:h-full! [&_.xterm-screen]:h-full! bg-sidebar focus:outline-none"
      onClick={() => {
        terminalRef.current?.focus();
      }}
    />
  );
};
