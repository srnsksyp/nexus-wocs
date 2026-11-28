# Contributing to Nexus

Thanks for your interest in contributing to Nexus! This document outlines our conventions, coding standards, development workflows, and pull request procedures.

---

## 🚀 Development Setup

Before contributing, please read the [README.md](README.md) for full instructions on setting up your local development environment, configuring Convex, Clerk, Inngest, and creating your `.env.local`.

---

## 🌿 Branching Conventions

Always branch off the latest `main` branch. Use clear, descriptive branch prefixes matching the type of work being performed:

| Prefix | Purpose | Example |
| :--- | :--- | :--- |
| `feat/` | New features or functional additions | `feat/terminal-resize-handler` |
| `fix/` | Bug fixes or issue resolutions | `fix/file-rename-sync-conflict` |
| `docs/` | Documentation improvements or guides | `docs/architecture-diagram-update` |
| `refactor/` | Code structure refactoring with no behavioral change | `refactor/convex-queries-cleanup` |
| `test/` | Adding or updating tests | `test/file-tree-edge-cases` |
| `ci/` | CI/CD automation and pipeline improvements | `ci/vitest-github-actions` |
| `perf/` | Performance optimizations | `perf/github-export-batching` |

### Branch Commands

```bash
# Keep local main up to date
git checkout main
git pull upstream main

# Create and switch to your dedicated feature branch
git checkout -b feat/your-feature-name
```

---

## 💬 Commit Message Conventions

Nexus follows the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```text
<type>(<scope>): <short description in present tense>
```

### Commit Types

- `feat`: A new feature for users or runtime.
- `fix`: A bug fix.
- `docs`: Documentation updates.
- `refactor`: Code changes that neither fix a bug nor add a feature.
- `perf`: A code change that improves performance.
- `test`: Adding missing tests or correcting existing tests.
- `ci`: Changes to CI configuration files and scripts.
- `chore`: Maintenance tasks, dependency updates, or internal tooling changes.

### Examples

```bash
git commit -m "feat(editor): add bracket auto-closing extension"
git commit -m "fix(sync): resolve dirty tab conflict detection on save"
git commit -m "docs(dx): update local setup instructions for Inngest"
git commit -m "ci(quality): establish Vitest and GitHub Actions pipeline"
```

---

## 🎨 Coding Standards

1. **TypeScript First:** Ensure strict type safety. Avoid `any` types; define explicit interfaces and Zod schemas for boundary validation.
2. **Component Architecture:** Use React 19 functional components with Tailwind CSS 4 and Radix UI / shadcn design tokens.
3. **Database Mutations & API Contracts:** All Convex mutations and Next.js API routes touching user data must enforce user ownership authentication via Clerk session checks or internal keys. Refer to the [API Route Reference](docs/architecture.md#7-api-route-reference) before adding or updating endpoints.
4. **Focused Changes:** Keep PRs narrowly focused on a single issue or objective. Avoid drive-by formatting or sweeping architectural rewrites.
5. **No Committed Secrets:** Never commit `.env`, `.env.local`, API keys, or private tokens.

---

## 🧪 Testing & Quality Requirements

Nexus uses a two-tiered testing architecture to validate application correctness. Contributors are expected to verify both suites before opening a pull request.

### Prerequisites & Node.js Version
Nexus requires **Node.js `v20.x` or higher** (verified on Node 20 LTS and Node 24). Standalone regression suites rely on Node's native test runner (`node:test`).

### 1. Vitest Unit Tests
Discovered through `vitest.config.ts` matching `tests/unit/**/*.test.{ts,tsx}`. These test isolated React components, accessibility attributes, DOM keyboard navigation, and synchronous helper functions in JSDOM / Node environments.
```bash
npm test
```

### 2. Standalone Node Regression Tests
Located at the root of `tests/*.test.js` and executed via Node's built-in test runner:
```bash
npm run test:regression
```
This suite verifies complete subsystem contracts, including:
- `tests/cancellation-authorization.test.js`: Message & project cancellation permission boundaries.
- `tests/editor-dirty-tabs-conflict.test.js`: Editor tab dirty tracking, external conflict detection, and unsaved changes preservation.
- `tests/execution-progress-tracking.test.js`: Inngest AI execution lifecycle and tool event streaming.
- `tests/frontend-project-deletion.test.js`: Project deletion modal validation and contracts.
- `tests/github-import-export-optimization.test.js`: Batch processing, exponential backoff, and GitHub sync resilience.
- `tests/interactive-terminal.test.js`: WebContainer shell process spawning, SIGINT handling, and resizing.
- `tests/tool-handlers-tracking.test.js`: AI tool execution wrapping and tracking.
- `tests/tool-retry-idempotency.test.js`: Deterministic retry IDs and Inngest step idempotency.

### 3. Special-Runtime Integration Tests
Certain historical backend integration tests (such as `tests/project-deletion-cascade.test.js` and `tests/security-resource-ownership.test.js`) require specialized Convex backend mocks and can be executed individually when working on those specific subsystems:
```bash
node --test tests/project-deletion-cascade.test.js
node --test tests/security-resource-ownership.test.js
```

### Recommended Local Verification Sequence

Before opening a pull request, run the contributor preflight from the repository root:

```bash
npm run preflight
```

The preflight runs, in order, `npm test`, `npm run test:regression`, `npm run typecheck`, `npm run lint`, and `npm run build`. It is fail-fast: the first non-zero command stops the sequence and makes the preflight exit non-zero. GitHub Actions uses the same command so local and CI verification stay aligned.

The runner uses Node's built-in process API and npm's active CLI entry point, so it does not depend on POSIX shell chaining or `npm.cmd`. Use the same `npm run preflight` invocation in Windows PowerShell, Windows Command Prompt, macOS, and Linux.

#### Focused checks during development

You can still run one check at a time when iterating on a specific area:

```bash
npm test                              # All Vitest unit tests
npx vitest run tests/unit/foo.test.tsx # One focused unit test
npm run test:regression               # Standalone Node regression suite
npm run typecheck                     # TypeScript validation
npm run lint                          # Full-project ESLint
npm run build                         # Production build
npm run test:all                      # Unit + regression suites only
```

Special-runtime integration tests documented in [tests/README.md](tests/README.md) remain separate and should be run when working on those subsystems.

---
## 💻 Adding or Updating Editor Language Support

Nexus uses CodeMirror 6 for syntax highlighting in the central code editor. Language extensions are dynamically selected based on the active file name. Contributors looking to add a new language mode or update existing extension mappings should follow this workflow:

### 1. Locate the Central Extension Mapping
The mapping from file extensions to CodeMirror language packages is isolated in a single file:
- [`src/features/editor/extensions/language-extension.ts`](src/features/editor/extensions/language-extension.ts)

This file exports `getLanguageExtension(filename: string): Extension`, which inspects the filename and returns the appropriate CodeMirror language extension (or an empty array `[]` as fallback).

### 2. Check and Add Language Package Dependencies
Before adding a mapping, check [`package.json`](package.json) under `dependencies` to see if the required `@codemirror/lang-*` package is already installed.
- Currently bundled language packages include:
  - `@codemirror/lang-javascript` (handles JS, JSX, TS, TSX)
  - `@codemirror/lang-html`
  - `@codemirror/lang-css`
  - `@codemirror/lang-json`
  - `@codemirror/lang-markdown` (handles Markdown and MDX)
  - `@codemirror/lang-python`
- If the language requires a package not yet installed, install it using `npm`:
  ```bash
  npm install @codemirror/lang-<language>
  ```
  Only add a new dependency if an existing package does not already cover the syntax.

### 3. Update the Mapping
In `src/features/editor/extensions/language-extension.ts`:
1. Import the language function from `@codemirror/lang-<language>`.
2. Add a `case` to the `switch (ext)` statement returning the initialized extension.

Example:
```typescript
import { rust } from "@codemirror/lang-rust";

// Inside getLanguageExtension:
case "rs":
  return rust();
```

### 4. Understand Editor Integration Boundaries
- [`src/features/editor/extensions/language-extension.ts`](src/features/editor/extensions/language-extension.ts): Pure utility mapping filename extensions to language extensions. **This is the primary file contributors should edit.**
- [`src/features/editor/components/code-editor.tsx`](src/features/editor/components/code-editor.tsx): Consumes `getLanguageExtension(fileName)` via `useMemo` and passes the resulting extension to `new EditorView({ ... })`. It should generally remain unchanged when adding language support.
- [`src/features/editor/extensions/custom-setup.ts`](src/features/editor/extensions/custom-setup.ts): Configures shared editor capabilities (line numbers, fold gutters, bracket matching, history, autocompletion keymaps). Adding a language mapping should **not** modify shared editor setup.

### 5. Filename Edge Cases & Fallback Behavior
The extraction logic uses:
```typescript
const ext = filename.split(".").pop()?.toLowerCase();
```
Contributors must account for how this extraction behaves:
- **Case-Insensitive Normalization:** `.toLowerCase()` ensures uppercase or mixed-case extensions (such as `main.JS` or `index.TS`) match standard lowercase switch cases.
- **Compound Extensions:** Filenames with compound extensions (such as `archive.tar.gz`) resolve to their trailing segment (e.g. `gz`). If an extension is not matched, it reaches `default`.
- **Missing or Unsupported Extensions:** Filenames without extensions (such as `Dockerfile` or `plain-text`) or unknown extensions return an empty array `[]` in the `default` branch. CodeMirror treats an empty array `[]` as a no-op extension, allowing plain text editing without syntax errors.

### 6. Language-Specific Configuration Options
Certain CodeMirror language packages accept configuration flags. For example, `@codemirror/lang-javascript` supports JSX and TypeScript parser modes:
- `.js` -> `javascript()`
- `.jsx` -> `javascript({ jsx: true })`
- `.ts` -> `javascript({ typescript: true })`
- `.tsx` -> `javascript({ typescript: true, jsx: true })`

When adding or updating language extensions, pass only configuration options officially supported by that `@codemirror/lang-*` package.

### 7. Add or Update Unit Tests
Whenever you add or update language mappings, update the unit test suite:
- [`tests/unit/language-extension.test.ts`](tests/unit/language-extension.test.ts)

Ensure test cases cover:
- Successful extension resolution for the new language.
- Uppercase/case-insensitive extension handling.
- Unsupported/fallback behavior where applicable.

Run the focused test command:
```bash
npx vitest run tests/unit/language-extension.test.ts
```

---

## 📬 Pull Request Process

1. **Push your branch to your fork:**
   ```bash
   git push -u origin feat/your-feature-name
   ```
2. **Open a Pull Request:** Target the upstream `main` branch.
3. **PR Description:**
   - Link the relevant issue (e.g., `Fixes #12` or `Closes #12`).
   - Clearly summarize the problem and the proposed solution.
   - List the verification steps you performed locally.
   - Include before/after screenshots or GIFs for user-facing UI changes.
4. **Code Review:** Participate constructively in code reviews. Respond to feedback and address requested modifications promptly.
5. **Merge Policy:** Merges are performed via pull request review and approval. Do not merge your own PRs without maintainer sign-off.

---

## 🔒 Security Guidelines

Security is critical to Nexus:

- **Secrets Handling:** Never commit credentials or expose backend keys (`CLERK_SECRET_KEY`, `NEXUS_CONVEX_INTERNAL_KEY`, `OPENAI_API_KEY`) to client-side code.
- **Resource Ownership:** Verify that database queries and mutations check that the caller owns the targeted `projectId` or `conversationId`.
- **Reporting Vulnerabilities:** If you discover a security vulnerability, please do NOT create a public GitHub issue. Reach out to the maintainers privately or use GitHub's private vulnerability reporting feature.

---

## 🎯 Issue Assignment Policy

- **One Issue at a Time:** Each contributor can have only **one issue assigned to them at a time**.
- Contributors must complete their currently assigned issue and get it reviewed or closed before requesting assignment of another issue.
- This ensures fair distribution of work and gives everyone an opportunity to contribute.
- Do not work on multiple assigned issues simultaneously without prior approval from a maintainer.

## 📜 Code of Conduct

All contributors are expected to uphold our [Code of Conduct](CODE_OF_CONDUCT.md). Be respectful, collaborative, and constructive.
