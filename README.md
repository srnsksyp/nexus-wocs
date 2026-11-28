# 🚀 Nexus — Browser-Based AI-Powered IDE

Nexus is a full-featured, browser-based, AI-native Integrated Development Environment (IDE). It combines intelligent code suggestions, natural-language editing, conversation-driven assistant workflows, in-browser containerized execution, and real-time cloud persistence.

---

## 📸 Overview

![Nexus IDE Screenshot](./public/image.png)

### Core Capabilities

- ⚡ **Real-Time Workspace Sync:** Instant reactive state synchronization and file persistence powered by Convex.
- 🤖 **AI Code Generation & Ghost Text:** Inline real-time code completion using OpenAI.
- ⌘ **Quick Edit (Cmd + K):** Natural language in-place code modification with automatic context extraction and optional documentation scraping via Firecrawl.
- 💬 **Conversation-Based AI Assistant:** Full assistant chat sidebar running multi-step background tool execution workflows via Inngest.
- 🌐 **In-Browser Execution:** Client-side Node.js container execution and interactive terminal powered by the WebContainer API and xterm.js.
- 📁 **File & Tree Management:** Hierarchical multi-file and multi-folder explorer with tabbed editing, dirty tab indicators, and conflict detection.
- 🔗 **GitHub Integration:** OAuth-authenticated repository import and multi-step batch export via Clerk and Inngest.

---

## 🧰 Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend Framework** | Next.js 16 (App Router, Turbopack), React 19, TypeScript |
| **Styling & Components**| Tailwind CSS 4, Radix UI, shadcn/ui, Lucide Icons |
| **Code Editor** | CodeMirror 6 (with custom language extensions, minimap, indentation markers) |
| **Database & Real-time**| Convex (reactive subscriptions, queries, mutations, document storage) |
| **Background Orchestration** | Inngest (durable execution, event-driven retries, and agent workflows) |
| **AI SDK & Models** | OpenAI (`gpt-4.1-mini`), Vercel AI SDK (`ai`), `@inngest/agent-kit` |
| **Authentication** | Clerk (JWT authentication, GitHub OAuth token management) |
| **In-Browser Execution**| WebContainer API (`@webcontainer/api`), xterm.js |
| **Documentation Scraping**| Firecrawl (`@mendable/firecrawl-js`) |
| **Monitoring** | Sentry (`@sentry/nextjs`) |
| **Testing** | Vitest, React Testing Library, JSDOM |

---

## ⚙️ Prerequisites

Before you begin, ensure you have the following installed on your machine:

- **Node.js:** `v20.x` or higher (verified on Node 20 and Node 24)
- **Package Manager:** `npm` (v10+; uses committed `package-lock.json`)
- **Git:** `v2.30+`

### Required External Service Accounts

To run the complete application with all capabilities, you will need free developer accounts on:

1. **[Clerk](https://clerk.com):** User authentication and session management.
2. **[Convex](https://www.convex.dev):** Real-time database and document backend.
3. **[Inngest](https://www.inngest.com):** Background workflow execution (local dev server provided by Inngest CLI).
4. **[OpenAI](https://platform.openai.com):** API key for AI assistant and quick edits.

*(Optional)* **[Firecrawl](https://www.firecrawl.dev):** For scraping web documentation when URLs are included in Cmd+K quick edits.
*(Optional)* **[GitHub](https://github.com):** For GitHub repository import and export via Clerk OAuth.

---

## 🚀 Quick Start Guide

### 1. Clone the Repository

```bash
git clone https://github.com/shashankkshyp/Nexus.git
cd Nexus
```

### 2. Install Dependencies

Install the project dependencies using the committed lockfile:

```bash
npm install
```

---

## 🔑 Environment Configuration

Copy the example environment file to `.env.local`:

**macOS / Linux / Git Bash:**
```bash
cp .env.example .env.local
```

**Windows PowerShell:**
```powershell
Copy-Item .env.example .env.local
```

Open `.env.local` in your editor. Refer to [.env.example](.env.example) for detailed variable comments.

For the complete environment-variable reference, including public/server scope, required versus optional settings, and local versus production configuration, see the [Environment Variables and Deployment Configuration Guide](docs/architecture.md#environment-variables-and-deployment-configuration).

---

## 🛠️ Step-by-Step Service Setup

### Step 1: Convex Setup

Convex acts as the real-time database and document store.

1. **Log in to Convex and initialize your project:**
   ```bash
   npx convex dev
   ```
2. If prompted, log in to your Convex account and select or create a project.
3. Once created, the Convex CLI will automatically configure your local deployment URL (`NEXT_PUBLIC_CONVEX_URL`) and deployment identifier (`CONVEX_DEPLOYMENT`) in your `.env.local`.

---

### Step 2: Clerk Authentication Setup

1. Go to the **[Clerk Dashboard](https://dashboard.clerk.com)** and create a new application (e.g., "Nexus IDE").
2. Choose **Email** and/or **GitHub** as authentication providers.
3. In the Clerk Dashboard, navigate to **API Keys** and copy:
   - **Publishable Key:** Set as `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in `.env.local`.
   - **Secret Key:** Set as `CLERK_SECRET_KEY` in `.env.local`.
4. Configure Clerk authentication for Convex:
   - In Clerk Dashboard, navigate to **Configure > JWT Templates** and click **New template**.
   - Select the **Convex** template.
   - Note the **Issuer** URL (e.g., `https://verb-noun-00.clerk.accounts.dev`).
   - Copy this Issuer URL and set it as an environment variable in your Convex deployment:
     ```bash
     npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-clerk-issuer-domain.clerk.accounts.dev
     ```
   *(Note: This allows Convex to securely authenticate Clerk session tokens via `convex/auth.config.ts`)*.

---

### Step 3: GitHub OAuth through Clerk (For GitHub Import / Export)

Nexus provides built-in repository import and export via GitHub. This uses Clerk's OAuth token store:

1. In the **Clerk Dashboard**, go to **User & Authentication > Social Connections**.
2. Enable **GitHub**.
3. Under the GitHub connection settings:
   - For quick development, you can use Clerk's shared credentials or provide custom credentials.
   - For custom credentials, create an OAuth App in **GitHub Settings > Developer settings > OAuth Apps**:
     - **Homepage URL:** `http://localhost:3000`
     - **Authorization callback URL:** Copy the exact redirect URL provided by Clerk in the social connections dialog (e.g., `https://clerk.your-domain.com/v1/oauth_callback`).
   - Ensure the required scopes (`repo`, `read:user`) are permitted so Nexus can read and push repositories on behalf of the user.
4. When signed in to Nexus, users can link their GitHub account directly from the navbar or export modal.

---

### Step 4: Internal Service Key Configuration (`NEXUS_CONVEX_INTERNAL_KEY`)

Nexus secures communication between backend Next.js API routes, Inngest background workers, and internal Convex system mutations using a shared secret: `NEXUS_CONVEX_INTERNAL_KEY`.

> [!IMPORTANT]
> The value of `NEXUS_CONVEX_INTERNAL_KEY` **must match exactly** in both `.env.local` and your Convex deployment environment.

1. **Generate a secure random key:**

   *macOS / Linux / Git Bash:*
   ```bash
   openssl rand -hex 32
   ```

   *Windows PowerShell:*
   ```powershell
   -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
   ```

2. **Set in `.env.local`:**
   ```env
   NEXUS_CONVEX_INTERNAL_KEY=your_generated_32_byte_hex_key
   ```

3. **Set in Convex Deployment:**
   ```bash
   npx convex env set NEXUS_CONVEX_INTERNAL_KEY your_generated_32_byte_hex_key
   ```

**Security Rules:**
- Never commit this key to Git.
- Never prefix with `NEXT_PUBLIC_` (must never be sent to the browser).
- To rotate: generate a new hex string, update `.env.local`, update with `npx convex env set`, and restart your Next.js server.

---

### Step 5: OpenAI Configuration

Add your OpenAI API key to `.env.local`:

```env
OPENAI_API_KEY=sk-proj-your_openai_api_key_here
```

Nexus uses `gpt-4.1-mini` via the Vercel AI SDK for ghost text suggestions, quick edit instructions, and conversation responses.

---

## ▶️ Running the Application Locally

Running the full Nexus development environment requires three processes:

For a detailed explanation of how Next.js, Convex, and Inngest communicate during local development, see the [Local Service Topology Guide](docs/local-service-topology.md).

### Terminal 1: Convex Backend
```bash
npx convex dev
```
Runs the Convex sync server, database watchers, and function compiler.

### Terminal 2: Inngest Dev Server
```bash
npx inngest-cli@latest dev
```
Starts the local Inngest background engine (opens UI at `http://localhost:8288`), which polls `http://localhost:3000/api/inngest` to process asynchronous jobs (AI agent messages, GitHub imports, and GitHub exports).

### Terminal 3: Next.js Web Server
```bash
npm run dev
```
Starts the Next.js frontend and App Router API at [http://localhost:3000](http://localhost:3000).

---

## 🧪 Testing and Quality Checks

Nexus maintains two distinct testing suites to verify code quality and protect against regressions:

### 1. Vitest Unit Test Suite (`npm test`)
Covers modular unit tests located under `tests/unit/**/*.test.{ts,tsx}` (e.g. React component accessibility, parser utilities, and API schemas).
```bash
npm test
```

### 2. Standalone Node Regression Test Suite (`npm run test:regression`)
Covers end-to-end subsystem integration and security regression tests located in `tests/*.test.js` using Node's built-in `node:test` runner. These tests verify critical asynchronous workflows such as cancellation authorization, dirty tab conflict detection, execution progress tracking, GitHub import/export batching, and interactive WebContainer terminal lifecycles.
```bash
npm run test:regression
```

### Recommended Contributor Preflight

Before opening a pull request, run the complete verification sequence with one command:

```bash
npm run preflight
```

The command runs these checks sequentially and stops at the first failure:

1. `npm test` — Vitest unit tests.
2. `npm run test:regression` — standalone Node regression tests.
3. `npm run typecheck` — TypeScript validation.
4. `npm run lint` — full-project ESLint.
5. `npm run build` — production build.

The preflight runner invokes npm's JavaScript CLI through the active Node executable, rather than relying on shell command chaining. The same command works in Windows PowerShell, Windows Command Prompt, macOS, and Linux.

For faster iteration, individual checks remain available: `npm test`, `npm run test:regression`, `npm run typecheck`, `npm run lint`, and `npm run build`. The shorter `npm run test:all` command continues to run only the unit and regression suites.

> [!NOTE]
> The preflight covers the standard contributor checks. Special-runtime integration tests documented in [tests/README.md](tests/README.md) remain separate and should be run when working on those subsystems. See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow.

---
## 🔧 Troubleshooting Common Issues

### 1. `NEXUS_CONVEX_INTERNAL_KEY is not configured` or `Invalid internal key`
- **Cause:** The internal secret is either missing or does not match between `.env.local` and Convex.
- **Fix:** Re-check `.env.local` and verify the Convex secret by running:
  ```bash
  npx convex env get NEXUS_CONVEX_INTERNAL_KEY
  ```
  Ensure both strings are identical.

### 2. `Client created with undefined deployment address`
- **Cause:** `NEXT_PUBLIC_CONVEX_URL` is empty or undefined.
- **Fix:** Run `npx convex dev` to re-populate `.env.local`, or copy the URL from your Convex Dashboard.

### 3. `API key is required for the cloud API` (Firecrawl)
- **Cause:** `FIRECRAWL_API_KEY` is not set when calling Cmd+K quick edit with external URLs.
- **Fix:** Obtain a free API key at [firecrawl.dev](https://firecrawl.dev) and add `FIRECRAWL_API_KEY=fc-...` to `.env.local`.

### 4. GitHub Import/Export: `GitHub token not found`
- **Cause:** The signed-in user has not authorized GitHub OAuth through Clerk, or the required OAuth scopes were not requested.
- **Fix:** Re-authenticate with GitHub via Clerk or re-connect GitHub under your user profile settings in the app.

### 5. WebContainer Cross-Origin Isolation Errors
- **Cause:** WebContainer requires `SharedArrayBuffer` and WebAssembly threads, which browsers gate behind Cross-Origin Isolation (`window.crossOriginIsolated === true`).
- **Required Headers:** Nexus configures these in [next.config.ts](next.config.ts):
  - `Cross-Origin-Embedder-Policy: credentialless`
  - `Cross-Origin-Opener-Policy: same-origin`
- **Fix / Common Traps:**
  - Access the application via `http://localhost:3000` rather than local network IP addresses (e.g. `http://192.168.x.x:3000`). Plain HTTP over non-localhost IPs does not provide a Secure Context (`window.isSecureContext === false`).
  - If deploying behind a reverse proxy (Nginx, Traefik, Caddy) or CDN (Cloudflare), verify that the proxy does not strip `Cross-Origin-Embedder-Policy` or `Cross-Origin-Opener-Policy` response headers, and that SSL/TLS is properly terminated (`https://`).
  - For full browser compatibility matrices, verification commands, and diagnostic procedures, consult the [WebContainer Browser Compatibility & Deployment Guide](docs/architecture.md#9-webcontainer-browser-compatibility-and-deployment-guide).

---

## 📖 Further Reading

- [Contributing Guidelines](CONTRIBUTING.md) — Branch conventions, commit style, and PR process.
- [Local Service Topology Guide](docs/local-service-topology.md) — Local communication flow, service responsibilities, startup order, and troubleshooting for Next.js, Convex, and Inngest.
- [Architecture Guide](docs/architecture.md) — System design, message lifecycle, and background agent workflows.
- [WebContainer Browser Compatibility & Deployment Guide](docs/architecture.md#9-webcontainer-browser-compatibility-and-deployment-guide) — Browser support matrices, cross-origin isolation, reverse-proxy setup, and troubleshooting.
- [Convex Data Model and Mutation Lifecycle](docs/architecture.md#8-convex-data-model-and-mutation-lifecycle) — Convex schema, table reference, ownership authorization, indexes, and cascade deletion rules.
- [API Route Reference](docs/architecture.md#7-api-route-reference) — Next.js App Router request and response contracts, authentication requirements, and error statuses.
- [Code of Conduct](CODE_OF_CONDUCT.md)
