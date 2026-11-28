import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Keep this sequence aligned with the contributor guide and CI.
 * Individual npm scripts remain available for focused development.
 */
export const PREFLIGHT_STEPS = Object.freeze([
  { name: "Unit tests", command: "npm test", args: ["test"] },
  { name: "Regression tests", command: "npm run test:regression", args: ["run", "test:regression"] },
  { name: "TypeScript typecheck", command: "npm run typecheck", args: ["run", "typecheck"] },
  { name: "ESLint", command: "npm run lint", args: ["run", "lint"] },
  { name: "Production build", command: "npm run build", args: ["run", "build"] },
]);

/**
 * Run each npm script sequentially and stop at the first failure.
 * npm_execpath points to npm CLI JavaScript; spawning it with Node avoids
 * shell parsing and npm.cmd differences in Windows PowerShell.
 */
export function runPreflight({
  npmExecPath = process.env.npm_execpath,
  nodeExecutable = process.execPath,
  runCommand = (executable, args, options) => spawnSync(executable, args, options),
  log = console.log,
  reportError = console.error,
} = {}) {
  if (!npmExecPath) {
    reportError("[preflight] Could not locate the npm CLI. Start this command with npm run preflight.");
    return 1;
  }

  for (const [index, step] of PREFLIGHT_STEPS.entries()) {
    log("");
    log("[preflight] " + (index + 1) + "/" + PREFLIGHT_STEPS.length + ": " + step.command);

    const result = runCommand(nodeExecutable, [npmExecPath, ...step.args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });

    if (result.error) {
      reportError("[preflight] " + step.name + " could not start: " + result.error.message);
      return 1;
    }

    if (result.status !== 0) {
      const reason = result.signal
        ? "terminated by signal " + result.signal
        : "exited with code " + String(result.status ?? 1);
      reportError("[preflight] " + step.name + " failed (" + reason + "). Remaining checks were skipped.");
      return result.status && result.status > 0 ? result.status : 1;
    }

    log("[preflight] " + step.name + " passed.");
  }

  log("");
  log("[preflight] All checks passed.");
  return 0;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = runPreflight();
}
