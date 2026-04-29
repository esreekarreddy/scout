#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { exit, stderr, stdout } from "node:process";

const CONFIGS = [
  "mcp/codex.local.example.json",
  "mcp/claude-code.local.example.json",
];

type ClientConfig = {
  mcpServers?: Record<string, {
    command?: unknown;
    args?: unknown;
    cwd?: unknown;
  }>;
};

function main() {
  for (const path of CONFIGS) {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as ClientConfig;
    const scout = parsed.mcpServers?.scout;
    assert(Boolean(scout), `${path} must define mcpServers.scout`);
    assert(scout?.command === "npm", `${path} must run npm`);
    assert(Array.isArray(scout?.args), `${path} args must be an array`);
    assert((scout?.args as unknown[]).join(" ") === "--silent run scout:mcp", `${path} must run scout:mcp silently`);
    assert(scout?.cwd === "<absolute path to openai-codex-hackathon>", `${path} must keep cwd as a placeholder`);
  }

  stdout.write(JSON.stringify({ ok: true, configs: CONFIGS }, null, 2));
  stdout.write("\n");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

try {
  main();
} catch (error) {
  stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  exit(1);
}
