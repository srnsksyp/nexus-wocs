// @vitest-environment jsdom
import React from "react";
import { HTTPError } from "ky";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const mockPost = vi.fn();
const mockPush = vi.fn();
const mockToast = { error: vi.fn(), success: vi.fn() };
const mockOpenUserProfile = vi.fn();
const mockRenameProject = vi.fn();

vi.mock("ky", () => ({
  default: { post: (...args: unknown[]) => mockPost(...args) },
  HTTPError: class HTTPError extends Error {
    response: Response;
    constructor(response: Response) {
      super("HTTPError");
      this.response = response;
    }
  },
}));
vi.mock("sonner", () => ({ toast: mockToast }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ openUserProfile: mockOpenUserProfile }),
  UserButton: () => null,
}));

let currentProject = { _id: "project_1", name: "Current project", updatedAt: 1 };
vi.mock("@/features/projects/hooks/use-projects", () => ({
  useProject: () => currentProject,
  useRenameProject: () => mockRenameProject,
}));

import { NewProjectDialog } from "@/features/projects/components/new-project-dialog";
import { ImportGithubDialog } from "@/features/projects/components/import-github-dialog";
import { Navbar } from "@/features/projects/components/navbar";

const settleKy = (value: unknown) => ({ json: vi.fn().mockResolvedValue(value) });

describe("project creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockReturnValue(settleKy({ projectId: "project_new" }));
  });

  it("submits the trimmed prompt with the correct payload and navigates", async () => {
    render(<NewProjectDialog open onOpenChange={vi.fn()} />);
    const input = screen.getByPlaceholderText("Ask Nexus to build...");
    fireEvent.change(input, { target: { value: "  Build a dashboard  " } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith(
      "/api/projects/create-with-prompt",
      { json: { prompt: "Build a dashboard" } },
    ));
    expect(mockPush).toHaveBeenCalledWith("/projects/project_new");
  });

  it("rejects an empty prompt without calling the backend", () => {
    render(<NewProjectDialog open onOpenChange={vi.fn()} />);
    const input = screen.getByPlaceholderText("Ask Nexus to build...");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.submit(input.closest("form")!);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("disables the prompt while submission is pending", () => {
    mockPost.mockReturnValue({ json: () => new Promise(() => {}) });
    render(<NewProjectDialog open onOpenChange={vi.fn()} />);
    const input = screen.getByPlaceholderText("Ask Nexus to build...");
    fireEvent.change(input, { target: { value: "Build it" } });
    fireEvent.submit(input.closest("form")!);
    expect(input).toBeDisabled();
  });

  it("reports a mutation failure", async () => {
    mockPost.mockRejectedValueOnce(new Error("create failed"));
    render(<NewProjectDialog open onOpenChange={vi.fn()} />);
    const input = screen.getByPlaceholderText("Ask Nexus to build...");
    fireEvent.change(input, { target: { value: "Build it" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith("Unable to create project"));
  });
});

describe("GitHub import dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockReturnValue(settleKy({ projectId: "project_imported" }));
  });

  it.each(["https://github.com/owner/repo", "https://github.com/owner/repo.git"])(
    "accepts a valid repository URL: %s",
    async (url) => {
      render(<ImportGithubDialog open onOpenChange={vi.fn()} />);
      const input = screen.getByLabelText("Repository URL");
      fireEvent.change(input, { target: { value: url } });
      fireEvent.submit(input.closest("form")!);
      await waitFor(() => expect(mockPost).toHaveBeenCalledWith("/api/github/import", { json: { url } }));
    },
  );

  it.each(["", "not-a-url", "https://github.com/owner"])(
    "rejects an invalid or empty repository URL: %s",
    async (url) => {
      render(<ImportGithubDialog open onOpenChange={vi.fn()} />);
      const input = screen.getByLabelText("Repository URL");
      fireEvent.change(input, { target: { value: url } });
      fireEvent.submit(input.closest("form")!);
      await waitFor(() => expect(screen.getByText("Please enter a valid URL")).toBeInTheDocument());
      expect(mockPost).not.toHaveBeenCalled();
    },
  );

  it("shows pending state and does not submit twice", () => {
    mockPost.mockReturnValue({ json: () => new Promise(() => {}) });
    render(<ImportGithubDialog open onOpenChange={vi.fn()} />);
    const input = screen.getByLabelText("Repository URL");
    fireEvent.change(input, { target: { value: "https://github.com/owner/repo" } });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(screen.getByRole("button", { name: "Importing..." })).toBeDisabled();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it("cancels without triggering the mutation", () => {
    const onOpenChange = vi.fn();
    render(<ImportGithubDialog open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockPost).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps the dialog open, shows an accessible error, and preserves the URL after failure", async () => {
    const onOpenChange = vi.fn();
    mockPost.mockReturnValueOnce({
      json: vi.fn().mockRejectedValue(new Error("import failed")),
    });
    render(<ImportGithubDialog open onOpenChange={onOpenChange} />);

    const input = screen.getByLabelText("Repository URL");
    const url = "https://github.com/owner/repo";
    fireEvent.change(input, { target: { value: url } });
    fireEvent.submit(input.closest("form")!);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Unable to import repository");
    expect(input).toHaveValue(url);
    await waitFor(() => expect(input).toBeEnabled());
    expect(screen.getByRole("button", { name: "Import" })).toBeEnabled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it("clears the previous error on retry and follows the success flow", async () => {
    const onOpenChange = vi.fn();
    let resolveImport: ((value: unknown) => void) | undefined;
    mockPost
      .mockReturnValueOnce({
        json: vi.fn().mockRejectedValue(new Error("first attempt failed")),
      })
      .mockReturnValueOnce({
        json: () => new Promise((resolve) => {
          resolveImport = resolve;
        }),
      });

    render(<ImportGithubDialog open onOpenChange={onOpenChange} />);
    const input = screen.getByLabelText("Repository URL");
    const url = "https://github.com/owner/repo";
    fireEvent.change(input, { target: { value: url } });
    fireEvent.submit(input.closest("form")!);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to import repository");
    expect(input).toHaveValue(url);
    await waitFor(() => expect(input).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(input).toBeDisabled();
    expect(input).toHaveValue(url);

    resolveImport?.({ projectId: "project_imported" });
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/projects/project_imported"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps GitHub connection failures inside the dialog with a connect action", async () => {
    const onOpenChange = vi.fn();
    const response = {
      json: vi.fn().mockResolvedValue({ error: "GitHub not connected" }),
    } as unknown as Response;
    mockPost.mockReturnValueOnce({
      json: vi.fn().mockRejectedValue(new HTTPError(response)),
    });

    render(<ImportGithubDialog open onOpenChange={onOpenChange} />);
    const input = screen.getByLabelText("Repository URL");
    fireEvent.change(input, { target: { value: "https://github.com/owner/repo" } });
    fireEvent.submit(input.closest("form")!);

    expect(await screen.findByRole("alert")).toHaveTextContent("Your GitHub account is not connected");
    expect(screen.getByRole("button", { name: "Connect GitHub" })).toBeInTheDocument();
    await waitFor(() => expect(input).toBeEnabled());
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("allows cancellation after a failed import", async () => {
    const onOpenChange = vi.fn();
    mockPost.mockReturnValueOnce({
      json: vi.fn().mockRejectedValue(new Error("import failed")),
    });
    render(<ImportGithubDialog open onOpenChange={onOpenChange} />);

    const input = screen.getByLabelText("Repository URL");
    fireEvent.change(input, { target: { value: "https://github.com/owner/repo" } });
    fireEvent.submit(input.closest("form")!);
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("project rename", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentProject = { _id: "project_1", name: "Current project", updatedAt: 1 };
    mockRenameProject.mockResolvedValue(undefined);
  });

  const startRename = () => {
    render(<Navbar projectId={"project_1" as never} />);
    fireEvent.click(screen.getByText("Current project"));
    return screen.getByDisplayValue("Current project");
  };

  it("renames an existing project with the trimmed name", async () => {
    const input = startRename();
    fireEvent.change(input, { target: { value: "  Renamed project " } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(mockRenameProject).toHaveBeenCalledWith({ id: "project_1", name: "Renamed project" }));
  });

  it("does not submit an empty or unchanged name", () => {
    const input = startRename();
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockRenameProject).not.toHaveBeenCalled();
  });

  it("preserves the current name and reports a failed rename", async () => {
    mockRenameProject.mockRejectedValueOnce(new Error("rename failed"));
    const input = startRename();
    fireEvent.change(input, { target: { value: "Failed rename" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith("rename failed"));
    expect(screen.getByDisplayValue("Current project")).toBeInTheDocument();
  });

  it("prevents duplicate submissions while rename is pending", () => {
    mockRenameProject.mockReturnValue(new Promise(() => {}));
    const input = startRename();
    fireEvent.change(input, { target: { value: "Renamed project" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockRenameProject).toHaveBeenCalledTimes(1);
    expect(input).toBeDisabled();
  });
});
