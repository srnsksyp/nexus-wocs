// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const mockProjectAlpha = {
  _id: "project_alpha",
  name: "Alpha workspace",
  updatedAt: 1_700_000_000_000,
};
const mockProjectBeta = {
  _id: "project_beta",
  name: "Beta workspace",
  updatedAt: 1_700_000_100_000,
};
let mockProjects = [mockProjectAlpha, mockProjectBeta];
const mockDeleteProject = vi.fn();

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("next/font/google", () => ({
  Poppins: () => ({ className: "mock-poppins" }),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    asChild,
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean;
    children: React.ReactNode;
  }) => {
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement, props as never);
    }
    return <button {...props}>{children}</button>;
  },
}));

vi.mock("@/components/ui/kbd", () => ({
  Kbd: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/components/ui/spinner", () => ({
  Spinner: () => <div role="status">Loading</div>,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: () => null,
  DropdownMenuItem: () => null,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/features/projects/components/delete-project-dialog", () => ({
  DeleteProjectDialog: () => null,
}));
vi.mock("@/features/projects/components/projects-command-dialog", () => ({
  ProjectsCommandDialog: () => null,
}));
vi.mock("@/features/projects/components/import-github-dialog", () => ({
  ImportGithubDialog: () => null,
}));
vi.mock("@/features/projects/components/new-project-dialog", () => ({
  NewProjectDialog: () => null,
}));

vi.mock("@/features/projects/hooks/use-projects", () => ({
  useProject: (projectId: string | null) => {
    if (!projectId) return undefined;
    return mockProjects.find((project) => project._id === projectId) ?? null;
  },
  useProjectsPartial: () => mockProjects,
  useDeleteProject: () => mockDeleteProject,
  useCreateProject: () => vi.fn(),
}));

vi.mock("@/features/projects/hooks/use-files", () => ({
  useFiles: () => [],
}));
vi.mock("@/features/editor/hooks/use-editor", () => ({
  useEditor: () => ({ openFile: vi.fn() }),
}));
vi.mock("@/features/editor/components/editor-view", () => ({
  EditorView: () => <div data-testid="editor-view" />,
}));
vi.mock("@/features/projects/components/file-explorer", () => ({
  FileExplorer: () => <div data-testid="file-explorer" />,
}));
vi.mock("@/features/projects/components/preview-view", () => ({
  PreviewView: () => <div data-testid="preview-view" />,
}));
vi.mock("@/features/projects/components/export-popover", () => ({
  ExportPopover: () => null,
}));
vi.mock("allotment", () => ({
  Allotment: Object.assign(
    ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    { Pane: ({ children }: { children: React.ReactNode }) => <div>{children}</div> },
  ),
}));
vi.mock("@/components/ui/command", () => ({
  CommandDialog: () => null,
  CommandEmpty: () => null,
  CommandGroup: () => null,
  CommandInput: () => null,
  CommandItem: () => null,
  CommandList: () => null,
}));

import { ProjectsList } from "@/features/projects/components/projects-list";
import { ProjectsView } from "@/features/projects/components/projects-view";
import { ProjectIdView } from "@/features/projects/components/project-id-view";
import { useSelectedProjectStore } from "@/features/projects/store/use-selected-project-store";
import { Id } from "@/../convex/_generated/dataModel";

const projectId = (id: string) => id as Id<"projects">;

describe("selected project navigation (Issue #141)", () => {
  beforeEach(() => {
    mockProjects = [mockProjectAlpha, mockProjectBeta];
    vi.clearAllMocks();
    sessionStorage.clear();
    useSelectedProjectStore.setState({ selectedProjectId: null });
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    useSelectedProjectStore.setState({ selectedProjectId: null });
  });

  it("preserves the chosen project when navigating list → project → list", async () => {
    const firstList = render(<ProjectsList onViewAll={vi.fn()} />);
    expect(screen.getByText("Last updated")).toBeInTheDocument();
    const betaLink = screen.getByRole("link", { name: /Beta workspace/ });
    expect(betaLink).toHaveAttribute("href", "/projects/project_beta");

    fireEvent.click(betaLink);
    expect(useSelectedProjectStore.getState().selectedProjectId).toBe(projectId("project_beta"));

    firstList.unmount();
    const projectView = render(<ProjectIdView projectId={projectId("project_beta")} />);
    await waitFor(() => {
      expect(useSelectedProjectStore.getState().selectedProjectId).toBe(projectId("project_beta"));
    });
    expect(screen.getByTestId("editor-view")).toBeInTheDocument();

    projectView.unmount();
    render(<ProjectsList onViewAll={vi.fn()} />);

    expect(screen.getByText("Selected project")).toBeInTheDocument();
    const continueLink = screen.getByRole("link", { name: /Beta workspace/ });
    expect(continueLink).toHaveAttribute("href", "/projects/project_beta");
    expect(continueLink).toHaveAttribute("aria-current", "page");
  });

  it("rehydrates the selected project after returning to the list in a fresh page session", async () => {
    sessionStorage.setItem(
      "nexus-selected-project",
      JSON.stringify({
        state: { selectedProjectId: "project_beta" },
        version: 0,
      }),
    );

    render(<ProjectsView />);

    await waitFor(() => {
      expect(useSelectedProjectStore.getState().selectedProjectId).toBe(projectId("project_beta"));
    });
    expect(screen.getByText("Selected project")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Beta workspace/ })).toHaveAttribute(
      "href",
      "/projects/project_beta",
    );
  });

  it("clears a selected project that no longer exists and falls back to the recent project", async () => {
    useSelectedProjectStore.getState().setSelectedProjectId(projectId("deleted_project"));

    render(<ProjectsList onViewAll={vi.fn()} />);

    await waitFor(() => {
      expect(useSelectedProjectStore.getState().selectedProjectId).toBeNull();
    });
    expect(screen.getByText("Last updated")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Alpha workspace/ })).toHaveAttribute(
      "href",
      "/projects/project_alpha",
    );
  });

  it("uses a valid direct project URL as the selected project", async () => {
    render(<ProjectIdView projectId={projectId("project_beta")} />);

    await waitFor(() => {
      expect(useSelectedProjectStore.getState().selectedProjectId).toBe(projectId("project_beta"));
    });
  });

  it("clears a previously selected project when a direct project URL is unavailable", async () => {
    useSelectedProjectStore.getState().setSelectedProjectId(projectId("missing_project"));
    render(<ProjectIdView projectId={projectId("missing_project")} />);

    await waitFor(() => {
      expect(useSelectedProjectStore.getState().selectedProjectId).toBeNull();
    });
  });
});
