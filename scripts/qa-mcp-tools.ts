#!/usr/bin/env node
import { exit, stderr, stdout } from "node:process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { DEMO_REPO_URL } from "../src/lib/scout-runner";

type TextContentResult = {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
};

const REQUIRED_TOOLS = [
  "scout_review",
  "scout_fix",
  "scout_score_patch",
  "scout_handoff",
  "scout_eval",
] as const;

const REQUIRED_RESOURCES = [
  "scout://demo/manifest",
  "scout://eval/seeded",
  "scout://handoff/demo",
] as const;

const REQUIRED_PROMPTS = [
  "scout-review-this-change",
  "scout-run-patch-tournament",
  "scout-handoff-to-codex",
] as const;

async function main() {
  const client = new Client({ name: "scout-qa-client", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [".next/scout-mcp/src/mcp/server.js"],
    cwd: process.cwd(),
    stderr: "pipe",
  });

  const stderrChunks: string[] = [];
  transport.stderr?.on("data", (chunk) => stderrChunks.push(String(chunk)));

  try {
    await client.connect(transport);

    const server = client.getServerVersion();
    assert(server?.name === "scout-local", "server name must be scout-local");

    const tools = await client.listTools();
    assertToolList(tools.tools);

    const resources = await client.listResources();
    const resourceUris = resources.resources.map((resource) => resource.uri);
    for (const uri of REQUIRED_RESOURCES) {
      assert(resourceUris.includes(uri), `resources/list missing ${uri}`);
    }

    const manifest = await client.readResource({ uri: "scout://demo/manifest" });
    const manifestJson = JSON.parse(readTextResource(manifest));
    assert(manifestJson.totalMistakes === 7, "demo manifest must include seven seeded mistakes");

    const prompts = await client.listPrompts();
    const promptNames = prompts.prompts.map((prompt) => prompt.name);
    for (const name of REQUIRED_PROMPTS) {
      assert(promptNames.includes(name), `prompts/list missing ${name}`);
    }

    const reviewPrompt = await client.getPrompt({
      name: "scout-review-this-change",
      arguments: { repo: DEMO_REPO_URL },
    });
    const promptText = reviewPrompt.messages
      .map((message) => message.content.type === "text" ? message.content.text : "")
      .join("\n");
    assert(promptText.includes("Call scout_review"), "review prompt must direct the client to call scout_review");

    const review = parseToolJson(await client.callTool({
      name: "scout_review",
      arguments: { repo: DEMO_REPO_URL },
    }));
    assert(review.mode === "demo", "scout_review must run in deterministic demo mode");
    const reviewedFindings = review.judgedFindings;
    const reviewEvalScore = review.evalScore as { caught?: unknown } | undefined;
    assert(Array.isArray(reviewedFindings) && reviewedFindings.length > 0, "scout_review must return judged findings");
    assert(reviewEvalScore?.caught === 7, "scout_review eval score must catch seven seeded mistakes");

    const finding = reviewedFindings[0];
    const fix = parseToolJson(await client.callTool({
      name: "scout_fix",
      arguments: { repo: DEMO_REPO_URL, finding, strategy: "robust" },
    }));
    const fixCandidates = fix.candidates;
    assert(Array.isArray(fixCandidates) && fixCandidates.length === 1, "scout_fix robust call must return one candidate");

    const candidate = fixCandidates[0];
    const score = parseToolJson(await client.callTool({
      name: "scout_score_patch",
      arguments: { repo: DEMO_REPO_URL, finding, candidate },
    }));
    assert(score.strategy === "robust", "scout_score_patch must preserve strategy");
    assert(typeof score.score === "number", "scout_score_patch must return numeric score");
    assert(Array.isArray(score.touchedFiles), "scout_score_patch must include touched files");

    const handoff = parseToolJson(await client.callTool({
      name: "scout_handoff",
      arguments: { repo: DEMO_REPO_URL, finding },
    }));
    assert(typeof handoff.artifact === "string" && handoff.artifact.includes("Scout Handoff"), "scout_handoff must return a handoff artifact");
    assert(typeof handoff.receiptId === "string" && handoff.receiptId.startsWith("receipt."), "scout_handoff must include a receipt id");

    const evalReport = parseToolJson(await client.callTool({
      name: "scout_eval",
      arguments: { repo: DEMO_REPO_URL },
    }));
    const evalMetrics = evalReport.metrics as { caughtSeeded?: unknown } | undefined;
    const evalGates = evalReport.gates;
    assert(evalMetrics?.caughtSeeded === 7, "scout_eval must catch seven seeded mistakes");
    assert(Array.isArray(evalGates), "scout_eval must return gates");
    assert(evalGates.every((gate) => isObject(gate) && gate.grade !== "fail"), "scout_eval must not return failing gates");

    const invalidRepo = await client.callTool({
      name: "scout_eval",
      arguments: { repo: "https://example.com/repo.git" },
    }) as TextContentResult;
    assert(invalidRepo.isError === true, "scout_eval must mark unsupported repos as tool errors");
    assert(textContent(invalidRepo).includes("currently supports"), "unsupported repo error should explain the demo boundary");

    stdout.write(JSON.stringify({
      ok: true,
      server,
      tools: tools.tools.map((tool) => tool.name),
      resources: resourceUris,
      prompts: promptNames,
      reviewedFindings: reviewedFindings.length,
      robustPatchScore: score.score,
      eval: evalReport.id,
    }, null, 2));
    stdout.write("\n");
  } finally {
    await client.close();
    if (stderrChunks.length > 0) {
      stderr.write(stderrChunks.join(""));
    }
  }
}

function assertToolList(tools: Array<{ name: string; inputSchema?: { type?: string } }>) {
  const names = tools.map((tool) => tool.name);
  for (const name of REQUIRED_TOOLS) {
    assert(names.includes(name), `tools/list missing ${name}`);
    const tool = tools.find((candidate) => candidate.name === name);
    assert(tool?.inputSchema?.type === "object", `${name} must expose an object input schema`);
  }
}

function parseToolJson(result: unknown): Record<string, unknown> {
  return JSON.parse(textContent(result as TextContentResult)) as Record<string, unknown>;
}

function textContent(result: TextContentResult) {
  assert(Array.isArray(result.content), "tool result must include content array");
  const textItems = result.content.filter((item) => item.type === "text" && typeof item.text === "string");
  assert(textItems.length > 0, "tool result must include text content");
  return textItems.map((item) => item.text).join("\n");
}

function readTextResource(result: unknown) {
  const resourceResult = result as { contents?: Array<{ text?: string }> };
  const text = resourceResult.contents?.[0]?.text;
  assert(typeof text === "string", "resource result must include text");
  return text;
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
