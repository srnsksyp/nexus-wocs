// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";

// Mock @xterm/xterm and @xterm/addon-fit
vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    open = vi.fn();
    loadAddon = vi.fn();
    clear = vi.fn();
    write = vi.fn();
    dispose = vi.fn();
    focus = vi.fn();
    onData = vi.fn(() => ({ dispose: vi.fn() }));
  },
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: vi.fn().mockImplementation(() => ({ fit: vi.fn() })),
}));

vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

// Mock allotment and popovers
vi.mock("allotment", () => ({
  Allotment: Object.assign(
    ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    { Pane: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }
  ),
}));

vi.mock("@/features/preview/components/preview-settings-popover", () => ({
  PreviewSettingsPopover: () => <div data-testid="settings-popover" />,
}));

vi.mock("@/features/projects/hooks/use-projects", () => ({
  useProject: () => ({ _id: "proj_1", name: "Test Project", settings: {} }),
}));

let mockUseWebContainerReturn = {
  status: "running" as "idle" | "booting" | "installing" | "running" | "error",
  previewUrl: "http://localhost:3000" as string | null,
  error: null as string | null,
  restart: vi.fn(),
  resync: vi.fn(),
  isSyncing: false,
  syncError: null as string | null,
  isStale: false,
  terminalOutput: "",
  sendTerminalInput: vi.fn(),
  resizeTerminal: vi.fn(),
  interruptForegroundProcess: vi.fn(),
};

vi.mock("@/features/preview/hooks/use-webcontainer", () => ({
  useWebContainer: () => mockUseWebContainerReturn,
}));

import { PreviewView } from "@/features/projects/components/preview-view";
import { Id } from "@/../convex/_generated/dataModel";

describe("PreviewView — Stale-preview indicator and sync state (Issue #133)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    mockUseWebContainerReturn = {
      status: "running",
      previewUrl: "http://localhost:3000",
      error: null,
      restart: vi.fn(),
      resync: vi.fn(),
      isSyncing: false,
      syncError: null,
      isStale: false,
      terminalOutput: "",
      sendTerminalInput: vi.fn(),
      resizeTerminal: vi.fn(),
      interruptForegroundProcess: vi.fn(),
    };
  });

  it("does not display stale or syncing indicators when running and in sync", () => {
    render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

    expect(screen.queryByText("Preview may be out of date")).toBeNull();
    expect(screen.queryByText("Syncing preview...")).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry sync" })).toBeNull();
  });

  it("displays pending synchronization indicator when files are syncing", () => {
    mockUseWebContainerReturn.isSyncing = true;
    render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

    expect(screen.getByText("Syncing preview...")).toBeDefined();
    expect(screen.queryByText("Preview may be out of date")).toBeNull();
  });

  it("displays stale preview warning and retry button when synchronization fails", () => {
    mockUseWebContainerReturn.syncError = "Failed to write file /src/index.ts";
    mockUseWebContainerReturn.isStale = true;
    render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

    expect(screen.getByText("Preview may be out of date")).toBeDefined();
    const retryBtn = screen.getByRole("button", { name: "Retry sync" });
    expect(retryBtn).toBeDefined();
    expect(retryBtn).toHaveProperty("disabled", false);
  });

  it("shows the actionable synchronization error in an accessible alert", () => {
    mockUseWebContainerReturn.syncError =
      'Couldn\'t write the file "src/index.ts" to the preview.';
    mockUseWebContainerReturn.isStale = true;
    render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Preview synchronization failed");
    expect(alert).toHaveTextContent('Couldn\'t write the file "src/index.ts" to the preview.');
    expect(alert).toHaveTextContent("Preview may be out of date");
    expect(screen.getByRole("button", { name: "Retry sync" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restart" })).not.toBeInTheDocument();
  });

  it("keeps boot/install errors in the container restart state, not the sync alert", () => {
    mockUseWebContainerReturn.status = "error";
    mockUseWebContainerReturn.error = "npm install failed";
    mockUseWebContainerReturn.syncError = null;
    render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

    expect(screen.getByText("npm install failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restart" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("disables retry button while a sync attempt is currently in progress", () => {
    mockUseWebContainerReturn.syncError = "Previous sync failed";
    mockUseWebContainerReturn.isSyncing = true;
    render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

    const retryBtn = screen.getByRole("button", { name: "Retry sync" });
    expect(retryBtn).toBeDefined();
    expect(retryBtn.getAttribute("disabled")).not.toBeNull();
  });

  it("calls resync when Retry sync button is clicked", () => {
    mockUseWebContainerReturn.syncError = "Previous sync failed";
    render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

    const retryBtn = screen.getByRole("button", { name: "Retry sync" });
    act(() => {
      fireEvent.click(retryBtn);
    });

    expect(mockUseWebContainerReturn.resync).toHaveBeenCalledTimes(1);
    expect(mockUseWebContainerReturn.restart).not.toHaveBeenCalled();
  });

  it("clears the stale warning once synchronization completes successfully", () => {
    mockUseWebContainerReturn.syncError = "Temporary sync failure";
    const { rerender } = render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

    expect(screen.getByText("Preview may be out of date")).toBeDefined();

    // After successful recovery
    mockUseWebContainerReturn.syncError = null;
    mockUseWebContainerReturn.isSyncing = false;
    rerender(<PreviewView projectId={"proj_1" as Id<"projects">} />);

    expect(screen.queryByText("Preview may be out of date")).toBeNull();
    expect(screen.queryByText("Syncing preview...")).toBeNull();
  });

  it("does not show stale indicators when container is not running (e.g. booting)", () => {
    mockUseWebContainerReturn.status = "booting";
    mockUseWebContainerReturn.syncError = "Error";
    render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

    expect(screen.queryByText("Preview may be out of date")).toBeNull();
  });
});
