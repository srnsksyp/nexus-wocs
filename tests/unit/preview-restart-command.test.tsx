// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";

import { ProjectIdView } from "@/features/projects/components/project-id-view";
import { usePreviewRestartStore } from "@/features/preview/store/use-preview-restart-store";
import { Id } from "../../../../convex/_generated/dataModel";

// Polyfill ResizeObserver and scrollIntoView for jsdom (needed by cmdk / Radix)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

if (typeof window !== "undefined") {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
}

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock convex useProject hook
let mockProject: { _id: string; name: string } | null | undefined = {
  _id: "project_1",
  name: "Test Project",
};

vi.mock("@/features/projects/hooks/use-projects", () => ({
  useProject: () => mockProject,
}));

// Mock useFiles hook
let mockFiles: Array<{
  _id: string;
  name: string;
  type: "file" | "folder";
  parentId?: string;
  projectId: string;
}> | null = [
  { _id: "file_1", name: "index.ts", type: "file", projectId: "project_1" },
  { _id: "file_2", name: "App.tsx", type: "file", projectId: "project_1" },
];

vi.mock("@/features/projects/hooks/use-files", () => ({
  useFiles: () => mockFiles,
  useFile: (id: string) => mockFiles?.find((f) => f._id === id),
}));

// Mock useEditor hook
const mockOpenFile = vi.fn();
vi.mock("@/features/editor/hooks/use-editor", () => ({
  useEditor: () => ({
    openFile: mockOpenFile,
    openTabs: [],
    activeTabId: null,
  }),
}));

// Mock child components to keep unit test isolated
vi.mock("@/features/editor/components/editor-view", () => ({
  EditorView: () => <div data-testid="editor-view" />,
}));
vi.mock("@/features/projects/components/file-explorer", () => ({
  FileExplorer: () => <div data-testid="file-explorer" />,
}));
vi.mock("@/features/projects/components/export-popover", () => ({
  ExportPopover: () => <div data-testid="export-popover" />,
}));
vi.mock("@/features/projects/components/preview-view", () => ({
  PreviewView: () => <div data-testid="preview-view" />,
}));

vi.mock("allotment", () => ({
  Allotment: Object.assign(
    ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    { Pane: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }
  ),
}));

describe("Issue #124 — Command palette preview restart action", () => {
  const projectId = "project_1" as Id<"projects">;
  const mockRestart = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockProject = { _id: "project_1", name: "Test Project" };
    mockFiles = [
      { _id: "file_1", name: "index.ts", type: "file", projectId: "project_1" },
    ];
    // Reset preview restart store
    usePreviewRestartStore.setState({
      projectId: null,
      restart: null,
      status: "idle",
    });
  });

  const openPalette = () => {
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "p", ctrlKey: true })
      );
    });
  };

  it("registers Restart Preview action inside an active project context", () => {
    usePreviewRestartStore.setState({
      projectId,
      restart: mockRestart,
      status: "running",
    });

    render(<ProjectIdView projectId={projectId} />);
    openPalette();

    expect(screen.getByText("Restart Preview")).toBeInTheDocument();
    expect(screen.getAllByText("Actions").length).toBeGreaterThanOrEqual(1);
  });

  it("invokes the existing WebContainer restart function when selected", async () => {
    const { toast } = await import("sonner");
    usePreviewRestartStore.setState({
      projectId,
      restart: mockRestart,
      status: "running",
    });

    render(<ProjectIdView projectId={projectId} />);
    openPalette();

    const restartItem = screen.getByText("Restart Preview").closest('[role="option"]');
    expect(restartItem).not.toBeNull();

    act(() => {
      fireEvent.click(restartItem!);
    });

    expect(mockRestart).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Restarting preview...");
    // Dialog should close after selection
    expect(screen.queryByPlaceholderText("Search files by name or path...")).toBeNull();
  });

  it("disables Restart Preview action when status is 'booting'", () => {
    usePreviewRestartStore.setState({
      projectId,
      restart: mockRestart,
      status: "booting",
    });

    render(<ProjectIdView projectId={projectId} />);
    openPalette();

    const restartOption = screen.getByText("Restarting Preview...").closest('[role="option"]');
    expect(restartOption).toHaveAttribute("data-disabled", "true");
    expect(restartOption).toHaveAttribute("aria-disabled", "true");

    act(() => {
      fireEvent.click(restartOption!);
    });

    expect(mockRestart).not.toHaveBeenCalled();
  });

  it("disables Restart Preview action when status is 'installing'", () => {
    usePreviewRestartStore.setState({
      projectId,
      restart: mockRestart,
      status: "installing",
    });

    render(<ProjectIdView projectId={projectId} />);
    openPalette();

    const restartOption = screen.getByText("Restarting Preview...").closest('[role="option"]');
    expect(restartOption).toHaveAttribute("data-disabled", "true");
    expect(restartOption).toHaveAttribute("aria-disabled", "true");

    act(() => {
      fireEvent.click(restartOption!);
    });

    expect(mockRestart).not.toHaveBeenCalled();
  });

  it("shows unavailable state when preview restart handler is not registered", () => {
    usePreviewRestartStore.setState({
      projectId: null,
      restart: null,
      status: "idle",
    });

    render(<ProjectIdView projectId={projectId} />);
    openPalette();

    const restartOption = screen.getByText("Restart Preview (Unavailable)").closest('[role="option"]');
    expect(restartOption).toHaveAttribute("data-disabled", "true");
    expect(restartOption).toHaveAttribute("aria-disabled", "true");

    act(() => {
      fireEvent.click(restartOption!);
    });

    expect(mockRestart).not.toHaveBeenCalled();
  });

  it("supports searchable keywords for discoverability (preview, reload, webcontainer)", () => {
    usePreviewRestartStore.setState({
      projectId,
      restart: mockRestart,
      status: "running",
    });

    render(<ProjectIdView projectId={projectId} />);
    openPalette();

    const restartOption = screen.getByText("Restart Preview").closest('[role="option"]');
    // cmdk stores filter value in value attribute or internal text
    const valueAttr = restartOption?.getAttribute("data-value") || restartOption?.getAttribute("value");
    expect(valueAttr).toMatch(/restart/i);
    expect(valueAttr).toMatch(/preview/i);
    expect(valueAttr).toMatch(/reload/i);
    expect(valueAttr).toMatch(/webcontainer/i);
  });

  it("does not trigger restart when another project preview is active in the store", () => {
    const otherProjectId = "project_other" as Id<"projects">;
    usePreviewRestartStore.setState({
      projectId: otherProjectId,
      restart: mockRestart,
      status: "running",
    });

    render(<ProjectIdView projectId={projectId} />);
    openPalette();

    // Since store has a different project's preview, it should show as unavailable for this project
    const restartOption = screen.getByText("Restart Preview (Unavailable)").closest('[role="option"]');
    expect(restartOption).toHaveAttribute("data-disabled", "true");

    act(() => {
      fireEvent.click(restartOption!);
    });

    expect(mockRestart).not.toHaveBeenCalled();
  });
});
