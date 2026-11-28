# Local Service Topology & Contributor Guide

This guide explains how **Next.js**, **Convex**, and **Inngest** interact during local development in Nexus, their architectural responsibilities, communication flow, startup sequence, local endpoints, and how to diagnose common local connection failures.

---

## Section A — Overview

Local development in Nexus requires three concurrent services working together. Each service has a dedicated role:

| Service | Primary Responsibility | Local Role & Mechanics |
| :--- | :--- | :--- |
| **Next.js** (v16 App Router) | Application frontend, UI rendering, and HTTP API routes | Serves the web UI (`localhost:3000`), hosts App Router endpoints under `src/app/api/`, connects to Convex via client and server HTTP clients, and exposes `/api/inngest` for Inngest discovery and invocation. |
| **Convex** (v1.31) | Real-time database, document storage, and reactive subscriptions | Runs backend synchronization, indexes tables (`projects`, `files`, `conversations`, `messages`), serves reactive client subscriptions over WebSockets via `ConvexReactClient`, and handles server mutations via `ConvexHttpClient`. |
| **Inngest** (CLI Dev Server) | Background jobs, durable workflows, and autonomous AI agents | Acts as the local event bus and workflow scheduler (`localhost:8288`). Polls `localhost:3000/api/inngest`, schedules step executions, and invokes registered functions (AI conversation agent, GitHub import, GitHub export). |

---

## Section B — Local Service Architecture

The following diagram illustrates the local communication flow between the developer's browser, the Next.js server, the Convex backend deployment, and the local Inngest development engine.

```mermaid
flowchart TD
    Browser["Developer Browser\n(http://localhost:3000)"]
    InngestDash["Inngest Dev UI\n(http://localhost:8288)"]
    
    subgraph NextServer ["Next.js Server (Port 3000)"]
        UI["React 19 Frontend\n& Client Components"]
        APIRoutes["Next.js API Routes\n(/api/messages, /api/github/*, etc.)"]
        InngestRoute["Inngest Endpoint\n(/api/inngest)"]
    end

    subgraph ConvexBackend ["Convex Backend (Cloud/Dev Sync)"]
        ConvexClientEndpoints["Public Queries & Mutations\n(Auth via Clerk JWT)"]
        ConvexSystemEndpoints["System Queries & Mutations\n(Auth via NEXUS_CONVEX_INTERNAL_KEY)"]
        ConvexDB[("Convex Real-Time Database\n(projects, files, conversations, messages)")]
    end

    subgraph InngestDevServer ["Inngest Local Engine (Port 8288)"]
        EventBus["Local Event Queue\n& Step Orchestrator"]
        FunctionExecutor["Function Runners\n(processMessage, importGithubRepo, exportToGithub)"]
    end

    %% Browser flows
    Browser -->|HTTP Requests & Static Assets| UI
    Browser <-->|WebSocket Reactive Subscriptions\n(ConvexReactClient)| ConvexClientEndpoints
    Browser -->|API Requests\n(e.g., POST /api/messages)| APIRoutes
    Browser -->|View Local Workflows| InngestDash

    %% Next.js server flows
    APIRoutes -->|HTTP Client Calls\n(ConvexHttpClient + NEXUS_CONVEX_INTERNAL_KEY)| ConvexSystemEndpoints
    APIRoutes -->|Dispatch Events\n(inngest.send)| EventBus
    
    %% Inngest local engine flows
    InngestDash <--> EventBus
    EventBus <-->|Polls / Introspects & Dispatches Invocations\n(HTTP POST/PUT)| InngestRoute
    FunctionExecutor -->|Executes Registered Workflows| InngestRoute
    InngestRoute -->|System Mutations & File Operations\n(NEXUS_CONVEX_INTERNAL_KEY)| ConvexSystemEndpoints

    %% Convex database storage
    ConvexClientEndpoints --> ConvexDB
    ConvexSystemEndpoints --> ConvexDB
```

---

## Section C — Service Responsibilities

### 1. Next.js (App Router Development Server)
- **Frontend & Workbench:** Renders the single-page IDE workbench including the CodeMirror 6 editor, project explorer, tab management, and conversation sidebar.
- **Client State Subscription:** Initializes `<ConvexProviderWithClerk>` in `src/components/providers.tsx` using `NEXT_PUBLIC_CONVEX_URL`, allowing React components to subscribe reactively to project documents.
- **API Routes (`src/app/api/`):** Validates client inputs, checks Clerk authentication sessions (`auth()`), and dispatches asynchronous background tasks to Inngest via `inngest.send()`.
- **Server-to-Convex Communication:** Directly performs privileged backend operations using `ConvexHttpClient` in `src/lib/convex-client.ts` authorized with `NEXUS_CONVEX_INTERNAL_KEY`.
- **Inngest Serving Endpoint:** Mounts the Inngest handler at `src/app/api/inngest/route.ts` using `serve()` from `inngest/next`.

### 2. Convex (Database & Real-Time Sync)
- **Local Dev Process:** Managed via `npx convex dev`, which synchronizes local schema and functions (`convex/schema.ts`, `convex/system.ts`, etc.) with the Convex cloud development deployment.
- **Reactive WebSocket Layer:** Pushes instantaneous database mutations to connected browser clients without manual polling or re-fetching.
- **Dual Authentication Boundaries:**
  - *Client Access:* Public queries and mutations verify the calling user's identity via Clerk JWT (`ctx.auth.getUserIdentity()`).
  - *Internal Service Access:* Internal system endpoints in `convex/system.ts` verify `NEXUS_CONVEX_INTERNAL_KEY` passed from Next.js server routes and Inngest background workers.

### 3. Inngest (Background Workflow Engine)
- **Local Event Bus:** Managed by `npx inngest-cli@latest dev`. In local development, it acts as an unauthenticated, zero-configuration event bus running at `http://localhost:8288`.
- **Function Discovery:** Polls `http://localhost:3000/api/inngest` via HTTP to introspect registered functions and schemas.
- **Durable Orchestration:** Executes multi-step background workflows with automatic retry handling, backoff, and execution tracking:
  - `processMessage`: AI assistant workflow invoking `@inngest/agent-kit` tools (file creation, updates, deletions, and Firecrawl scraping).
  - `importGithubRepo`: Clones and batches file creation for imported GitHub repositories.
  - `exportToGithub`: Collects project files and pushes commits to GitHub via Octokit.

---

## Section D — Startup Order

To prevent connection errors where one service attempts to register with or query an unready service, start the three services in the following order across separate terminal sessions:

### Terminal 1 — Convex Backend
Convex must start first so that the deployment URL is active and any local schema or function changes are compiled.

```bash
npx convex dev
```
- **What it does:** Runs the Convex sync watcher, compiles functions in `convex/`, and ensures your project's `NEXT_PUBLIC_CONVEX_URL` is configured.
- **Wait for:** The terminal output showing:
  ```text
  ✔ Convex functions ready!
  ```

### Terminal 2 — Next.js Application Server
Next.js must start second so that the HTTP web server and `/api/inngest` endpoint are active before Inngest attempts discovery.

```bash
npm run dev
```
- **What it does:** Starts the Next.js App Router development server at `http://localhost:3000`.
- **Wait for:** The terminal output showing:
  ```text
  ▲ Next.js 16.1.1
  - Local:        http://localhost:3000
  ✔ Ready in ...ms
  ```

### Terminal 3 — Inngest Dev Server
Inngest starts third so it can immediately connect to the running Next.js application at `http://localhost:3000/api/inngest`.

```bash
npx inngest-cli@latest dev
```
- **What it does:** Boots the local Inngest background engine and web dashboard at `http://localhost:8288`, probing `http://localhost:3000/api/inngest`.
- **Wait for:** The terminal output confirming successful connection:
  ```text
  App "nexus" connected: 3 functions found at http://localhost:3000/api/inngest
  ```

---

## Section E — Local URLs and Endpoints

| Service | Local URL / Endpoint | Purpose | Access In |
| :--- | :--- | :--- | :--- |
| **Next.js Web Application** | `http://localhost:3000` | Main IDE workbench, editor, file explorer, chat, and preview | Browser |
| **Inngest Local Dashboard** | `http://localhost:8288` | Local workflow inspector, event stream viewer, function run logs | Browser |
| **Inngest Integration Route** | `http://localhost:3000/api/inngest` | Webhook endpoint where Inngest discovers and triggers functions | Automated (Inngest Engine) |
| **Convex Dashboard** | `https://dashboard.convex.dev` | View database documents, manage deployment environment variables | Browser |
| **Convex Cloud Sync URL** | Configured in `NEXT_PUBLIC_CONVEX_URL` | WebSocket and HTTP endpoint for reactive data sync | Automated (App / Client) |

> [!NOTE]
> Open **`http://localhost:3000`** in your browser to use the IDE and **`http://localhost:8288`** to inspect background agent runs and events. `http://localhost:3000/api/inngest` is an HTTP API endpoint intended for the Inngest CLI/engine, not a human-facing web page.

---

## Section F — How `/api/inngest` Works

The integration between Next.js and Inngest centers on [`src/app/api/inngest/route.ts`](../src/app/api/inngest/route.ts):

1. **Client Initialization (`src/inngest/client.ts`):**
   ```ts
   import { Inngest } from "inngest";
   import { sentryMiddleware } from "@inngest/middleware-sentry";

   export const inngest = new Inngest({
     id: "nexus",
     middleware: [sentryMiddleware()],
   });
   ```
   The client is identified with the application ID `"nexus"`.

2. **Function Registration (`src/app/api/inngest/route.ts`):**
   ```ts
   import { serve } from "inngest/next";
   import { inngest } from "@/inngest/client";
   import { processMessage } from "@/features/conversations/inngest/process-message";
   import { importGithubRepo } from "@/features/projects/inngest/import-github-repo";
   import { exportToGithub } from "@/features/projects/inngest/export-to-github";

   export const { GET, POST, PUT } = serve({
     client: inngest,
     functions: [
       processMessage,
       importGithubRepo,
       exportToGithub,
     ],
   });
   ```

3. **Discovery & Invocation Lifecycle:**
   - **`GET /api/inngest`**: When the local Inngest CLI server starts or scans, it issues a `GET` request to introspect the registered function IDs, configuration schemas, and triggering events (`conversations/process-message`, `github/import.repo`, `github/export.repo`).
   - **`POST /api/inngest`**: When an event is dispatched via `inngest.send()`, the Inngest engine issues an HTTP `POST` request delivering execution steps to the Next.js runtime.
   - **`PUT /api/inngest`**: Handles function registration updates when the local Next.js server reloads.

4. **When `/api/inngest` is Unavailable:**
   If Next.js is stopped, crashing, or running on an unexpected port, the Inngest CLI logs connection errors (`failed to connect to app`), and any dispatched background workflows will stall in the event queue until the endpoint recovers.

---

## Section G — Environment Configuration

The following environment variables directly govern communication across Next.js, Convex, and Inngest. Refer to [`.env.example`](../.env.example) as the authoritative reference:

| Environment Variable | Target Service | Scope | Required / Optional | Description |
| :--- | :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_CONVEX_URL` | Next.js (Browser & Server) | Public (`NEXT_PUBLIC_`) | **Required** | The HTTP/WebSocket URL of the Convex deployment (e.g. `https://<deployment>.convex.cloud`). Used by `ConvexReactClient` in the browser and `ConvexHttpClient` on the server. Automatically generated by `npx convex dev`. |
| `CONVEX_DEPLOYMENT` | Convex CLI | CLI / Server | **Required** (Convex Dev) | Identifies your active Convex deployment (e.g. `dev:nexus-...`). Generated by `npx convex dev`. |
| `NEXUS_CONVEX_INTERNAL_KEY` | Next.js API Routes & Convex System Functions | Server-only (Private) | **Required** | Shared 32-byte secret authorizing server-to-server operations and Inngest agent tool execution. **Must match identically** in `.env.local` and your Convex deployment (`npx convex env set NEXUS_CONVEX_INTERNAL_KEY <key>`). Never expose via `NEXT_PUBLIC_`. |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex Auth Configuration | Convex Deployment | **Required** in Convex | The Clerk JWT Issuer URL (e.g. `https://<id>.clerk.accounts.dev`). Configured in Convex via `npx convex env set CLERK_JWT_ISSUER_DOMAIN <url>`. Allows Convex to validate Clerk session tokens. |
| `INNGEST_SIGNING_KEY` | Inngest / Next.js Server | Server-only (Private) | Optional for local dev | HMAC signing key for verifying digital signatures on incoming webhooks to `/api/inngest`. Not required when running the local dev server (`npx inngest-cli@latest dev`). |
| `INNGEST_EVENT_KEY` | Inngest / Next.js Server | Server-only (Private) | Optional for local dev | Event publishing key for dispatching events to Inngest Cloud. Not required locally because the Inngest SDK routes events directly to `localhost:8288` when unset. |

---

## Section H — Common Connection Failures

| Symptom | Likely Cause | Diagnostic & Resolution Steps |
| :--- | :--- | :--- |
| **`Client created with undefined deployment address`** | `NEXT_PUBLIC_CONVEX_URL` is unset or empty in `.env.local`. | 1. Ensure `npx convex dev` has run successfully and written the deployment URL.<br>2. Check that `.env.local` exists and contains a valid `NEXT_PUBLIC_CONVEX_URL`.<br>3. Restart the Next.js server (`npm run dev`) to pick up newly added environment variables. |
| **`NEXUS_CONVEX_INTERNAL_KEY is not configured` or `Invalid internal key`** | The secret is missing from `.env.local` or does not match the secret in the Convex deployment. | 1. Run `npx convex env get NEXUS_CONVEX_INTERNAL_KEY` to inspect the Convex setting.<br>2. Compare with `NEXUS_CONVEX_INTERNAL_KEY` in `.env.local`.<br>3. Ensure both values match exactly without extra whitespace or quotes, then restart `npm run dev`. |
| **Inngest Dashboard shows "No apps connected" or 0 functions** | Next.js dev server is not running or `/api/inngest` is failing. | 1. Verify `npm run dev` is active on port 3000.<br>2. Test the endpoint in your browser or curl: `curl http://localhost:3000/api/inngest`. It should return a JSON response with app metadata.<br>3. Check the Inngest CLI terminal for connection refusal messages. |
| **Chat messages remain stuck in "processing" state** | Inngest development server is not running or failed to process the `conversations/process-message` event. | 1. Check if `npx inngest-cli@latest dev` is running in Terminal 3.<br>2. Open `http://localhost:8288` and check the **Runs** tab for `processMessage`.<br>3. Inspect the run details for unhandled exceptions or missing API keys (`OPENAI_API_KEY`). |
| **Convex queries return authentication errors (`Unauthorized`)** | Clerk JWT template is not configured or Issuer Domain is mismatched in Convex. | 1. Verify that `CLERK_JWT_ISSUER_DOMAIN` is set in Convex: `npx convex env get CLERK_JWT_ISSUER_DOMAIN`.<br>2. Check Clerk Dashboard > JWT Templates > Convex and ensure the Issuer URL matches. |
| **`Failed to fetch` or WebSocket connection failure in browser console** | Network firewall or stale Convex project deployment. | 1. Verify your network permits outbound WebSocket connections (`wss://`).<br>2. Run `npx convex dev --once` to confirm deployment reachability. |

---

## Section I — Quick Startup Checklist

Follow this checklist when starting your local development session:

- [ ] `.env.local` is present with required keys (`NEXT_PUBLIC_CONVEX_URL`, `NEXUS_CONVEX_INTERNAL_KEY`, Clerk keys, and `OPENAI_API_KEY`).
- [ ] `NEXUS_CONVEX_INTERNAL_KEY` is set in Convex via `npx convex env set`.
- [ ] **Terminal 1:** `npx convex dev` is running and reporting functions ready.
- [ ] **Terminal 2:** `npm run dev` is running and accessible at `http://localhost:3000`.
- [ ] **Terminal 3:** `npx inngest-cli@latest dev` is running and reports `nexus` connected with 3 functions.
- [ ] **Browser:** `http://localhost:3000` loads the workbench UI.
- [ ] **Browser:** `http://localhost:8288` displays the Inngest local dashboard.
