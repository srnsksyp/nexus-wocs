// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";

// Mock @xterm/xterm and @xterm/addon-fit
let mockClearFn = vi.fn();
let mockWriteFn = vi.fn();
let mockDisposeFn = vi.fn();
let mockFocusFn = vi.fn();
let mockFitFn = vi.fn();
let mockTerminalInstances: Array<{ cols: number; rows: number }> = [];
let mockResizeObserverCallback: (() => void) | null = null;
const mockAnimationFrames = new Map<number, FrameRequestCallback>();
let mockAnimationFrameId = 0;
const mockOnDataFn = vi.fn(() => ({ dispose: vi.fn() }));

const flushAnimationFrames = () => {
  const callbacks = Array.from(mockAnimationFrames.values());
  mockAnimationFrames.clear();
  act(() => {
    callbacks.forEach((callback) => callback(0));
  });
};

vi.mock("@xterm/xterm", () => {
  class MockTerminal {
    constructor() {
      mockTerminalInstances.push(this);
    }
    open = vi.fn();
    loadAddon = vi.fn();
    clear = mockClearFn;
    write = mockWriteFn;
    dispose = mockDisposeFn;
    focus = mockFocusFn;
    onData = mockOnDataFn;
    cols = 80;
    rows = 24;
  }
  return {
    Terminal: MockTerminal,
  };
});

vi.mock("@xterm/addon-fit", () => {
  return {
    FitAddon: vi.fn().mockImplementation(() => ({
      fit: mockFitFn,
    })),
  };
});

// Mock CSS import
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

// Mock toast
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

// Mock the v4 panel primitives while preserving their accessible DOM contract.
vi.mock("react-resizable-panels", () => ({
  Group: ({ children, className, orientation }: { children: React.ReactNode; className?: string; orientation?: string }) => (
    <div className={className} data-orientation={orientation}>{children}</div>
  ),
  Panel: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  Separator: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div role="separator" tabIndex={0} {...props}>{children}</div>
  ),
}));

vi.mock("@/features/preview/components/preview-settings-popover", () => ({
  PreviewSettingsPopover: () => <div data-testid="settings-popover" />,
}));

// Mock useWebContainer
let mockRestart = vi.fn();
const mockResync = vi.fn();
const mockSendTerminalInput = vi.fn();
const mockResizeTerminal = vi.fn();
const mockInterruptForegroundProcess = vi.fn();
let mockTerminalOutput = "";
let mockStatus = "ready";
let mockPreviewUrl: string | null = "http://localhost:3000";
let mockError: string | null = null;
const mockIsSyncing = false;
const mockSyncError: string | null = null;
const mockIsStale = false;

vi.mock("@/features/preview/hooks/use-webcontainer", () => ({
  useWebContainer: () => ({
    status: mockStatus,
    previewUrl: mockPreviewUrl,
    error: mockError,
    restart: mockRestart,
    resync: mockResync,
    isSyncing: mockIsSyncing,
    syncError: mockSyncError,
    isStale: mockIsStale,
    terminalOutput: mockTerminalOutput,
    sendTerminalInput: mockSendTerminalInput,
    resizeTerminal: mockResizeTerminal,
    interruptForegroundProcess: mockInterruptForegroundProcess,
  }),
}));

vi.mock("@/features/projects/hooks/use-projects", () => ({
  useProject: () => ({ _id: "proj_1", name: "Test Project", settings: {} }),
}));

import { PreviewTerminal } from "@/features/preview/components/preview-terminal";
import { PreviewView } from "@/features/projects/components/preview-view";
import { Id } from "@/../convex/_generated/dataModel";

describe("Issue #47 — Accessible Clear-Terminal Control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClearFn = vi.fn();
    mockWriteFn = vi.fn();
    mockDisposeFn = vi.fn();
    mockFocusFn = vi.fn();
    mockFitFn = vi.fn();
    mockTerminalInstances = [];
    mockResizeObserverCallback = null;
    mockAnimationFrames.clear();
    mockAnimationFrameId = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = ++mockAnimationFrameId;
      mockAnimationFrames.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      mockAnimationFrames.delete(id);
    });
    mockRestart = vi.fn();
    mockTerminalOutput = "";
    mockStatus = "ready";
    mockPreviewUrl = "http://localhost:3000";
    mockError = null;

    // Polyfill ResizeObserver for jsdom
    global.ResizeObserver = class ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        mockResizeObserverCallback = () => callback([], this);
      }
      observe() {}
      unobserve() {}
      disconnect() {
        mockResizeObserverCallback = null;
      }
    } as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    mockAnimationFrames.clear();
  });

  it("reports changed terminal dimensions once when pane resize notifications are bursty", () => {
    const onResize = vi.fn();
    const { container } = render(<PreviewTerminal onResize={onResize} />);
    const terminalContainer = container.querySelector(".bg-sidebar") as HTMLDivElement;

    Object.defineProperty(terminalContainer, "clientWidth", { configurable: true, value: 800 });
    Object.defineProperty(terminalContainer, "clientHeight", { configurable: true, value: 400 });

    // Initial fit reports the current grid.
    flushAnimationFrames();
    expect(mockFitFn).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenLastCalledWith({ cols: 80, rows: 24 });

    // Several observer notifications for one pane resize collapse into one fit.
    const terminal = mockTerminalInstances[0];
    terminal.cols = 120;
    terminal.rows = 36;
    act(() => {
      mockResizeObserverCallback?.();
      mockResizeObserverCallback?.();
      mockResizeObserverCallback?.();
    });
    expect(mockAnimationFrames.size).toBe(1);
    flushAnimationFrames();

    expect(mockFitFn).toHaveBeenCalledTimes(2);
    expect(onResize).toHaveBeenCalledTimes(2);
    expect(onResize).toHaveBeenLastCalledWith({ cols: 120, rows: 36 });

    // An observer notification with the same grid must not resize the shell again.
    act(() => mockResizeObserverCallback?.());
    flushAnimationFrames();
    expect(mockFitFn).toHaveBeenCalledTimes(3);
    expect(onResize).toHaveBeenCalledTimes(2);

    // A row-only change is still propagated.
    terminal.rows = 35;
    act(() => mockResizeObserverCallback?.());
    flushAnimationFrames();
    expect(onResize).toHaveBeenCalledTimes(3);
    expect(onResize).toHaveBeenLastCalledWith({ cols: 120, rows: 35 });
  });

  it("exposes a focusable resize separator with an accessible name", () => {
    render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

    const separator = screen.getByRole("separator", { name: "Resize preview and terminal" });
    expect(separator.getAttribute("tabindex")).toBe("0");
  });

  it("keeps terminal actions reachable in a wrapping toolbar", () => {
    render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

    const toolbar = screen.getByTestId("terminal-toolbar");
    expect(toolbar.className).toContain("flex-wrap");
    expect(screen.getByRole("button", { name: "Interrupt foreground process" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Clear terminal" })).toBeDefined();
  });

  // Test 1 — Accessible clear control
  it("Test 1 — renders clear button with accessible name 'Clear terminal' and title 'Clear terminal'", () => {
    render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

    const clearButton = screen.getByRole("button", { name: "Clear terminal" });
    expect(clearButton).toBeDefined();
    expect(clearButton.getAttribute("aria-label")).toBe("Clear terminal");
    expect(clearButton.getAttribute("title")).toBe("Clear terminal");
  });

  // Test 2 — Clear click handler invokes clear callback
  it("Test 2 — clicking clear button invokes clear action on xterm instance", () => {
    render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

    const clearButton = screen.getByRole("button", { name: "Clear terminal" });
    act(() => {
      fireEvent.click(clearButton);
    });

    expect(mockClearFn).toHaveBeenCalledTimes(1);
  });

  // Test 3 — xterm buffer clearing does not recreate or dispose terminal
  it("Test 3 — xterm clear clears screen and scrollback on existing instance without disposing it", () => {
    const clearRef = { current: null as (() => void) | null };
    render(
      <PreviewTerminal
        output="initial log"
        onClearRef={clearRef}
      />
    );

    expect(clearRef.current).toBeTypeOf("function");
    expect(mockWriteFn.mock.calls[0][0]).toBe("initial log");

    act(() => {
      clearRef.current?.();
    });

    expect(mockClearFn).toHaveBeenCalledTimes(1);
    expect(mockDisposeFn).not.toHaveBeenCalled();
  });

  // Test 4 — Output after clearing
  it("Test 4 — writes subsequent incremental output correctly after clearing without replaying old output", () => {
    const clearRef = { current: null as (() => void) | null };
    const { rerender } = render(
      <PreviewTerminal
        output="chunk 1"
        onClearRef={clearRef}
      />
    );

    expect(mockWriteFn).toHaveBeenCalledTimes(1);
    expect(mockWriteFn.mock.calls[0][0]).toBe("chunk 1");

    // Clear terminal
    act(() => {
      clearRef.current?.();
    });
    expect(mockClearFn).toHaveBeenCalledTimes(1);

    // Provide new incremental output
    rerender(
      <PreviewTerminal
        output="chunk 1chunk 2"
        onClearRef={clearRef}
      />
    );

    // Only chunk 2 should be written, chunk 1 must not be replayed
    expect(mockWriteFn).toHaveBeenCalledTimes(2);
    expect(mockWriteFn.mock.calls[1][0]).toBe("chunk 2");
  });

  // Test 5 — Active processes and input handlers remain untouched
  it("Test 5 — clearing does not restart webcontainer or invoke kill handlers", () => {
    render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

    const clearButton = screen.getByRole("button", { name: "Clear terminal" });
    act(() => {
      fireEvent.click(clearButton);
    });

    expect(mockClearFn).toHaveBeenCalledTimes(1);
    expect(mockRestart).not.toHaveBeenCalled();
  });

  // Test 6 — Empty terminal clear
  it("Test 6 — clearing an empty terminal is safe and does not throw", () => {
    const clearRef = { current: null as (() => void) | null };
    render(<PreviewTerminal output="" onClearRef={clearRef} />);

    expect(() => {
      act(() => {
        clearRef.current?.();
      });
    }).not.toThrow();

    expect(mockClearFn).toHaveBeenCalledTimes(1);
  });

  // Test 7 — Safe initialization/disposal
  it("Test 7 — clear request before initialization or after disposal does not throw errors", () => {
    const clearRef = { current: null as (() => void) | null };
    const { unmount } = render(<PreviewTerminal onClearRef={clearRef} />);

    // Before unmount, function is active
    expect(clearRef.current).toBeTypeOf("function");

    // Unmount terminal
    unmount();

    // After disposal, clearRef is cleaned up to null and calling it safely handles null
    expect(clearRef.current).toBeNull();
    expect(() => clearRef.current?.()).not.toThrow();
  });

  // Test 8 — Existing restart and toggle terminal behavior preserved
  it("Test 8 — preserves existing restart and toggle terminal functionality", () => {
    render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

    const restartButton = screen.getByTitle("Restart container");
    fireEvent.click(restartButton);
    expect(mockRestart).toHaveBeenCalledTimes(1);

    const toggleButton = screen.getByTitle("Toggle terminal");
    // Initially clear and interrupt terminal controls are present
    expect(screen.getByRole("button", { name: "Clear terminal" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Interrupt foreground process" })).toBeDefined();

    // Toggle off
    fireEvent.click(toggleButton);
    expect(screen.queryByRole("button", { name: "Clear terminal" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Interrupt foreground process" })).toBeNull();

    // Toggle back on
    fireEvent.click(toggleButton);
    expect(screen.getByRole("button", { name: "Clear terminal" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Interrupt foreground process" })).toBeDefined();
  });

  // Issue #53 tests
  it("Issue #53 — renders interrupt button with accessible name and title", () => {
    render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

    const interruptButton = screen.getByRole("button", { name: "Interrupt foreground process" });
    expect(interruptButton).toBeDefined();
    expect(interruptButton.getAttribute("aria-label")).toBe("Interrupt foreground process");
    expect(interruptButton.getAttribute("title")).toBe("Interrupt foreground process");
  });

  it("Issue #53 — clicking interrupt button invokes interruptForegroundProcess callback", () => {
    render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

    const interruptButton = screen.getByRole("button", { name: "Interrupt foreground process" });
    act(() => {
      fireEvent.click(interruptButton);
    });

    expect(mockInterruptForegroundProcess).toHaveBeenCalledTimes(1);
    expect(mockRestart).not.toHaveBeenCalled();
  });

  describe("Issue #76 — Preview URL Actions (Copy and Open)", () => {
    let originalClipboard: Clipboard | undefined;

    beforeEach(() => {
      originalClipboard = navigator.clipboard;
    });

    afterEach(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: originalClipboard,
        configurable: true,
        writable: true,
      });
    });

    // Rendering
    it("renders Copy and Open controls when a valid preview URL exists", () => {
      mockPreviewUrl = "https://preview.nexus.dev/app";
      render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

      const copyBtn = screen.getByRole("button", { name: "Copy preview URL" });
      const openBtn = screen.getByRole("link", { name: "Open preview URL" });

      expect(copyBtn).toBeDefined();
      expect(copyBtn.getAttribute("title")).toBe("Copy preview URL");
      expect(openBtn).toBeDefined();
      expect(openBtn.getAttribute("title")).toBe("Open preview URL");
    });

    it("controls are unavailable when previewUrl is absent (null)", () => {
      mockPreviewUrl = null;
      render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

      expect(screen.queryByRole("button", { name: "Copy preview URL" })).toBeNull();
      expect(screen.queryByRole("link", { name: "Open preview URL" })).toBeNull();
      expect(screen.getByText("Ready to preview")).toBeDefined();
    });

    it("controls are unavailable when previewUrl is empty string", () => {
      mockPreviewUrl = "";
      render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

      expect(screen.queryByRole("button", { name: "Copy preview URL" })).toBeNull();
      expect(screen.queryByRole("link", { name: "Open preview URL" })).toBeNull();
    });

    it("existing URL display remains rendered and preserved alongside controls", () => {
      mockPreviewUrl = "https://preview.nexus.dev/app/test-url";
      render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

      const urlSpan = screen.getByText("https://preview.nexus.dev/app/test-url");
      expect(urlSpan).toBeDefined();
      expect(urlSpan.className).toContain("truncate");
    });

    // Clipboard
    it("clicking Copy URL calls navigator.clipboard.writeText with current preview URL and shows success toast", async () => {
      mockPreviewUrl = "https://preview.nexus.dev/myapp";
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: writeTextMock },
        configurable: true,
        writable: true,
      });

      render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

      const copyBtn = screen.getByRole("button", { name: "Copy preview URL" });
      await act(async () => {
        fireEvent.click(copyBtn);
      });

      expect(writeTextMock).toHaveBeenCalledTimes(1);
      expect(writeTextMock).toHaveBeenCalledWith("https://preview.nexus.dev/myapp");
      expect(mockToastSuccess).toHaveBeenCalledWith("Preview URL copied to clipboard");
      expect(mockToastError).not.toHaveBeenCalled();
    });

    it("rejected clipboard operation displays actionable error toast without crashing", async () => {
      mockPreviewUrl = "https://preview.nexus.dev/myapp";
      const writeTextMock = vi.fn().mockRejectedValue(new Error("Permission denied"));
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: writeTextMock },
        configurable: true,
        writable: true,
      });

      render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

      const copyBtn = screen.getByRole("button", { name: "Copy preview URL" });
      await act(async () => {
        fireEvent.click(copyBtn);
      });

      expect(writeTextMock).toHaveBeenCalledTimes(1);
      expect(mockToastError).toHaveBeenCalledWith(
        "Couldn't copy the preview URL. Check clipboard permissions or copy it manually."
      );
      expect(mockToastSuccess).not.toHaveBeenCalled();
    });

    it("missing clipboard support displays actionable fallback feedback without crashing", async () => {
      mockPreviewUrl = "https://preview.nexus.dev/myapp";
      Object.defineProperty(navigator, "clipboard", {
        value: undefined,
        configurable: true,
        writable: true,
      });

      render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

      const copyBtn = screen.getByRole("button", { name: "Copy preview URL" });
      await act(async () => {
        fireEvent.click(copyBtn);
      });

      expect(mockToastError).toHaveBeenCalledWith(
        "Clipboard access is unavailable. Copy the preview URL manually."
      );
      expect(mockToastSuccess).not.toHaveBeenCalled();
    });

    it("suppresses stale success notification if preview URL changes during in-flight clipboard write", async () => {
      mockPreviewUrl = "https://preview-url-a.nexus.dev";
      let resolveClipboardWrite!: () => void;
      const writePromise = new Promise<void>((resolve) => {
        resolveClipboardWrite = resolve;
      });
      const writeTextMock = vi.fn().mockReturnValue(writePromise);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: writeTextMock },
        configurable: true,
        writable: true,
      });

      const { rerender } = render(<PreviewView projectId={"proj_1" as Id<"projects">} />);
      const copyBtn = screen.getByRole("button", { name: "Copy preview URL" });

      // Start copying URL A
      act(() => {
        fireEvent.click(copyBtn);
      });

      expect(writeTextMock).toHaveBeenCalledWith("https://preview-url-a.nexus.dev");

      // Change preview URL to URL B while write is pending
      mockPreviewUrl = "https://preview-url-b.nexus.dev";
      rerender(<PreviewView projectId={"proj_1" as Id<"projects">} />);

      // Now resolve clipboard write for URL A
      await act(async () => {
        resolveClipboardWrite();
      });

      // Because URL A is no longer current, notification should be suppressed to avoid claiming URL B was copied
      expect(mockToastSuccess).not.toHaveBeenCalled();
      expect(mockToastError).not.toHaveBeenCalled();
    });

    it("suppresses stale failure notification if preview URL changes during in-flight clipboard failure", async () => {
      mockPreviewUrl = "https://preview-url-a.nexus.dev";
      let rejectClipboardWrite!: (err: Error) => void;
      const writePromise = new Promise<void>((_, reject) => {
        rejectClipboardWrite = reject;
      });
      const writeTextMock = vi.fn().mockReturnValue(writePromise);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: writeTextMock },
        configurable: true,
        writable: true,
      });

      const { rerender } = render(<PreviewView projectId={"proj_1" as Id<"projects">} />);
      const copyBtn = screen.getByRole("button", { name: "Copy preview URL" });

      // Start copying URL A
      act(() => {
        fireEvent.click(copyBtn);
      });

      // Change preview URL to URL B
      mockPreviewUrl = "https://preview-url-b.nexus.dev";
      rerender(<PreviewView projectId={"proj_1" as Id<"projects">} />);

      // Reject clipboard write for URL A
      await act(async () => {
        rejectClipboardWrite(new Error("Permission denied"));
      });

      // Suppress stale error notification
      expect(mockToastError).not.toHaveBeenCalled();
    });

    it("handles rapid URL changes and repeated copy attempts safely", async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: writeTextMock },
        configurable: true,
        writable: true,
      });

      mockPreviewUrl = "https://preview-rapid-1.nexus.dev";
      const { rerender } = render(<PreviewView projectId={"proj_1" as Id<"projects">} />);
      let copyBtn = screen.getByRole("button", { name: "Copy preview URL" });

      await act(async () => {
        fireEvent.click(copyBtn);
      });
      expect(writeTextMock).toHaveBeenCalledWith("https://preview-rapid-1.nexus.dev");
      expect(mockToastSuccess).toHaveBeenCalledWith("Preview URL copied to clipboard");

      mockToastSuccess.mockClear();

      // Change to URL 2
      mockPreviewUrl = "https://preview-rapid-2.nexus.dev";
      rerender(<PreviewView projectId={"proj_1" as Id<"projects">} />);
      copyBtn = screen.getByRole("button", { name: "Copy preview URL" });

      await act(async () => {
        fireEvent.click(copyBtn);
      });
      expect(writeTextMock).toHaveBeenCalledWith("https://preview-rapid-2.nexus.dev");
      expect(mockToastSuccess).toHaveBeenCalledWith("Preview URL copied to clipboard");
    });

    // Opening
    it("open control has safe external link attributes (target='_blank' and rel='noopener noreferrer')", () => {
      mockPreviewUrl = "https://preview.nexus.dev/site";
      render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

      const openLink = screen.getByRole("link", { name: "Open preview URL" });
      expect(openLink.getAttribute("href")).toBe("https://preview.nexus.dev/site");
      expect(openLink.getAttribute("target")).toBe("_blank");
      expect(openLink.getAttribute("rel")).toBe("noopener noreferrer");
    });

    // Reactivity
    it("uses updated preview URL when URL changes after restart", async () => {
      mockPreviewUrl = "https://preview-1.nexus.dev";
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: writeTextMock },
        configurable: true,
        writable: true,
      });

      const { rerender } = render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

      let copyBtn = screen.getByRole("button", { name: "Copy preview URL" });
      let openLink = screen.getByRole("link", { name: "Open preview URL" });
      expect(openLink.getAttribute("href")).toBe("https://preview-1.nexus.dev");

      // Update URL to new port/host
      mockPreviewUrl = "https://preview-2.nexus.dev";
      rerender(<PreviewView projectId={"proj_1" as Id<"projects">} />);

      copyBtn = screen.getByRole("button", { name: "Copy preview URL" });
      openLink = screen.getByRole("link", { name: "Open preview URL" });
      expect(openLink.getAttribute("href")).toBe("https://preview-2.nexus.dev");

      await act(async () => {
        fireEvent.click(copyBtn);
      });

      expect(writeTextMock).toHaveBeenCalledWith("https://preview-2.nexus.dev");
      expect(mockToastSuccess).toHaveBeenCalledWith("Preview URL copied to clipboard");
    });
  });
});
