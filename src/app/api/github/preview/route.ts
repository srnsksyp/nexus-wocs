import { z } from "zod";
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { Octokit } from "octokit";

import { parseGitHubUrl } from "@/app/api/github/import/route";

const requestSchema = z.object({
  url: z.string().trim().min(1, "URL is required"),
});

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const parseResult = requestSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { url } = parseResult.data;

  let owner: string;
  let repo: string;
  try {
    const parsed = parseGitHubUrl(url);
    owner = parsed.owner;
    repo = parsed.repo;
  } catch {
    return NextResponse.json(
      { error: "Invalid GitHub URL" },
      { status: 400 }
    );
  }

  const client = await clerkClient();
  const tokens = await client.users.getUserOauthAccessToken(
    userId,
    "github"
  );
  const githubToken = tokens.data[0]?.token;

  if (!githubToken) {
    return NextResponse.json(
      { error: "GitHub not connected. Please reconnect your GitHub account." },
      { status: 400 }
    );
  }

  const octokit = new Octokit({ auth: githubToken });

  try {
    // 1. Fetch repository metadata
    const { data: repoData } = await octokit.rest.repos.get({
      owner,
      repo,
    });

    const defaultBranch = repoData.default_branch || "main";

    // 2. Fetch shallow/initial tree for expected file scope
    let fileCount = 0;
    let sampleFiles: string[] = [];
    let truncated = false;

    try {
      const { data: treeData } = await octokit.rest.git.getTree({
        owner,
        repo,
        tree_sha: defaultBranch,
        recursive: "1",
      });

      if (treeData && Array.isArray(treeData.tree)) {
        const blobs = treeData.tree.filter((item) => item.type === "blob");
        fileCount = blobs.length;
        sampleFiles = blobs.slice(0, 8).map((item) => item.path || "");
        truncated = Boolean(treeData.truncated);
      }
    } catch {
      // If fetching the tree fails (e.g. empty repo or branch sha not ready), fallback gracefully
      fileCount = 0;
      sampleFiles = [];
    }

    return NextResponse.json({
      success: true,
      owner: repoData.owner.login || owner,
      repo: repoData.name || repo,
      defaultBranch,
      description: repoData.description || null,
      isPrivate: repoData.private,
      fileCount,
      sampleFiles,
      truncated,
    });
  } catch (error: unknown) {
    const err = error as Record<string, unknown>;
    const status = typeof err?.status === "number" ? err.status : undefined;
    const message = typeof err?.message === "string" ? err.message.toLowerCase() : "";

    if (
      status === 429 ||
      (status === 403 &&
        (message.includes("rate limit") ||
          message.includes("secondary rate limit") ||
          message.includes("abuse detection")))
    ) {
      return NextResponse.json(
        { error: "GitHub API rate limit exceeded. Please wait a moment before trying again." },
        { status: 429 }
      );
    }

    if (status === 404 || status === 403 || message.includes("not found")) {
      return NextResponse.json(
        { error: "Repository not found or you do not have permission to access it." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Unable to retrieve repository preview. Please check the URL and try again." },
      { status: 500 }
    );
  }
}
