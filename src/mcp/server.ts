#!/usr/bin/env node
import { stderr, stdout, argv, exit } from "node:process";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DEMO_REPO_URL, scoutFix, scoutHandoff, scoutReview } from "../lib/scout-runner";
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

async function main() {
  if (argv.includes("--smoke")) {
    await smoke();
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
