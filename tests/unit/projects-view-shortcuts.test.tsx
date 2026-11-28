// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

// Mock child dialogs and list components to isolate keyboard shortcut routing
let mockCommandDialogOpen = false;
let mockImportDialogOpen = false;
let mockNewProjectDialogOpen = false;

vi.mock("@/features/projects/components/projects-command-dialog", () => ({
  ProjectsCommandDialog: ({
    open,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => {
    mockCommandDialogOpen = open;
    return open ? (
      <div
        role="dialog"
        data-slot="dialog-content"
        data-state="open"
        data-testid="dialog-command"
      >
        Command Dialog
      </div>
    ) : null;
  },
}));

vi.mock("@/features/projects/components/import-github-dialog", () => ({
  ImportGithubDialog: ({
    open,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => {
    mockImportDialogOpen = open;
    return open ? (
      <div
        role="dialog"
        data-slot="dialog-content"
        data-state="open"
        data-testid="dialog-import"
      >
        Import Dialog
      </div>
    ) : null;
  },
}));

vi.mock("@/features/projects/components/new-project-dialog", () => ({
  NewProjectDialog: ({
    open,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => {
    mockNewProjectDialogOpen = open;
    return open ? (
      <div
        role="dialog"
        data-slot="dialog-content"
        data-state="open"
        data-testid="dialog-new-project"
      >
        New Project Dialog
      </div>
    ) : null;
  },
}));

vi.mock("@/features/projects/components/projects-list", () => ({
  ProjectsList: ({ onViewAll }: { onViewAll: () => void }) => (
    <div data-testid="projects-list">
      <button onClick={onViewAll}>View all</button>
    </div>
  ),
}));

vi.mock("@/features/projects/hooks/use-projects", () => ({
  useCreateProject: () => vi.fn(),
}));

vi.mock("next/font/google", () => ({
  Poppins: () => ({ className: "mock-poppins" }),
}));

import { ProjectsView } from "@/features/projects/components/projects-view";

describe("ProjectsView keyboard shortcuts", () => {
  afterEach(() => {
    cleanup();
    mockCommandDialogOpen = false;
    mockImportDialogOpen = false;
    mockNewProjectDialogOpen = false;
  });

  it("Test 1 — opens Import GitHub Repository dialog on Ctrl+I", () => {
    render(<ProjectsView />);

    let defaultPrevented = false;
    act(() => {
      defaultPrevented = !fireEvent.keyDown(document, {
        key: "i",
        ctrlKey: true,
      });
    });

    expect(defaultPrevented).toBe(true);
    expect(mockImportDialogOpen).toBe(true);
    expect(mockCommandDialogOpen).toBe(false);
    expect(screen.getByTestId("dialog-import")).toBeDefined();
    expect(screen.queryByTestId("dialog-command")).toBeNull();
  });

  it("Test 2 — opens Import GitHub Repository dialog on Cmd+I (metaKey)", () => {
    render(<ProjectsView />);

    let defaultPrevented = false;
    act(() => {
      defaultPrevented = !fireEvent.keyDown(document, {
        key: "i",
        metaKey: true,
      });
    });

    expect(defaultPrevented).toBe(true);
    expect(mockImportDialogOpen).toBe(true);
    expect(mockCommandDialogOpen).toBe(false);
    expect(screen.getByTestId("dialog-import")).toBeDefined();
  });

  it("Test 3 — opens Projects Command Dialog on Ctrl+K", () => {
    render(<ProjectsView />);

    let defaultPrevented = false;
    act(() => {
      defaultPrevented = !fireEvent.keyDown(document, {
        key: "k",
        ctrlKey: true,
      });
    });

    expect(defaultPrevented).toBe(true);
    expect(mockCommandDialogOpen).toBe(true);
    expect(mockImportDialogOpen).toBe(false);
    expect(screen.getByTestId("dialog-command")).toBeDefined();
  });

  it("Test 4 — opens Projects Command Dialog on Cmd+K (metaKey)", () => {
    render(<ProjectsView />);

    let defaultPrevented = false;
    act(() => {
      defaultPrevented = !fireEvent.keyDown(document, {
        key: "k",
        metaKey: true,
      });
    });

    expect(defaultPrevented).toBe(true);
    expect(mockCommandDialogOpen).toBe(true);
    expect(screen.getByTestId("dialog-command")).toBeDefined();
  });

  it("Test 5 — opens New Project Dialog on Ctrl+J", () => {
    render(<ProjectsView />);

    let defaultPrevented = false;
    act(() => {
      defaultPrevented = !fireEvent.keyDown(document, {
        key: "j",
        ctrlKey: true,
      });
    });

    expect(defaultPrevented).toBe(true);
    expect(mockNewProjectDialogOpen).toBe(true);
    expect(mockImportDialogOpen).toBe(false);
    expect(mockCommandDialogOpen).toBe(false);
    expect(screen.getByTestId("dialog-new-project")).toBeDefined();
  });

  it("Test 6 — opens New Project Dialog on Cmd+J (metaKey)", () => {
    render(<ProjectsView />);

    let defaultPrevented = false;
    act(() => {
      defaultPrevented = !fireEvent.keyDown(document, {
        key: "j",
        metaKey: true,
      });
    });

    expect(defaultPrevented).toBe(true);
    expect(mockNewProjectDialogOpen).toBe(true);
    expect(screen.getByTestId("dialog-new-project")).toBeDefined();
  });

  it("Test 7 — does not trigger shortcuts or preventDefault without modifier keys", () => {
    render(<ProjectsView />);

    let defaultPrevented = false;
    act(() => {
      defaultPrevented = !fireEvent.keyDown(document, {
        key: "i",
        ctrlKey: false,
        metaKey: false,
      });
    });

    expect(defaultPrevented).toBe(false);
    expect(mockImportDialogOpen).toBe(false);
    expect(mockCommandDialogOpen).toBe(false);
    expect(mockNewProjectDialogOpen).toBe(false);
  });

  it("Test 8 — listener cleanup on unmount removes event listener", () => {
    const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");
    const { unmount } = render(<ProjectsView />);

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
    removeEventListenerSpy.mockRestore();
  });

  it("does not open another project dialog while a modal is already open", () => {
    render(<ProjectsView />);

    fireEvent.click(screen.getByRole("button", { name: "View all" }));
    expect(mockCommandDialogOpen).toBe(true);

    const openDialog = screen.getByTestId("dialog-command");
    let defaultPrevented = false;
    act(() => {
      defaultPrevented = !fireEvent.keyDown(openDialog, {
        key: "i",
        ctrlKey: true,
      });
    });

    expect(defaultPrevented).toBe(false);
    expect(mockCommandDialogOpen).toBe(true);
    expect(mockImportDialogOpen).toBe(false);
    expect(screen.queryByTestId("dialog-import")).toBeNull();
  });


  describe("Issue #115 — Ignore editable fields when handling project keyboard shortcuts", () => {
    const shortcuts = [
      { key: "k", name: "Command search (Ctrl/Cmd+K)", flag: () => mockCommandDialogOpen, dialogId: "dialog-command" },
      { key: "i", name: "Import GitHub (Ctrl/Cmd+I)", flag: () => mockImportDialogOpen, dialogId: "dialog-import" },
      { key: "j", name: "New Project (Ctrl/Cmd+J)", flag: () => mockNewProjectDialogOpen, dialogId: "dialog-new-project" },
    ];

    describe.each(shortcuts)("Shortcut Ctrl/Cmd+$key ($name)", ({ key, flag, dialogId }) => {
      it("Test A — input field ignores shortcut", () => {
        render(
          <div>
            <ProjectsView />
            <input data-testid="test-input" />
          </div>
        );

        const input = screen.getByTestId("test-input");
        let defaultPrevented = false;
        act(() => {
          defaultPrevented = !fireEvent.keyDown(input, {
            key,
            ctrlKey: true,
          });
        });

        expect(defaultPrevented).toBe(false);
        expect(flag()).toBe(false);
        expect(screen.queryByTestId(dialogId)).toBeNull();
      });

      it("Test B — textarea ignores shortcut", () => {
        render(
          <div>
            <ProjectsView />
            <textarea data-testid="test-textarea" />
          </div>
        );

        const textarea = screen.getByTestId("test-textarea");
        let defaultPrevented = false;
        act(() => {
          defaultPrevented = !fireEvent.keyDown(textarea, {
            key,
            metaKey: true,
          });
        });

        expect(defaultPrevented).toBe(false);
        expect(flag()).toBe(false);
        expect(screen.queryByTestId(dialogId)).toBeNull();
      });

      it("Test C — select element ignores shortcut", () => {
        render(
          <div>
            <ProjectsView />
            <select data-testid="test-select">
              <option value="1">Option 1</option>
            </select>
          </div>
        );

        const select = screen.getByTestId("test-select");
        let defaultPrevented = false;
        act(() => {
          defaultPrevented = !fireEvent.keyDown(select, {
            key,
            ctrlKey: true,
          });
        });

        expect(defaultPrevented).toBe(false);
        expect(flag()).toBe(false);
        expect(screen.queryByTestId(dialogId)).toBeNull();
      });

      it("Test D — contenteditable element ignores shortcut", () => {
        render(
          <div>
            <ProjectsView />
            <div data-testid="test-contenteditable" contentEditable="true" suppressContentEditableWarning />
          </div>
        );

        const editable = screen.getByTestId("test-contenteditable");
        let defaultPrevented = false;
        act(() => {
          defaultPrevented = !fireEvent.keyDown(editable, {
            key,
            metaKey: true,
          });
        });

        expect(defaultPrevented).toBe(false);
        expect(flag()).toBe(false);
        expect(screen.queryByTestId(dialogId)).toBeNull();
      });

      it("Test E — nested element inside contenteditable container ignores shortcut", () => {
        render(
          <div>
            <ProjectsView />
            <div contentEditable="true" suppressContentEditableWarning>
              <p>
                <span data-testid="nested-editable-span">Editing inside</span>
              </p>
            </div>
          </div>
        );

        const nestedSpan = screen.getByTestId("nested-editable-span");
        let defaultPrevented = false;
        act(() => {
          defaultPrevented = !fireEvent.keyDown(nestedSpan, {
            key,
            ctrlKey: true,
          });
        });

        expect(defaultPrevented).toBe(false);
        expect(flag()).toBe(false);
        expect(screen.queryByTestId(dialogId)).toBeNull();
      });

      it("Test F — non-editable dashboard element still activates shortcut", () => {
        render(
          <div>
            <ProjectsView />
            <div data-testid="normal-div">Normal Dashboard Element</div>
          </div>
        );

        const normalDiv = screen.getByTestId("normal-div");
        let defaultPrevented = false;
        act(() => {
          defaultPrevented = !fireEvent.keyDown(normalDiv, {
            key,
            ctrlKey: true,
          });
        });

        expect(defaultPrevented).toBe(true);
        expect(flag()).toBe(true);
        expect(screen.getByTestId(dialogId)).toBeDefined();
      });
    });
  });
});
