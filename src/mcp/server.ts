#!/usr/bin/env node
import { stdin, stdout, stderr, argv, exit } from "node:process";
import { buildEvalReport } from "../lib/eval";
import { scoutFix, scoutHandoff, scoutReview, scoutScorePatch, DEMO_REPO_URL } from "../lib/scout-runner";
import { scorePatchTournament } from "../lib/tournament";
import type { Finding, FixStrategy, PatchCandidate } from "../lib/types";

type JsonRpcRequest = {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method?: string;
  params?: unknown;
};

type ToolCallParams = {
  name?: string;
  arguments?: Record<string, unknown>;
};

const TOOLS = [
  {
    name: "scout_review",
    description: "Review the seeded demo repo with Scout and return judged findings, eval score, and proof ledger.",
    inputSchema: {
      type: "object",
      properties: { repo: { type: "string" } },
      required: ["repo"],
    },
  },
  {
    name: "scout_fix",
    description: "Generate deterministic Scout patch candidates for a finding in the seeded demo.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string" },
        finding: { type: "object" },
        strategy: { type: "string", enum: ["conservative", "idiomatic", "robust"] },
      },
      required: ["repo", "finding"],
    },
  },
  {
    name: "scout_score_patch",
    description: "Score one patch candidate with deterministic Scout gates. Rank is assigned by tournament callers.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string" },
        finding: { type: "object" },
        candidate: { type: "object" },
      },
      required: ["repo", "finding", "candidate"],
    },
  },
  {
    name: "scout_handoff",
    description: "Create a coding-agent handoff artifact with proof ledger and local tool boundary notes.",
    inputSchema: {
      type: "object",
      properties: { repo: { type: "string" }, finding: { type: "object" } },
      required: ["repo", "finding"],
    },
  },
  {
    name: "scout_eval",
    description: "Run Scout's deterministic seeded eval suite and return production-readiness gates.",
    inputSchema: {
      type: "object",
      properties: { repo: { type: "string" } },
      required: ["repo"],
    },
  },
];

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asFinding(value: unknown): Finding {
  const finding = asObject(value);
  if (!finding.id || !finding.aspect || !finding.file || !finding.title) {
    throw new Error("finding must include id, aspect, file, and title");
  }
  return finding as unknown as Finding;
}

function asStrategy(value: unknown): FixStrategy | undefined {
  if (value === "conservative" || value === "idiomatic" || value === "robust") return value;
  if (value === undefined) return undefined;
  throw new Error("strategy must be conservative, idiomatic, or robust");
}

function asCandidate(value: unknown): Pick<PatchCandidate, "strategy" | "patch"> {
  const candidate = asObject(value);
  const strategy = asStrategy(candidate.strategy);
  const patch = asString(candidate.patch);
  if (!strategy || !patch) throw new Error("candidate must include strategy and patch");
  return { strategy, patch };
}

async function callScoutTool(name: string, params: Record<string, unknown>) {
  const repo = asString(params.repo);
  if (!repo) throw new Error("repo is required");

  if (name === "scout_review") return scoutReview(repo);
  if (name === "scout_fix") return scoutFix(repo, asFinding(params.finding), asStrategy(params.strategy));
  if (name === "scout_score_patch") return scoutScorePatch(repo, asFinding(params.finding), asCandidate(params.candidate));
  if (name === "scout_handoff") return scoutHandoff(repo, asFinding(params.finding));
  if (name === "scout_eval") {
    if (repo !== DEMO_REPO_URL) {
      throw new Error("scout_eval currently supports demo://ai-written-code-seed only");
    }
    const review = await scoutReview(repo);
    const patchCandidates = (await Promise.all(review.judgedFindings.map((finding) => scoutFix(repo, finding))))
      .flatMap((fix) => fix.candidates);
    return buildEvalReport({
      repo,
      findings: review.findings,
      patchCandidates,
      manifest: review.manifest,
    });
  }
  throw new Error(`Unknown tool: ${name}`);
}

function mcpContent(result: unknown) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

async function handleRequest(req: JsonRpcRequest) {
  const params = asObject(req.params);

  if (req.method === "initialize") {
    return {
      protocolVersion: "2024-11-05",
      serverInfo: { name: "scout-local", version: "0.1.0" },
      capabilities: { tools: {} },
    };
  }

  if (req.method?.startsWith("notifications/")) {
    return null;
  }

  if (req.method === "tools/list") {
    return { tools: TOOLS };
  }

  if (req.method === "tools/call") {
    const call = params as ToolCallParams;
    const result = await callScoutTool(asString(call.name), asObject(call.arguments));
    return mcpContent(result);
  }

  if (req.method?.startsWith("scout_")) {
    return callScoutTool(req.method, params);
  }

  throw new Error(`Unknown method: ${req.method ?? "missing"}`);
}

function writeResponse(id: JsonRpcRequest["id"], result: unknown) {
  stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: id ?? null, result })}\n`);
}

function writeError(id: JsonRpcRequest["id"], error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code: -32000, message } })}\n`);
}

async function handleLine(line: string) {
  if (!line.trim()) return;
  let req: JsonRpcRequest;
  try {
    req = JSON.parse(line);
  } catch (error) {
    writeError(null, error);
    return;
  }

  try {
    const result = await handleRequest(req);
    if (req.id !== undefined) writeResponse(req.id, result);
  } catch (error) {
    if (req.id !== undefined) writeError(req.id, error);
  }
}

async function smoke() {
  const review = await scoutReview(DEMO_REPO_URL);
  const finding = review.judgedFindings.find((item) =>
    `${item.title} ${item.description}`.toLowerCase().includes("email")
    || `${item.title} ${item.description}`.toLowerCase().includes("privacy"),
  ) ?? review.judgedFindings[0];
  if (!finding) throw new Error("smoke failed: no judged finding");
  const fix = await scoutFix(DEMO_REPO_URL, finding);
  const scores = scorePatchTournament(fix.candidates, [finding]);
  const best = [...scores].sort((a, b) => b.score - a.score)[0];
  const handoff = await scoutHandoff(DEMO_REPO_URL, finding);

  stdout.write(JSON.stringify({
    ok: review.judgedFindings.length > 0 && fix.candidates.length > 0 && Boolean(best) && Boolean(handoff.artifact),
    repo: DEMO_REPO_URL,
    findings: review.judgedFindings.length,
    evalScore: review.evalScore,
    bestPatch: best,
    handoffReceipt: handoff.receiptId,
  }, null, 2));
  stdout.write("\n");
}

if (argv.includes("--smoke")) {
  smoke().catch((error) => {
    stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    exit(1);
  });
} else {
  stdin.setEncoding("utf8");
  let buffer = "";
  stdin.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) void handleLine(line);
  });
  stdin.on("end", () => {
    if (buffer.trim()) void handleLine(buffer);
  });
}
