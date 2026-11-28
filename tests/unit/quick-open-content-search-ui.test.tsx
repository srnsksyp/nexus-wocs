// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

import { ProjectIdView } from "@/features/projects/components/project-id-view";
import { Id, Doc } from "../../../../convex/_generated/dataModel";

// Polyfill ResizeObserver and scrollIntoView for jsdom
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

if (typeof window !== "undefined") {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
}

// Mock sonner
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
let mockFiles: Doc<"files">[] | null | undefined = [
  {
    _id: "file_1" as Id<"files">,
    _creationTime: 100,
    name: "index.ts",
    type: "file",
    content: "import { calculateSum } from './math';\nconsole.log(calculateSum(1, 2));",
    projectId: "project_1" as Id<"projects">,
    updatedAt: 100,
  },
  {
    _id: "file_2" as Id<"files">,
    _creationTime: 101,
    name: "math.ts",
    type: "file",
    content: "export function calculateSum(a: number, b: number) {\n  return a + b;\n}",
    projectId: "project_1" as Id<"projects">,
    updatedAt: 101,
  },
  {
    _id: "file_3" as Id<"files">,
    _creationTime: 102,
    name: "logo.png",
    type: "file",
    storageId: "storage_1" as Id<"_storage">,
    projectId: "project_1" as Id<"projects">,
    updatedAt: 102,
  },
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

// Mock child components
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

describe("Quick Open content search UI & integration (Issue #126)", () => {
  const projectId = "project_1" as Id<"projects">;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProject = { _id: "project_1", name: "Test Project" };
    mockFiles = [
      {
        _id: "file_1" as Id<"files">,
        _creationTime: 100,
        name: "index.ts",
        type: "file",
        content: "import { calculateSum } from './math';\nconsole.log(calculateSum(1, 2));",
        projectId: "project_1" as Id<"projects">,
        updatedAt: 100,
      },
      {
        _id: "file_2" as Id<"files">,
        _creationTime: 101,
        name: "math.ts",
        type: "file",
        content: "export function calculateSum(a: number, b: number) {\n  return a + b;\n}",
        projectId: "project_1" as Id<"projects">,
        updatedAt: 101,
      },
      {
        _id: "file_3" as Id<"files">,
        _creationTime: 102,
        name: "logo.png",
        type: "file",
        storageId: "storage_1" as Id<"_storage">,
        projectId: "project_1" as Id<"projects">,
        updatedAt: 102,
      },
    ];
  });

  const openQuickOpen = () => {
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "p", ctrlKey: true })
      );
    });
  };

  it("renders with Path (Files) search mode as default", () => {
    render(<ProjectIdView projectId={projectId} />);
    openQuickOpen();

    expect(screen.getByPlaceholderText("Search files by name or path...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /files/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /content/i })).toBeInTheDocument();
  });

  it("switches to Content mode when Content toggle button is clicked", () => {
    render(<ProjectIdView projectId={projectId} />);
    openQuickOpen();

    const contentButton = screen.getByRole("button", { name: /content/i });
    act(() => {
      fireEvent.click(contentButton);
    });

    expect(screen.getByPlaceholderText("Search file contents...")).toBeInTheDocument();
    expect(screen.getByText("Type text or symbols to search file contents...")).toBeInTheDocument();
  });

  it("switches to Content mode automatically when query is prefixed with @ or text:", () => {
    render(<ProjectIdView projectId={projectId} />);
    openQuickOpen();

    const input = screen.getByPlaceholderText("Search files by name or path...");
    act(() => {
      fireEvent.change(input, { target: { value: "@calculateSum" } });
    });

    expect(screen.getByPlaceholderText("Search file contents...")).toBeInTheDocument();
    // Matching content should be displayed from math.ts and index.ts
    expect(screen.getAllByText("math.ts").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("index.ts").length).toBeGreaterThanOrEqual(1);
  });

  it("displays file name, path with line number, and content preview for matches", () => {
    render(<ProjectIdView projectId={projectId} />);
    openQuickOpen();

    const contentButton = screen.getByRole("button", { name: /content/i });
    act(() => {
      fireEvent.click(contentButton);
    });

    const input = screen.getByPlaceholderText("Search file contents...");
    act(() => {
      fireEvent.change(input, { target: { value: "calculateSum" } });
    });

    // Check line numbers and file paths
    expect(screen.getByText("math.ts:1")).toBeInTheDocument();
    expect(screen.getByText("export function calculateSum(a: number, b: number) {")).toBeInTheDocument();
  });

  it("opens the selected file on click and closes the dialog", async () => {
    render(<ProjectIdView projectId={projectId} />);
    openQuickOpen();

    const contentButton = screen.getByRole("button", { name: /content/i });
    act(() => {
      fireEvent.click(contentButton);
    });

    const input = screen.getByPlaceholderText("Search file contents...");
    act(() => {
      fireEvent.change(input, { target: { value: "export function" } });
    });

    const mathMatchItem = screen.getByText("math.ts").closest('[role="option"]');
    expect(mathMatchItem).not.toBeNull();

    act(() => {
      fireEvent.click(mathMatchItem!);
    });

    expect(mockOpenFile).toHaveBeenCalledWith("file_2", { pinned: false });
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Search file contents...")).toBeNull();
    });
  });

  it("displays empty state when no content matches", () => {
    render(<ProjectIdView projectId={projectId} />);
    openQuickOpen();

    const contentButton = screen.getByRole("button", { name: /content/i });
    act(() => {
      fireEvent.click(contentButton);
    });

    const input = screen.getByPlaceholderText("Search file contents...");
    act(() => {
      fireEvent.change(input, { target: { value: "xyzUnknownString123" } });
    });

    expect(screen.getByText("No matching content found.")).toBeInTheDocument();
  });

  it("switches back to Files mode when Files button is clicked", () => {
    render(<ProjectIdView projectId={projectId} />);
    openQuickOpen();

    const contentButton = screen.getByRole("button", { name: /content/i });
    act(() => {
      fireEvent.click(contentButton);
    });
    expect(screen.getByPlaceholderText("Search file contents...")).toBeInTheDocument();

    const filesButton = screen.getByRole("button", { name: /files/i });
    act(() => {
      fireEvent.click(filesButton);
    });
    expect(screen.getByPlaceholderText("Search files by name or path...")).toBeInTheDocument();
  });
});
