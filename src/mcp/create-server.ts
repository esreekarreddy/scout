import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildEvalReport } from "../lib/eval";
import { DEMO_REPO_URL, scoutFix, scoutHandoff, scoutReview, scoutScorePatch } from "../lib/scout-runner";
import { SEEDED_BENCHMARK_MANIFEST } from "../lib/tournament";
import type { Finding, FixStrategy, PatchCandidate } from "../lib/types";

type TextResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export const SCOUT_MCP_SERVER_NAME = "scout-local";
export const SCOUT_MCP_SERVER_VERSION = "0.2.0";

export const SCOUT_MCP_TOOLS = [
  "scout_review",
  "scout_fix",
  "scout_score_patch",
  "scout_handoff",
  "scout_eval",
] as const;

export const SCOUT_MCP_RESOURCES = [
  "scout://demo/manifest",
  "scout://eval/seeded",
  "scout://handoff/demo",
] as const;

export const SCOUT_MCP_PROMPTS = [
  "scout-review-this-change",
  "scout-run-patch-tournament",
  "scout-handoff-to-codex",
] as const;

function textResult(value: unknown): TextResult {
  return {
    content: [
      {
        type: "text",
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function toolError(message: string): TextResult {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}

function safeTool<TArgs>(handler: (args: TArgs) => Promise<unknown>) {
  return async (args: TArgs) => {
    try {
      return textResult(await handler(args));
    } catch (error) {
      return toolError(error instanceof Error ? error.message : String(error));
    }
  };
}

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

export async function runScoutEval(repo: string) {
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

function buildHandoffPrompt(repo: string) {
  return [
    "Use Scout before trusting AI-written code.",
    "",
    `Repo: ${repo}`,
    "",
    "Run the Scout MCP loop:",
    "",
    "1. Call scout_review for the repo.",
    "2. Pick a confirmed finding with file and line evidence.",
    "3. Call scout_fix with conservative, idiomatic, and robust strategies.",
    "4. Call scout_score_patch for each candidate.",
    "5. Use scout_handoff to produce the final Codex-ready repair brief.",
    "",
    "Do not claim a patch is safe unless Scout's receipt and execution gate support it.",
  ].join("\n");
}

function registerScoutTools(server: McpServer) {
  server.registerTool(
    "scout_review",
    {
      title: "Scout Review",
      description: "Review the seeded demo repo with Scout and return judged findings, eval score, and proof ledger.",
      inputSchema: {
        repo: z.string().describe("Repository URL or demo://ai-written-code-seed"),
      },
    },
    safeTool(async ({ repo }) => scoutReview(repo)),
  );

  server.registerTool(
    "scout_fix",
    {
      title: "Scout Fix",
      description: "Generate deterministic Scout patch candidates for a finding in the seeded demo.",
      inputSchema: {
        repo: z.string().describe("Repository URL or demo://ai-written-code-seed"),
        finding: z.any().describe("Finding object returned by scout_review"),
        strategy: z.enum(["conservative", "idiomatic", "robust"]).optional().describe("Optional repair strategy"),
      },
    },
    safeTool(async ({ repo, finding, strategy }) => scoutFix(repo, asFinding(finding), asStrategy(strategy))),
  );

  server.registerTool(
    "scout_score_patch",
    {
      title: "Scout Score Patch",
      description: "Score one patch candidate with deterministic Scout gates. Rank is assigned by tournament callers.",
      inputSchema: {
        repo: z.string().describe("Repository URL or demo://ai-written-code-seed"),
        finding: z.any().describe("Finding object returned by scout_review"),
        candidate: z.any().describe("Patch candidate returned by scout_fix"),
      },
    },
    safeTool(async ({ repo, finding, candidate }) => scoutScorePatch(repo, asFinding(finding), asCandidate(candidate))),
  );

  server.registerTool(
    "scout_handoff",
    {
      title: "Scout Handoff",
      description: "Create a coding-agent handoff artifact with proof ledger and local tool boundary notes.",
      inputSchema: {
        repo: z.string().describe("Repository URL or demo://ai-written-code-seed"),
        finding: z.any().describe("Finding object returned by scout_review"),
      },
    },
    safeTool(async ({ repo, finding }) => scoutHandoff(repo, asFinding(finding))),
  );

  server.registerTool(
    "scout_eval",
    {
      title: "Scout Eval",
      description: "Run Scout's deterministic seeded eval suite and return production-readiness gates.",
      inputSchema: {
        repo: z.string().describe("Currently supports demo://ai-written-code-seed"),
      },
    },
    safeTool(async ({ repo }) => runScoutEval(repo)),
  );
}

function registerScoutResources(server: McpServer) {
  server.registerResource(
    "scout_demo_manifest",
    "scout://demo/manifest",
    {
      title: "Scout Seeded Demo Manifest",
      description: "Known planted AI-code mistakes for the deterministic Scout benchmark.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(SEEDED_BENCHMARK_MANIFEST, null, 2),
      }],
    }),
  );

  server.registerResource(
    "scout_seeded_eval",
    "scout://eval/seeded",
    {
      title: "Scout Seeded Eval",
      description: "Deterministic eval report for the seeded Scout benchmark.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(await runScoutEval(DEMO_REPO_URL), null, 2),
      }],
    }),
  );

  server.registerResource(
    "scout_demo_handoff_prompt",
    "scout://handoff/demo",
    {
      title: "Scout Demo Handoff Prompt",
      description: "A Codex-ready prompt for running Scout as an MCP verification layer.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        mimeType: "text/markdown",
        text: buildHandoffPrompt(DEMO_REPO_URL),
      }],
    }),
  );
}

function registerScoutPrompts(server: McpServer) {
  server.registerPrompt(
    "scout-review-this-change",
    {
      title: "Scout Review This Change",
      description: "Ask Codex or another MCP client to run Scout review before trusting AI-written code.",
      argsSchema: {
        repo: z.string().optional().describe("Repository URL. Defaults to demo://ai-written-code-seed."),
      },
    },
    async ({ repo }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: [
            "Run Scout on this repository before making or trusting code changes.",
            "",
            `Repository: ${repo || DEMO_REPO_URL}`,
            "",
            "Call scout_review. Report confirmed findings first, include file and line evidence, and separate deterministic proof from model judgment.",
          ].join("\n"),
        },
      }],
    }),
  );

  server.registerPrompt(
    "scout-run-patch-tournament",
    {
      title: "Scout Run Patch Tournament",
      description: "Ask an MCP client to generate and score competing repairs for a Scout finding.",
      argsSchema: {
        repo: z.string().optional().describe("Repository URL. Defaults to demo://ai-written-code-seed."),
        finding_summary: z.string().optional().describe("Short finding summary to help the client choose the right finding."),
      },
    },
    async ({ repo, finding_summary }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: [
            "Use Scout to run a patch tournament.",
            "",
            `Repository: ${repo || DEMO_REPO_URL}`,
            finding_summary ? `Target finding: ${finding_summary}` : "Target finding: choose the highest-confidence confirmed issue from scout_review.",
            "",
            "Call scout_review, scout_fix for conservative, idiomatic, and robust strategies, then scout_score_patch for each candidate. Do not recommend a patch that Scout marks as ineligible.",
          ].join("\n"),
        },
      }],
    }),
  );

  server.registerPrompt(
    "scout-handoff-to-codex",
    {
      title: "Scout Handoff To Codex",
      description: "Create a repair handoff that Codex can apply after Scout verification.",
      argsSchema: {
        repo: z.string().optional().describe("Repository URL. Defaults to demo://ai-written-code-seed."),
      },
    },
    async ({ repo }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: buildHandoffPrompt(repo || DEMO_REPO_URL),
        },
      }],
    }),
  );
}

export function createScoutMcpServer() {
  const server = new McpServer({
    name: SCOUT_MCP_SERVER_NAME,
    version: SCOUT_MCP_SERVER_VERSION,
  });

  registerScoutTools(server);
  registerScoutResources(server);
  registerScoutPrompts(server);

  return server;
}
