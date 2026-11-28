// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { HTTPError } from "ky";

import { ImportGithubDialog } from "@/features/projects/components/import-github-dialog";

const mockPost = vi.fn();
const mockPush = vi.fn();
const mockToast = { error: vi.fn(), success: vi.fn() };
const mockOpenUserProfile = vi.fn();

vi.mock("ky", () => ({
  default: {
    post: (...args: unknown[]) => mockPost(...args),
  },
  HTTPError: class HTTPError extends Error {
    response: Response;
    constructor(response: Response) {
      super("HTTPError");
      this.response = response;
    }
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToast.success(...args),
    error: (...args: unknown[]) => mockToast.error(...args),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ openUserProfile: mockOpenUserProfile }),
  UserButton: () => null,
}));

const settleKy = (value: unknown) => ({ json: vi.fn().mockResolvedValue(value) });

describe("GitHub Import Preview & Confirmation Flow (Issue #128)", () => {
  const onOpenChange = vi.fn();
  const repoUrl = "https://github.com/facebook/react";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submitting repository URL requests preview data and does not start import", async () => {
    mockPost.mockReturnValueOnce(
      settleKy({
        success: true,
        owner: "facebook",
        repo: "react",
        defaultBranch: "main",
        description: "The library for web and native user interfaces",
        isPrivate: false,
        fileCount: 42,
        sampleFiles: ["package.json", "src/index.js"],
        truncated: false,
      })
    );

    render(<ImportGithubDialog open={true} onOpenChange={onOpenChange} />);

    const input = screen.getByLabelText("Repository URL");
    fireEvent.change(input, { target: { value: repoUrl } });
    fireEvent.submit(input.closest("form")!);

    // Should call /api/github/preview, NOT /api/github/import
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/api/github/preview", {
        json: { url: repoUrl },
      });
    });
    expect(mockPost).not.toHaveBeenCalledWith("/api/github/import", expect.anything());

    // Preview metadata should now be visible in dialog
    expect(await screen.findByText("facebook/react")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText(/42 files/i)).toBeInTheDocument();
    expect(screen.getByText("package.json")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm Import" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to URL" })).toBeInTheDocument();
  });

  it("user can navigate back and edit the URL before confirming", async () => {
    mockPost.mockReturnValueOnce(
      settleKy({
        success: true,
        owner: "facebook",
        repo: "react",
        defaultBranch: "main",
        fileCount: 5,
        sampleFiles: ["README.md"],
      })
    );

    render(<ImportGithubDialog open={true} onOpenChange={onOpenChange} />);

    const input = screen.getByLabelText("Repository URL");
    fireEvent.change(input, { target: { value: repoUrl } });
    fireEvent.submit(input.closest("form")!);

    expect(await screen.findByText("facebook/react")).toBeInTheDocument();

    // Click "Back to URL"
    fireEvent.click(screen.getByRole("button", { name: "Back to URL" }));

    // URL input should reappear with preserved value
    const reInput = screen.getByLabelText("Repository URL");
    expect(reInput).toHaveValue(repoUrl);
    expect(screen.queryByText("Confirm Import")).not.toBeInTheDocument();
  });

  it("user can cancel from preview without creating a project", async () => {
    mockPost.mockReturnValueOnce(
      settleKy({
        success: true,
        owner: "facebook",
        repo: "react",
        defaultBranch: "main",
        fileCount: 5,
        sampleFiles: ["README.md"],
      })
    );

    render(<ImportGithubDialog open={true} onOpenChange={onOpenChange} />);

    const input = screen.getByLabelText("Repository URL");
    fireEvent.change(input, { target: { value: repoUrl } });
    fireEvent.submit(input.closest("form")!);

    expect(await screen.findByText("facebook/react")).toBeInTheDocument();

    // Click Cancel
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockPost).toHaveBeenCalledTimes(1); // Only preview was called
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("confirming import calls /api/github/import and navigates to the project", async () => {
    mockPost
      .mockReturnValueOnce(
        settleKy({
          success: true,
          owner: "facebook",
          repo: "react",
          defaultBranch: "main",
          fileCount: 10,
          sampleFiles: ["index.js"],
        })
      )
      .mockReturnValueOnce(
        settleKy({
          success: true,
          projectId: "project_react_123",
          eventId: "event_123",
        })
      );

    render(<ImportGithubDialog open={true} onOpenChange={onOpenChange} />);

    const input = screen.getByLabelText("Repository URL");
    fireEvent.change(input, { target: { value: repoUrl } });
    fireEvent.submit(input.closest("form")!);

    const confirmButton = await screen.findByRole("button", { name: "Confirm Import" });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/api/github/import", {
        json: { url: repoUrl },
      });
    });

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith("Importing repository...");
      expect(mockPush).toHaveBeenCalledWith("/projects/project_react_123");
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("prevents duplicate submissions on rapid multiple clicks on Confirm Import", async () => {
    let resolveImport: ((v: unknown) => void) | undefined;
    mockPost
      .mockReturnValueOnce(
        settleKy({
          success: true,
          owner: "facebook",
          repo: "react",
          defaultBranch: "main",
          fileCount: 10,
        })
      )
      .mockReturnValueOnce({
        json: () =>
          new Promise((resolve) => {
            resolveImport = resolve;
          }),
      });

    render(<ImportGithubDialog open={true} onOpenChange={onOpenChange} />);

    const input = screen.getByLabelText("Repository URL");
    fireEvent.change(input, { target: { value: repoUrl } });
    fireEvent.submit(input.closest("form")!);

    const confirmButton = await screen.findByRole("button", { name: "Confirm Import" });
    act(() => {
      fireEvent.click(confirmButton);
      fireEvent.click(confirmButton);
      fireEvent.click(confirmButton);
    });

    expect(mockPost).toHaveBeenCalledTimes(2); // 1 preview + 1 import

    await act(async () => {
      resolveImport?.({ success: true, projectId: "project_1", eventId: "e_1" });
    });
  });

  it("handles preview rate limit error gracefully", async () => {
    const response = {
      json: vi.fn().mockResolvedValue({
        error: "GitHub API rate limit exceeded. Please wait a moment before trying again.",
      }),
    } as unknown as Response;

    mockPost.mockReturnValueOnce({
      json: vi.fn().mockRejectedValue(new HTTPError(response)),
    });

    render(<ImportGithubDialog open={true} onOpenChange={onOpenChange} />);

    const input = screen.getByLabelText("Repository URL");
    fireEvent.change(input, { target: { value: repoUrl } });
    await act(async () => {
      fireEvent.submit(input.closest("form")!);
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("rate limit exceeded");
  });

  it("handles inaccessible or not found repository preview error", async () => {
    const response = {
      json: vi.fn().mockResolvedValue({
        error: "Repository not found or you do not have permission to access it.",
      }),
    } as unknown as Response;

    mockPost.mockReturnValueOnce({
      json: vi.fn().mockRejectedValue(new HTTPError(response)),
    });

    render(<ImportGithubDialog open={true} onOpenChange={onOpenChange} />);

    const input = screen.getByLabelText("Repository URL");
    fireEvent.change(input, { target: { value: repoUrl } });
    await act(async () => {
      fireEvent.submit(input.closest("form")!);
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Repository not found or you do not have permission");
  });
});
