#!/usr/bin/env node
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { exit, stderr, stdout } from "node:process";
import { DEMO_REPO_URL } from "../src/lib/scout-runner";
import type { Finding, PatchCandidate } from "../src/lib/types";

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
};

type ToolListResult = {
  tools: Array<{
    name: string;
    description: string;
    inputSchema: {
      type: string;
      properties: Record<string, unknown>;
      required: string[];
    };
  }>;
};

type ToolEnvelope = {
  content: Array<{ type: string; text: string }>;
};

const REQUIRED_TOOLS = [
  "scout_review",
  "scout_fix",
  "scout_score_patch",
  "scout_handoff",
  "scout_eval",
] as const;

async function main() {
  const server = spawn(process.execPath, [".next/scout-mcp/src/mcp/server.js"], {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
  });
  const client = new JsonRpcLineClient(server);

  try {
    const initialized = await client.request("initialize", {});
    assertObject(initialized, "initialize result");
    assert((initialized.serverInfo as { name?: string }).name === "scout-local", "server name must be scout-local");
    client.notify("notifications/initialized", {});

    const listed = await client.request("tools/list", {}) as ToolListResult;
    assert(client.unexpectedResponses.length === 0, "server must not emit responses for JSON-RPC notifications");
    assertToolList(listed);

    const review = parseToolEnvelope(await client.request("tools/call", {
      name: "scout_review",
      arguments: { repo: DEMO_REPO_URL },
    }));
    assert(review.mode === "demo", "scout_review must run in deterministic demo mode");
    const reviewedFindings = review.judgedFindings;
    const reviewEvalScore = review.evalScore as { caught?: unknown } | undefined;
    assert(Array.isArray(reviewedFindings) && reviewedFindings.length > 0, "scout_review must return judged findings");
    assert(reviewEvalScore?.caught === 7, "scout_review eval score must catch seven seeded mistakes");

    const finding = reviewedFindings[0] as Finding;
    const fix = parseToolEnvelope(await client.request("tools/call", {
      name: "scout_fix",
      arguments: { repo: DEMO_REPO_URL, finding, strategy: "robust" },
    }));
    const fixCandidates = fix.candidates;
    assert(Array.isArray(fixCandidates) && fixCandidates.length === 1, "scout_fix robust call must return one candidate");

    const candidate = fixCandidates[0] as PatchCandidate;
    const score = parseToolEnvelope(await client.request("tools/call", {
      name: "scout_score_patch",
      arguments: { repo: DEMO_REPO_URL, finding, candidate },
    }));
    assert(score.strategy === "robust", "scout_score_patch must preserve strategy");
    assert(typeof score.score === "number", "scout_score_patch must return numeric score");
    assert(Array.isArray(score.touchedFiles), "scout_score_patch must include touched files");

    const handoff = parseToolEnvelope(await client.request("tools/call", {
      name: "scout_handoff",
      arguments: { repo: DEMO_REPO_URL, finding },
    }));
    assert(typeof handoff.artifact === "string" && handoff.artifact.includes("Scout Handoff"), "scout_handoff must return a handoff artifact");
    assert(typeof handoff.receiptId === "string" && handoff.receiptId.startsWith("receipt."), "scout_handoff must include a receipt id");

    const evalReport = parseToolEnvelope(await client.request("tools/call", {
      name: "scout_eval",
      arguments: { repo: DEMO_REPO_URL },
    }));
    const evalMetrics = evalReport.metrics as { caughtSeeded?: unknown } | undefined;
    const evalGates = evalReport.gates;
    assert(evalMetrics?.caughtSeeded === 7, "scout_eval must catch seven seeded mistakes");
    assert(Array.isArray(evalGates), "scout_eval must return gates");
    assert(evalGates.every((gate) => isObject(gate) && gate.grade !== "fail"), "scout_eval must not return failing gates");

    const invalidRepo = await client.requestRaw("tools/call", {
      name: "scout_eval",
      arguments: { repo: "https://example.com/repo.git" },
    });
    assert(Boolean(invalidRepo.error), "scout_eval must reject unsupported repos through JSON-RPC errors");
    assert(invalidRepo.error?.message.includes("currently supports"), "unsupported repo error should explain the demo boundary");

    stdout.write(JSON.stringify({
      ok: true,
      tools: listed.tools.map((tool) => tool.name),
      reviewedFindings: reviewedFindings.length,
      robustPatchScore: score.score,
      eval: evalReport.id,
    }, null, 2));
    stdout.write("\n");
  } finally {
    server.kill();
  }
}

class JsonRpcLineClient {
  private nextId = 1;
  private buffer = "";
  private pending = new Map<number, {
    resolve: (response: JsonRpcResponse) => void;
    reject: (error: Error) => void;
  }>();
  readonly unexpectedResponses: JsonRpcResponse[] = [];

  constructor(private readonly child: ChildProcessWithoutNullStreams) {
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.onData(chunk));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => stderr.write(chunk));
    child.on("exit", (code) => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error(`MCP server exited before responding with code ${code ?? "unknown"}`));
      }
      this.pending.clear();
    });
  }

  async request(method: string, params: unknown) {
    const response = await this.requestRaw(method, params);
    if (response.error) throw new Error(response.error.message);
    return response.result;
  }

  requestRaw(method: string, params: unknown): Promise<JsonRpcResponse> {
    const id = this.nextId;
    this.nextId += 1;
    const payload = { jsonrpc: "2.0", id, method, params };
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}`));
      }, 5000);
      this.pending.set(id, {
        resolve: (response) => {
          clearTimeout(timeout);
          resolve(response);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
    });
  }

  notify(method: string, params: unknown) {
    const payload = { jsonrpc: "2.0", method, params };
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  private onData(chunk: string) {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const response = JSON.parse(line) as JsonRpcResponse;
      if (typeof response.id !== "number") {
        this.unexpectedResponses.push(response);
        continue;
      }
      const pending = this.pending.get(response.id);
      if (!pending) continue;
      this.pending.delete(response.id);
      pending.resolve(response);
    }
  }
}

function assertToolList(result: ToolListResult) {
  assert(Array.isArray(result.tools), "tools/list must return a tools array");
  const names = result.tools.map((tool) => tool.name);
  for (const name of REQUIRED_TOOLS) {
    assert(names.includes(name), `tools/list missing ${name}`);
    const tool = result.tools.find((candidate) => candidate.name === name);
    assert(tool?.inputSchema.type === "object", `${name} must expose an object input schema`);
    assert(tool.inputSchema.required.includes("repo"), `${name} must require repo`);
  }
}

function parseToolEnvelope(result: unknown): Record<string, unknown> {
  assertObject(result, "tool result");
  const envelope = result as ToolEnvelope;
  assert(Array.isArray(envelope.content), "tool result must include content array");
  assert(envelope.content.length === 1, "tool result must include one text content block");
  assert(envelope.content[0].type === "text", "tool content must be text");
  return JSON.parse(envelope.content[0].text) as Record<string, unknown>;
}

function assertObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  assert(Boolean(value) && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  exit(1);
});
