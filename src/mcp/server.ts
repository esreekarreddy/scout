#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { stderr, stdout, argv, exit } from "node:process";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DEMO_REPO_URL, scoutFix, scoutHandoff, scoutReview } from "../lib/scout-runner";
import { SCOUT_TARGET_REPO_URL } from "../lib/live-target";
import { scorePatchTournament } from "../lib/tournament";
import { createScoutMcpServer } from "./create-server";

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

async function smokeLive() {
  const review = await scoutReview(SCOUT_TARGET_REPO_URL, "fast");
  const finding = review.judgedFindings[0];
  if (!finding) throw new Error("live smoke failed: no judged finding");
  const fix = await scoutFix(SCOUT_TARGET_REPO_URL, finding, "conservative", "fast");
  stdout.write(JSON.stringify({
    ok: review.mode === "live" && review.findings.length > 0 && fix.candidates.length === 1,
    repo: SCOUT_TARGET_REPO_URL,
    mode: review.mode,
    rawFindings: review.findings.length,
    judgedFindings: review.judgedFindings.length,
    liveFixCandidates: fix.candidates.length,
    liveFixStrategy: fix.candidates[0]?.strategy,
    liveFixChars: fix.candidates[0]?.patch.length ?? 0,
    evidence: review.evidence,
  }, null, 2));
  stdout.write("\n");
}

function loadLocalEnv() {
  if (!existsSync(".env.local")) return;
  const envText = readFileSync(".env.local", "utf8");
  for (const line of envText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const raw = trimmed.slice(index + 1).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key) || process.env[key]) continue;
    process.env[key] = raw.replace(/^['"]|['"]$/g, "");
  }
}

async function main() {
  loadLocalEnv();

  if (argv.includes("--smoke")) {
    await smoke();
    return;
  }

  if (argv.includes("--smoke-live")) {
    await smokeLive();
    return;
  }

  const server = createScoutMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  exit(1);
});
