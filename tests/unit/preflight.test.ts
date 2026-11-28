import { describe, expect, it, vi } from "vitest";

import { PREFLIGHT_STEPS, runPreflight } from "../../scripts/preflight.mjs";

describe("contributor preflight", () => {
  it("runs all five checks sequentially in the documented order", () => {
    const runCommand = vi.fn((_executable: string, _args: string[], _options: { cwd: string; env: NodeJS.ProcessEnv; stdio: "inherit" }) => ({
      status: 0,
      signal: null,
      error: undefined,
    }));
    const log = vi.fn();

    const exitCode = runPreflight({
      npmExecPath: "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js",
      nodeExecutable: "C:/Program Files/nodejs/node.exe",
      runCommand,
      log,
      reportError: vi.fn(),
    });

    expect(exitCode).toBe(0);
    expect(PREFLIGHT_STEPS.map((step) => step.command)).toEqual([
      "npm test",
      "npm run test:regression",
      "npm run typecheck",
      "npm run lint",
      "npm run build",
    ]);
    expect(runCommand.mock.calls.map((call) => call[1])).toEqual([
      ["C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js", "test"],
      ["C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js", "run", "test:regression"],
      ["C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js", "run", "typecheck"],
      ["C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js", "run", "lint"],
      ["C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js", "run", "build"],
    ]);
    expect(runCommand.mock.calls.every((call) => call[0] === "C:/Program Files/nodejs/node.exe")).toBe(true);
    expect(log).toHaveBeenCalledWith("[preflight] All checks passed.");
  });

  it("stops at the first failed check and returns its non-zero exit code", () => {
    const runCommand = vi.fn()
      .mockReturnValueOnce({ status: 0, signal: null, error: undefined })
      .mockReturnValueOnce({ status: 0, signal: null, error: undefined })
      .mockReturnValueOnce({ status: 2, signal: null, error: undefined });
    const reportError = vi.fn();

    const exitCode = runPreflight({
      npmExecPath: "/usr/local/lib/node_modules/npm/bin/npm-cli.js",
      runCommand,
      log: vi.fn(),
      reportError,
    });

    expect(exitCode).toBe(2);
    expect(runCommand).toHaveBeenCalledTimes(3);
    expect(reportError).toHaveBeenCalledWith(
      "[preflight] TypeScript typecheck failed (exited with code 2). Remaining checks were skipped.",
    );
  });

  it("returns non-zero when the child process cannot start", () => {
    const reportError = vi.fn();
    const runCommand = vi.fn(() => ({
      status: null,
      signal: null,
      error: new Error("spawn failed"),
    }));

    const exitCode = runPreflight({
      npmExecPath: "/usr/local/lib/node_modules/npm/bin/npm-cli.js",
      runCommand,
      log: vi.fn(),
      reportError,
    });

    expect(exitCode).toBe(1);
    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith("[preflight] Unit tests could not start: spawn failed");
  });

  it("fails clearly when it is not launched from an npm script", () => {
    const reportError = vi.fn();
    const runCommand = vi.fn();

    const exitCode = runPreflight({
      npmExecPath: "",
      runCommand,
      log: vi.fn(),
      reportError,
    });

    expect(exitCode).toBe(1);
    expect(runCommand).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledWith(
      "[preflight] Could not locate the npm CLI. Start this command with npm run preflight.",
    );
  });
});
