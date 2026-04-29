import { spawn } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, normalize } from "node:path";
import type { PatchCandidate } from "./types";

export type PatchDisqualificationReason =
  | "apply-failed"
  | "check-failed"
  | "missing-execution"
  | "repo-context-unavailable"
  | "unsafe-command";

export interface RepoFileInput {
  path: string;
  content: string;
}

export interface PatchCheckCommand {
  command: string;
  timeoutMs?: number;
}

export interface CommandSummary {
  command: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  summary: string;
  stdout: string;
  stderr: string;
  truncated: boolean;
}

export interface PatchExecutionResult {
  candidateId: string;
  eligible: boolean;
  disqualifiedReason?: PatchDisqualificationReason;
  apply: CommandSummary;
  checks: CommandSummary[];
}

export interface PatchTournamentExecutionInput {
  candidates: PatchCandidate[];
  repoFiles: RepoFileInput[];
  checkCommands?: Array<string | PatchCheckCommand>;
  timeoutMs?: number;
  cleanup?: boolean;
  stopOnFirstCheckFailure?: boolean;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const OUTPUT_LIMIT = 700;

export async function executePatchTournament(
  input: PatchTournamentExecutionInput,
): Promise<Record<string, PatchExecutionResult>> {
  const root = mkdtempSync(join(tmpdir(), "scout-patch-tournament-"));
  const base = join(root, "base");
  const cleanup = input.cleanup ?? true;

  try {
    writeRepoFiles(base, input.repoFiles);
    const results: Record<string, PatchExecutionResult> = {};

    for (const candidate of input.candidates) {
      const workspace = join(root, candidate.id.replace(/[^a-zA-Z0-9._-]/g, "_"));
      cpSync(base, workspace, { recursive: true });
      results[candidate.id] = await executeCandidate(candidate, workspace, input);
    }

    return results;
  } finally {
    if (cleanup) rmSync(root, { recursive: true, force: true });
  }
}

async function executeCandidate(
  candidate: PatchCandidate,
  workspace: string,
  input: PatchTournamentExecutionInput,
): Promise<PatchExecutionResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const gitApply = await runCommand({
    command: "git",
    args: ["apply", "--whitespace=nowarn", "-"],
    cwd: workspace,
    input: candidate.patch,
    timeoutMs,
    displayCommand: "git apply --whitespace=nowarn -",
  });
  const apply = gitApply.exitCode === 0 ? gitApply : applySyntheticPatch(candidate.patch, workspace, gitApply);

  if (apply.exitCode !== 0) {
    return {
      candidateId: candidate.id,
      eligible: false,
      disqualifiedReason: "apply-failed",
      apply,
      checks: [],
    };
  }

  const checks: CommandSummary[] = [];
  for (const check of input.checkCommands ?? []) {
    const command = normalizeCheckCommand(check);
    const parsed = parseCommand(command.command);
    if (!isAllowedCheckCommand(parsed.command)) {
      const result = syntheticCommandSummary({
        command: command.command,
        exitCode: 126,
        stderr: `Refused unsafe check command: ${parsed.command}`,
      });
      checks.push(result);
      return {
        candidateId: candidate.id,
        eligible: false,
        disqualifiedReason: "unsafe-command",
        apply,
        checks,
      };
    }
    const result = await runCommand({
      command: parsed.command,
      args: parsed.args,
      cwd: workspace,
      timeoutMs: command.timeoutMs ?? timeoutMs,
      displayCommand: command.command,
    });
    checks.push(result);

    if (result.exitCode !== 0 && (input.stopOnFirstCheckFailure ?? true)) break;
  }

  const failedCheck = checks.some((check) => check.exitCode !== 0);
  return {
    candidateId: candidate.id,
    eligible: !failedCheck,
    disqualifiedReason: failedCheck ? "check-failed" : undefined,
    apply,
    checks,
  };
}

function writeRepoFiles(root: string, files: RepoFileInput[]) {
  mkdirSync(root, { recursive: true });

  for (const file of files) {
    const relative = safeRelativePath(file.path);
    const target = join(root, relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.content);
  }
}

function applySyntheticPatch(patch: string, cwd: string, gitApply: CommandSummary): CommandSummary {
  const started = Date.now();

  try {
    const files = parseSyntheticPatch(patch);
    if (files.length === 0) return gitApply;

    for (const file of files) {
      const relative = safeRelativePath(file.path);
      const target = join(cwd, relative);
      const original = readFileSync(target, "utf8");
      const hadTrailingNewline = original.endsWith("\n");
      let lines = splitContentLines(original);
      let cursor = 0;

      for (const hunk of file.hunks) {
        const index = findSequence(lines, hunk.oldLines, cursor);
        if (index < 0) throw new Error(`Patch context not found in ${file.path}`);
        lines = [
          ...lines.slice(0, index),
          ...hunk.newLines,
          ...lines.slice(index + hunk.oldLines.length),
        ];
        cursor = index + hunk.newLines.length;
      }

      writeFileSync(target, `${lines.join("\n")}${hadTrailingNewline ? "\n" : ""}`);
    }

    return commandSummary({
      command: "scout synthetic patch apply",
      exitCode: 0,
      signal: null,
      durationMs: Date.now() - started,
      stdout: `Applied Scout synthetic patch to ${files.length} file${files.length === 1 ? "" : "s"}.`,
      stderr: "",
      timedOut: false,
    });
  } catch (error) {
    return commandSummary({
      command: "scout synthetic patch apply",
      exitCode: 1,
      signal: null,
      durationMs: Date.now() - started,
      stdout: "",
      stderr: `${gitApply.stderr}\n${error instanceof Error ? error.message : String(error)}`,
      timedOut: false,
    });
  }
}

function parseSyntheticPatch(patch: string) {
  const files: Array<{ path: string; hunks: Array<{ oldLines: string[]; newLines: string[] }> }> = [];
  let currentFile: { path: string; hunks: Array<{ oldLines: string[]; newLines: string[] }> } | undefined;
  let currentHunk: { oldLines: string[]; newLines: string[] } | undefined;
  let oldPath: string | undefined;

  for (const line of patch.split("\n")) {
    const oldMatch = /^--- a\/(.+)$/.exec(line);
    if (oldMatch) {
      oldPath = oldMatch[1];
      currentFile = undefined;
      currentHunk = undefined;
      continue;
    }

    const newMatch = /^\+\+\+ b\/(.+)$/.exec(line);
    if (newMatch) {
      currentFile = { path: newMatch[1] === "/dev/null" ? oldPath ?? newMatch[1] : newMatch[1], hunks: [] };
      files.push(currentFile);
      currentHunk = undefined;
      continue;
    }

    if (line.startsWith("@@")) {
      if (!currentFile) throw new Error("Patch hunk appeared before a file header");
      currentHunk = { oldLines: [], newLines: [] };
      currentFile.hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk || line.startsWith("\\ No newline")) continue;
    if (line.startsWith(" ")) {
      currentHunk.oldLines.push(line.slice(1));
      currentHunk.newLines.push(line.slice(1));
    } else if (line.startsWith("-")) {
      currentHunk.oldLines.push(line.slice(1));
    } else if (line.startsWith("+")) {
      currentHunk.newLines.push(line.slice(1));
    }
  }

  return files.filter((file) => file.hunks.length > 0);
}

function splitContentLines(content: string) {
  const withoutTrailing = content.endsWith("\n") ? content.slice(0, -1) : content;
  return withoutTrailing.length === 0 ? [] : withoutTrailing.split("\n");
}

function findSequence(lines: string[], sequence: string[], start: number) {
  if (sequence.length === 0) return start;
  for (let index = start; index <= lines.length - sequence.length; index += 1) {
    if (sequence.every((line, offset) => lines[index + offset] === line)) return index;
  }
  return -1;
}

function safeRelativePath(path: string) {
  const normalized = normalize(path);
  if (
    !normalized
    || normalized === "."
    || isAbsolute(normalized)
    || normalized.split(/[\\/]/).includes("..")
  ) {
    throw new Error(`Unsafe repo file path: ${path}`);
  }
  return normalized;
}

function normalizeCheckCommand(check: string | PatchCheckCommand): PatchCheckCommand {
  return typeof check === "string" ? { command: check } : check;
}

function parseCommand(command: string) {
  const parts: string[] = [];
  let current = "";
  let quote: "\"" | "'" | null = null;
  let escaping = false;

  for (const char of command.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (escaping || quote) throw new Error(`Could not parse command: ${command}`);
  if (current) parts.push(current);
  if (parts.length === 0) throw new Error("Check command cannot be empty");
  return { command: parts[0], args: parts.slice(1) };
}

function runCommand(input: {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  displayCommand: string;
  input?: string;
}): Promise<CommandSummary> {
  const started = Date.now();

  return new Promise((resolve) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: safeExecutionEnv(),
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, input.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve(commandSummary({
        command: input.displayCommand,
        exitCode: 127,
        signal: null,
        durationMs: Date.now() - started,
        stdout,
        stderr: `${stderr}\n${error.message}`,
        timedOut,
      }));
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve(commandSummary({
        command: input.displayCommand,
        exitCode: timedOut ? 124 : code,
        signal,
        durationMs: Date.now() - started,
        stdout,
        stderr,
        timedOut,
      }));
    });

    if (input.input !== undefined) child.stdin.end(input.input);
    else child.stdin.end();
  });
}

function syntheticCommandSummary(input: {
  command: string;
  exitCode: number;
  stderr: string;
}): CommandSummary {
  return commandSummary({
    command: input.command,
    exitCode: input.exitCode,
    signal: null,
    durationMs: 0,
    stdout: "",
    stderr: input.stderr,
    timedOut: false,
  });
}

function isAllowedCheckCommand(command: string) {
  const name = basename(command);
  return command === process.execPath
    || ["node", "npm", "pnpm", "yarn", "bun", "npx"].includes(name);
}

function safeExecutionEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    CI: "1",
    NODE_ENV: "test",
  };
  for (const key of ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "SystemRoot", "ComSpec", "PATHEXT"]) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  return env;
}

function commandSummary(input: {
  command: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}): CommandSummary {
  const stdout = compactOutput(input.stdout);
  const stderr = compactOutput(input.stderr);
  const combined = compactOutput([stderr, stdout].filter(Boolean).join("\n"));
  const status = input.timedOut
    ? "timed out"
    : input.exitCode === 0
      ? "passed"
      : `failed with exit ${input.exitCode ?? "unknown"}`;

  return {
    command: input.command,
    exitCode: input.exitCode,
    signal: input.signal,
    durationMs: input.durationMs,
    summary: combined ? `${status}: ${combined}` : status,
    stdout,
    stderr,
    truncated: input.stdout.length > OUTPUT_LIMIT || input.stderr.length > OUTPUT_LIMIT,
  };
}

function compactOutput(output: string) {
  const stripped = output
    .replace(/\u001b\[[0-9;]*m/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(-8)
    .join("\n");

  if (stripped.length <= OUTPUT_LIMIT) return stripped;
  return `${stripped.slice(0, OUTPUT_LIMIT - 15)}\n...[truncated]`;
}
