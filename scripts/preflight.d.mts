export interface PreflightStep {
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
}

export const PREFLIGHT_STEPS: readonly PreflightStep[];

export interface PreflightRunOptions {
  npmExecPath?: string;
  nodeExecutable?: string;
  runCommand?: (
    executable: string,
    args: string[],
    options: { cwd: string; env: NodeJS.ProcessEnv; stdio: "inherit" },
  ) => { status: number | null; signal: NodeJS.Signals | null; error?: Error | null };
  log?: (...args: unknown[]) => void;
  reportError?: (...args: unknown[]) => void;
}

export function runPreflight(options?: PreflightRunOptions): number;
