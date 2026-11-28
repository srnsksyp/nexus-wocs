// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

import {
  DEFAULT_EDITOR_PREFERENCES,
  getEditorPreferencesStorageKey,
  loadEditorPreferences,
  parseStoredPreferences,
  saveEditorPreferences,
} from "@/features/editor/utils/editor-preferences";
import { EditorView } from "@/features/editor/components/editor-view";
import { useEditorStore } from "@/features/editor/store/use-editor-store";
import { Id } from "@/../convex/_generated/dataModel";

// Mock Clerk useAuth
const mockUseAuth = vi.fn();
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock useFile and useUpdateFile
const mockUpdateFile = vi.fn();
const mockActiveFile = {
  _id: "file_a" as Id<"files">,
  name: "FileA.tsx",
  content: "console.log('hello');",
  updatedAt: 100,
};

vi.mock("@/features/projects/hooks/use-files", () => ({
  useFile: () => mockActiveFile,
  useUpdateFile: () => mockUpdateFile,
  useFilePath: () => "src/FileA.tsx",
}));

// Mock TopNavigation
vi.mock("@/features/editor/components/top-navigation", () => ({
  TopNavigation: () => <div data-testid="mock-top-navigation">TopNav</div>,
}));

// Mock FileBreadcrumbs
vi.mock("@/features/editor/components/file-breadcrumbs", () => ({
  FileBreadcrumbs: () => <div data-testid="mock-file-breadcrumbs">Breadcrumbs</div>,
}));

// Mock CodeEditor to verify lineWrapping and minimapEnabled props
vi.mock("@/features/editor/components/code-editor", () => ({
  CodeEditor: ({
    fileName,
    lineWrapping,
    minimapEnabled,
  }: {
    fileName: string;
    lineWrapping?: boolean;
    minimapEnabled?: boolean;
  }) => (
    <div
      data-testid="mock-code-editor"
      data-filename={fileName}
      data-linewrapping={lineWrapping ? "true" : "false"}
      data-minimap={minimapEnabled ? "true" : "false"}
    />
  ),
}));

describe("Editor Preferences Persistence (Issue #129)", () => {
  const projectId = "proj_1" as Id<"projects">;
  const fileA = "file_a" as Id<"files">;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      userId: "user_123",
      isLoaded: true,
      isSignedIn: true,
    });

    useEditorStore.setState({ tabs: new Map() });
    const store = useEditorStore.getState();
    store.openFile(projectId, fileA, { pinned: true, initialContent: "hello" });
    store.setActiveTab(projectId, fileA);
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("A. Utility and Parsing Functions", () => {
    it("returns correct storage key for scoped user and anonymous fallback", () => {
      expect(getEditorPreferencesStorageKey("user_abc")).toBe("nexus:editor-preferences:user_abc");
      expect(getEditorPreferencesStorageKey("   user_xyz  ")).toBe("nexus:editor-preferences:user_xyz");
      expect(getEditorPreferencesStorageKey(null)).toBe("nexus:editor-preferences:anonymous");
      expect(getEditorPreferencesStorageKey(undefined)).toBe("nexus:editor-preferences:anonymous");
      expect(getEditorPreferencesStorageKey("")).toBe("nexus:editor-preferences:anonymous");
    });

    it("parses valid stored preferences with version envelope", () => {
      const raw = JSON.stringify({
        version: 1,
        preferences: {
          lineWrapping: true,
          minimapEnabled: false,
        },
      });
      const parsed = parseStoredPreferences(raw);
      expect(parsed).toEqual({
        lineWrapping: true,
        minimapEnabled: false,
      });
    });

    it("parses valid stored preferences without envelope (flat shape)", () => {
      const raw = JSON.stringify({
        lineWrapping: true,
        minimapEnabled: false,
      });
      const parsed = parseStoredPreferences(raw);
      expect(parsed).toEqual({
        lineWrapping: true,
        minimapEnabled: false,
      });
    });

    it("falls back safely on corrupt JSON", () => {
      expect(parseStoredPreferences("not-json")).toEqual(DEFAULT_EDITOR_PREFERENCES);
      expect(parseStoredPreferences("{incomplete")).toEqual(DEFAULT_EDITOR_PREFERENCES);
      expect(parseStoredPreferences(null)).toEqual(DEFAULT_EDITOR_PREFERENCES);
    });

    it("preserves valid properties when one property is missing or invalid", () => {
      const partialRaw = JSON.stringify({
        preferences: {
          lineWrapping: true,
          minimapEnabled: "invalid-boolean",
        },
      });
      const parsed = parseStoredPreferences(partialRaw);
      expect(parsed.lineWrapping).toBe(true);
      expect(parsed.minimapEnabled).toBe(DEFAULT_EDITOR_PREFERENCES.minimapEnabled);
    });

    it("saves and loads preferences per user scope without leaking between users", () => {
      saveEditorPreferences({ lineWrapping: true, minimapEnabled: false }, "user_1");
      saveEditorPreferences({ lineWrapping: false, minimapEnabled: true }, "user_2");

      expect(loadEditorPreferences("user_1")).toEqual({
        lineWrapping: true,
        minimapEnabled: false,
      });
      expect(loadEditorPreferences("user_2")).toEqual({
        lineWrapping: false,
        minimapEnabled: true,
      });
    });

    it("gracefully catches localStorage exceptions (e.g. storage disabled or quota exceeded)", () => {
      const setSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
      const getSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("SecurityError");
      });

      try {
        // Should not crash and return computed values on save, defaults on load
        expect(() => saveEditorPreferences({ lineWrapping: true }, "user_err")).not.toThrow();
        expect(loadEditorPreferences("user_err")).toEqual(DEFAULT_EDITOR_PREFERENCES);
      } finally {
        setSpy.mockRestore();
        getSpy.mockRestore();
      }
    });
  });

  describe("B. UI Integration in EditorView", () => {
    it("renders with default preferences when localStorage is empty", () => {
      render(<EditorView projectId={projectId} />);

      const wrapBtn = screen.getByRole("button", { name: "Line wrapping" });
      const minimapBtn = screen.getByRole("button", { name: "Minimap" });
      const mockEditor = screen.getByTestId("mock-code-editor");

      expect(wrapBtn.getAttribute("aria-pressed")).toBe("false");
      expect(minimapBtn.getAttribute("aria-pressed")).toBe("true");
      expect(mockEditor.getAttribute("data-linewrapping")).toBe("false");
      expect(mockEditor.getAttribute("data-minimap")).toBe("true");
    });

    it("restores previously stored line wrapping and minimap preferences on mount", () => {
      saveEditorPreferences(
        { lineWrapping: true, minimapEnabled: false },
        "user_123"
      );

      render(<EditorView projectId={projectId} />);

      const wrapBtn = screen.getByRole("button", { name: "Line wrapping" });
      const minimapBtn = screen.getByRole("button", { name: "Minimap" });
      const mockEditor = screen.getByTestId("mock-code-editor");

      expect(wrapBtn.getAttribute("aria-pressed")).toBe("true");
      expect(minimapBtn.getAttribute("aria-pressed")).toBe("false");
      expect(mockEditor.getAttribute("data-linewrapping")).toBe("true");
      expect(mockEditor.getAttribute("data-minimap")).toBe("false");
    });

    it("toggling line wrapping updates editor immediately and persists to localStorage", () => {
      render(<EditorView projectId={projectId} />);

      const wrapBtn = screen.getByRole("button", { name: "Line wrapping" });
      expect(wrapBtn.getAttribute("aria-pressed")).toBe("false");

      act(() => {
        fireEvent.click(wrapBtn);
      });

      expect(wrapBtn.getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByTestId("mock-code-editor").getAttribute("data-linewrapping")).toBe("true");

      // Verify persisted value
      const stored = loadEditorPreferences("user_123");
      expect(stored.lineWrapping).toBe(true);
      expect(stored.minimapEnabled).toBe(true);
    });

    it("toggling minimap updates editor immediately and persists to localStorage", () => {
      render(<EditorView projectId={projectId} />);

      const minimapBtn = screen.getByRole("button", { name: "Minimap" });
      expect(minimapBtn.getAttribute("aria-pressed")).toBe("true");

      act(() => {
        fireEvent.click(minimapBtn);
      });

      expect(minimapBtn.getAttribute("aria-pressed")).toBe("false");
      expect(screen.getByTestId("mock-code-editor").getAttribute("data-minimap")).toBe("false");

      // Verify persisted value
      const stored = loadEditorPreferences("user_123");
      expect(stored.minimapEnabled).toBe(false);
      expect(stored.lineWrapping).toBe(false);
    });

    it("switches preferences safely when switching authenticated users without leaking data", () => {
      // Store user A preferences
      saveEditorPreferences({ lineWrapping: true, minimapEnabled: false }, "user_A");
      // Store user B preferences
      saveEditorPreferences({ lineWrapping: false, minimapEnabled: true }, "user_B");

      mockUseAuth.mockReturnValue({
        userId: "user_A",
        isLoaded: true,
        isSignedIn: true,
      });

      const { rerender } = render(<EditorView projectId={projectId} />);

      expect(screen.getByRole("button", { name: "Line wrapping" }).getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByRole("button", { name: "Minimap" }).getAttribute("aria-pressed")).toBe("false");

      // Switch to user B
      mockUseAuth.mockReturnValue({
        userId: "user_B",
        isLoaded: true,
        isSignedIn: true,
      });

      rerender(<EditorView projectId={projectId} />);

      expect(screen.getByRole("button", { name: "Line wrapping" }).getAttribute("aria-pressed")).toBe("false");
      expect(screen.getByRole("button", { name: "Minimap" }).getAttribute("aria-pressed")).toBe("true");
    });
  });
});
