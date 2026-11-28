# GitHub Import and Export Troubleshooting Matrix

This guide provides a practical troubleshooting matrix for GitHub OAuth authentication, repository import, and repository export operations in Nexus. It is designed to help users and contributors diagnose visible UI errors and background job failures, identify their underlying causes, check required configuration and OAuth scopes, and determine safe recovery steps.

---

## Overview of the GitHub Integration

In Nexus, GitHub integration is powered through **Clerk's OAuth token store**, **Next.js App Router API routes**, and **Inngest durable background workflows**:

1. **Authentication:** Users connect their GitHub account through Clerk OAuth. The server retrieves the user's OAuth access token via Clerk's server SDK (`clerkClient().users.getUserOauthAccessToken(userId, "github")`).
2. **Repository Import:** Triggered via `POST /api/github/import`. The endpoint validates the URL, creates a project in Convex, and dispatches the `github/import.repo` event to Inngest (`importGithubRepo`). Inngest fetches the Git tree and file contents via Octokit and persists them into Convex.
3. **Repository Export:** Triggered via `POST /api/github/export`. The endpoint verifies project ownership, retrieves the OAuth token, and dispatches the `github/export.repo` event to Inngest (`exportToGithub`). Inngest creates the remote repository, generates blobs, constructs Git trees, and commits the project files.
4. **Export Cancellation & Reset:** In-flight exports can be cancelled via `POST /api/github/export/cancel` (sending `github/export.cancel` to Inngest) or reset via `POST /api/github/export/reset`.

---

## Troubleshooting Matrix

The matrix categorizes failures into three areas: **GitHub OAuth and Authentication**, **Repository Import**, and **Repository Export**.

| Area | Visible Error / Symptom | Likely Cause | Required Scope / Configuration | Recommended Action | Retryable? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **OAuth** | Toast error: `"GitHub account not connected"` with a **Connect** action button | No GitHub OAuth access token found in Clerk for the user (user signed in with email or has not connected GitHub). | Clerk Social Connections: GitHub enabled; user must link GitHub account. | Click **Connect** in the toast (or open user profile settings) to connect and authorize GitHub via Clerk OAuth. | Yes (after connecting account) |
| **OAuth** | API response: `400 Bad Request` `{ "error": "GitHub not connected. Please reconnect your GitHub account." }` | `getUserOauthAccessToken(userId, "github")` returned an empty token array from Clerk. | Clerk OAuth token store configured with GitHub provider. | Ensure GitHub social connection is enabled in Clerk Dashboard and re-link your GitHub account under your profile. | Yes (after re-authenticating) |
| **OAuth** | API response: `401 Unauthorized` `{ "error": "Unauthorized" }` | Request lacks a valid Clerk authentication session (user is signed out or session cookie expired). | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in `.env.local`. | Sign in to Nexus through Clerk before initiating import or export. | Yes (after sign-in) |
| **OAuth** | API response: `500 Internal Server Error` `{ "error": "Server configuration error" }` | `NEXUS_CONVEX_INTERNAL_KEY` is missing or undefined in server environment. | `NEXUS_CONVEX_INTERNAL_KEY` set in `.env.local` and in Convex deployment (`npx convex env set`). | Set matching 32-byte hex keys in `.env.local` and Convex, then restart the Next.js server. | No (requires server fix) |
| **OAuth** | OAuth callback error or authorization redirect fails during Clerk GitHub sign-in | OAuth callback URL mismatch in GitHub Developer Settings or invalid GitHub OAuth client credentials in Clerk. | GitHub OAuth App: Homepage URL (`http://localhost:3000`), Authorization callback URL (from Clerk Dashboard). | Verify the Clerk OAuth callback URL matches the GitHub OAuth App settings exactly. | No (requires configuration fix) |
| **OAuth** | Octokit HTTP 401: `Bad credentials` in Inngest worker logs | The stored GitHub OAuth token is invalid, revoked, or expired on GitHub's side. | Valid Clerk GitHub OAuth token. | Disconnect and reconnect your GitHub account in the user profile settings to generate a fresh OAuth token. | Yes (after reconnecting) |
| **Import** | Field validation error: `"Invalid GitHub URL"` or toast: `"Unable to import repository. Please check the URL and try again"` | The URL provided does not point to `github.com` or `www.github.com`, lacks owner/repo segments, or uses an unsupported protocol scheme. | Valid GitHub URL format (e.g. `https://github.com/owner/repo`). | Verify the URL format. Supported patterns include `https://github.com/owner/repo`, `http://github.com/owner/repo`, or protocol-free `github.com/owner/repo`. Trailing `.git` is permitted. | No (requires valid URL) |
| **Import** | Inngest step `fetch-repo-tree` fails with Octokit HTTP 404: `Not Found` | Repository does not exist, was renamed/deleted, or is a private repository that the current token cannot read. | OAuth scope: `repo` (for private repos). Public repos require valid path. | Check that the repository exists on GitHub. If the repository is private, ensure your GitHub account has read access and your OAuth connection has the `repo` scope. | No (for nonexistent repos; Yes if permissions updated) |
| **Import** | Inngest step `fetch-repo-tree` fails on branch lookup (`main` and `master` fallback both fail) | The repository is empty (zero commits) or its default branch is named something other than `main` or `master`. | Repository must have an initialized default branch (`main` or `master`). | Ensure the remote repository has at least one commit and uses `main` or `master` as its branch, or push an initial commit to GitHub before importing. | No (requires repo fix) |
| **Import** | Inngest step fails with Octokit HTTP 403: `API rate limit exceeded` or `secondary rate limit` | GitHub API rate limit reached for the authenticated user or IP address. | GitHub API rate limit reset window (`x-ratelimit-reset` or `retry-after`). | Inngest worker automatically retries transient rate limits with exponential backoff (up to 3 retries). If limits persist, wait for the rate limit reset window to elapse before retrying. | Yes (transient / retryable) |
| **Import** | Inngest step fails with network timeout (`ECONNRESET`, `ETIMEDOUT`, `socket hang up`) | Temporary network disruption between the local server/Inngest and GitHub API. | Stable internet connectivity. | Automatic retry via `withExponentialBackoff` (up to 3 retries). If failure persists, trigger the import again once network connectivity stabilizes. | Yes (transient / retryable) |
| **Import** | Import progress status displays `"failed"` in project view | Inngest workflow encountered an unrecoverable failure during folder or blob creation. | Inngest engine running (`npx inngest-cli dev`). | Inspect the Inngest Dev Dashboard at `http://localhost:8288` under `import-github-repo` runs for detailed error stack traces. Delete the failed project and re-import once resolved. | Yes (safe to re-import) |
| **Export** | Dialog validation error: `repoName` invalid or exceeds 100 characters | Name contains illegal characters or exceeds GitHub repository naming rules (`1..100` characters). | Repository name string matching `^[a-zA-Z0-9._-]+$`. | Adjust the repository name in the export dialog to use alphanumeric characters, dashes, or underscores. | No (requires input fix) |
| **Export** | API response: `403 Forbidden` `{ "error": "Unauthorized" }` | Authenticated user does not match the `ownerId` of the project being exported. | User must own the target project document in Convex. | Switch to an account that owns the project or create/import the project under the current account. | No (authorization failure) |
| **Export** | Inngest step `get-github-user` fails with Octokit HTTP 401 | GitHub OAuth token is missing the required profile identity permission. | OAuth scope: `read:user`. | Ensure Clerk GitHub social connection requests `read:user` and re-authenticate your GitHub account. | Yes (after reconnecting) |
| **Export** | Inngest step `create-repo` fails with Octokit HTTP 422: `name already exists on this account` | A repository with the same name already exists in the authenticated user's GitHub account. | Unique repository name on target GitHub account. | Choose a different repository name in the Export dialog before submitting. | No (requires new repo name) |
| **Export** | Inngest step `create-repo` fails with Octokit HTTP 403: `Resource protected by organization SAML enforcement` or insufficient scope | The OAuth token lacks permission to create repositories, or target organization enforces SAML SSO. | OAuth scope: `repo` (Full control of private repositories and repository creation). | In Clerk Dashboard > Social Connections > GitHub, ensure the `repo` scope is configured. Authorize SAML SSO for the organization if exporting to an org account. | No (requires scope/SAML authorization) |
| **Export** | Inngest step `fetch-project-files` fails with `NonRetriableError: "No files to export"` | The project has folders or zero files saved in Convex. | Project must contain at least one file document. | Add or save at least one file in the editor workbench before attempting an export. | No (requires files in project) |
| **Export** | Export progress displays `"cancelled"` after user clicks Cancel | User intentionally initiated cancellation via `POST /api/github/export/cancel`. | Inngest cancellation handler listening for `github/export.cancel`. | Export was stopped cleanly; partial commits are prevented. Use the **Reset Export** button in the popover to clear state and initiate a new export if desired. | Yes (safe to restart export) |
| **Export** | Inngest step fails with Octokit HTTP 403: Rate limit or secondary rate limit | Burst of Octokit API calls (creating tree, blobs, commits) triggered secondary abuse detection. | GitHub API rate limit reset window. | Nexus handles individual blob and commit creations with bounded concurrency (5 concurrent requests) and exponential backoff. If exhausted, wait 1-2 minutes and re-run. | Yes (transient / retryable) |
| **Export** | Inngest step `create-blobs-batch-*` fails with storage URL fetch error | Stored binary file cannot be fetched from Convex storage URL. | Convex file storage reachability. | Verify that binary files uploaded to Convex are intact. Inspect Inngest run logs at `http://localhost:8288` for the failed file path. | Yes (safe to retry) |

---

## OAuth Scope & Configuration Reference

### 1. Clerk OAuth Social Connection Scopes
Nexus uses Clerk to manage GitHub OAuth tokens. In the **Clerk Dashboard > User & Authentication > Social Connections > GitHub**:

| Scope | Purpose in Nexus | Where Required |
| :--- | :--- | :--- |
| `read:user` | Retrieves the authenticated GitHub user profile (`octokit.rest.users.getAuthenticated()`) to obtain the user's login username during export. | Mandatory for Export |
| `repo` | Grants read access to private repositories for Import, and full write access to create repositories, create git trees, blobs, and commits during Export. | Mandatory for Export; Required for Import of private repos |

> [!IMPORTANT]
> If a user connects GitHub without the `repo` scope, repository export will fail at `create-repo` with HTTP 403 or 404, and importing private repositories will fail with HTTP 404.

### 2. Relevant Environment Variables
Refer to [`.env.example`](../.env.example) for exact variable configuration:

| Variable | Scope | Purpose in Integration |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Public / Client | Initializes Clerk frontend components, sign-in dialogs, and user profile modals where GitHub accounts are connected. |
| `CLERK_SECRET_KEY` | Server-only | Used by `@clerk/nextjs/server` to query the Clerk backend API for OAuth tokens via `client.users.getUserOauthAccessToken(userId, "github")`. |
| `NEXUS_CONVEX_INTERNAL_KEY` | Server-only | Authorizes internal system mutations (`api.system.createProject`, `api.system.createFolder`, `api.system.createFile`, `api.system.updateImportProgress`, `api.system.updateExportProgress`). Must match in `.env.local` and Convex. |

---

## Retryable vs. Non-Retryable Failure Guide

### Non-Retryable Failures (User or Configuration Fix Required)
Do **not** repeatedly retry these operations without addressing the root cause:
- **Missing Token / Disconnected Account:** Requires the user to link GitHub via Clerk.
- **Malformed URL / Invalid Repo Name:** Requires correcting the input string.
- **Insufficient Permissions / Missing `repo` Scope:** Requires updating Clerk OAuth settings and re-consenting on GitHub.
- **Repository Already Exists (HTTP 422):** Requires providing a different repository name for export.
- **Empty Project (`No files to export`):** Requires creating at least one file before exporting.
- **Server Configuration Error (`NEXUS_CONVEX_INTERNAL_KEY`):** Requires setting the matching environment variable.

### Transient / Retryable Failures
These failures are safe to retry once the transient condition clears:
- **Rate Limits (HTTP 429 or HTTP 403 rate limit):** Nexus automatically attempts exponential backoff with jitter up to 3 times. If still exceeded, wait for the `X-RateLimit-Reset` time before re-trying.
- **Network Glitches / Timeouts (`ECONNRESET`, `ETIMEDOUT`):** Automatically retried up to 3 times by `withExponentialBackoff`.
- **Cancelled Export:** Safe to reset using `/api/github/export/reset` and export again; Inngest aborts the job cleanly without corrupting the local project.

---

## Diagnostic Steps for Contributors

When investigating an import or export failure locally:

1. **Check the Local Inngest Dashboard:**  
   Open `http://localhost:8288` in your browser. Navigate to **Runs** and inspect the failed `importGithubRepo` or `exportToGithub` run to view step execution logs and exact Octokit error payloads.
2. **Inspect the Token Status:**  
   Verify that the user profile modal in the frontend shows GitHub as connected.
3. **Verify Convex System Keys:**  
   Run:
   ```bash
   npx convex env get NEXUS_CONVEX_INTERNAL_KEY
   ```
   Confirm that the output matches `NEXUS_CONVEX_INTERNAL_KEY` in `.env.local`.
4. **Inspect Endpoint Responses:**  
   Use your browser DevTools **Network** tab to inspect the HTTP status and JSON response from `/api/github/import` or `/api/github/export`.

---

## Related Documentation

- [README.md GitHub OAuth Setup](../README.md#step-3-github-oauth-through-clerk-for-github-import--export) — Step-by-step setup for Clerk and GitHub OAuth applications.
- [Local Service Topology Guide](local-service-topology.md) — Comprehensive guide on Next.js, Convex, and Inngest local communication.
- [Architecture Guide: API Route Reference](architecture.md#7-api-route-reference) — Request and response contracts for GitHub API endpoints.
- [Architecture Guide: Background Orchestration](architecture.md#3-component-responsibilities) — Inngest durable step execution architecture.
