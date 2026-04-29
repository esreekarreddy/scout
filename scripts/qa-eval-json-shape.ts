#!/usr/bin/env node
import { exit, stderr, stdout } from "node:process";
import { buildEvalReport } from "../src/lib/eval";
import { DEMO_REPO_URL, scoutFix, scoutReview } from "../src/lib/scout-runner";
import type { EvalGate, EvalReport } from "../src/lib/eval";
import type { Finding, PatchCandidate, PatchScore } from "../src/lib/types";

type JsonObject = Record<string, unknown>;

const REQUIRED_TOP_LEVEL_KEYS = [
  "id",
  "repo",
  "generatedAt",
  "thresholds",
  "manifest",
  "ledger",
  "metrics",
  "gates",
  "patchDiagnostics",
  "receipt",
  "trace",
  "traceChecksum",
  "checksum",
] as const;

const REQUIRED_TRACE_STAGES = ["review/scout", "judge", "fix", "score", "handoff"] as const;

async function main() {
  const review = await scoutReview(DEMO_REPO_URL);
  const patchCandidates = await buildPatchCandidates(review.judgedFindings);
  const report = buildEvalReport({
    repo: DEMO_REPO_URL,
    findings: review.findings,
    patchCandidates,
    manifest: review.manifest,
    generatedAt: "2026-04-29T00:00:00.000Z",
  });

  assertEvalReportShape(report);

  stdout.write(JSON.stringify({
    ok: true,
    report: report.id,
    checksum: report.checksum,
    seededRecall: `${report.metrics.caughtSeeded}/${report.metrics.totalSeeded}`,
    criticalRecall: report.metrics.criticalRecall,
    precision: report.metrics.precision,
    gates: report.gates.map((gate) => `${gate.id}:${gate.grade}`),
    winner: report.receipt.winningPatch?.candidateId,
  }, null, 2));
  stdout.write("\n");
}

async function buildPatchCandidates(findings: Finding[]): Promise<PatchCandidate[]> {
  const candidates: PatchCandidate[] = [];
  for (const finding of findings) {
    const fix = await scoutFix(DEMO_REPO_URL, finding);
    candidates.push(...fix.candidates);
  }
  return candidates;
}

function assertEvalReportShape(report: EvalReport) {
  const objectReport = report as unknown as JsonObject;
  for (const key of REQUIRED_TOP_LEVEL_KEYS) {
    assert(key in objectReport, `missing top-level key: ${key}`);
  }

  assert(/^eval\.[a-f0-9]{8}$/.test(report.id), "eval id must be stable eval.<hash> format");
  assert(report.repo === DEMO_REPO_URL, "eval repo must target the seeded demo");
  assert(report.generatedAt === "2026-04-29T00:00:00.000Z", "generatedAt override must be preserved");
  assert(report.checksum.length > 0, "checksum is required");

  assert(report.manifest.id === "scout.seeded-ai-code.v1", "unexpected manifest id");
  assert(report.manifest.totalMistakes === 7, "seeded manifest must keep seven mistakes");
  assert(report.manifest.seededMistakes.length === report.manifest.totalMistakes, "manifest total must match seeded mistakes");

  assert(report.ledger.caught === 7, "proof ledger must catch every seeded mistake");
  assert(report.ledger.missed === 0, "proof ledger must not miss seeded mistakes");
  assert(report.ledger.extra === 0, "proof ledger must not include extras in the deterministic fixture");
  assert(report.ledger.entries.length === 7, "proof ledger must keep one entry per seeded mistake");

  assert(report.metrics.totalSeeded === 7, "metrics must report seven seeded mistakes");
  assert(report.metrics.caughtSeeded === 7, "metrics must catch every seeded mistake");
  assert(report.metrics.missedSeeded === 0, "metrics must not miss seeded mistakes");
  assert(report.metrics.extraFindings === 0, "metrics must not count extra findings");
  assert(report.metrics.recall === 1, "seeded recall must be 100%");
  assert(report.metrics.criticalRecall === 1, "critical recall must be 100%");
  assert(report.metrics.precision === 1, "precision must be 100%");
  assert(report.metrics.f1 === 1, "F1 must be 100%");

  assertGate(report.gates, "seeded-recall", "pass");
  assertGate(report.gates, "critical-recall", "pass");
  assertGate(report.gates, "extra-findings", "pass");
  assertGate(report.gates, "patch-tournament", "pass");

  assert(report.patchDiagnostics.length > 0, "patch diagnostics must not be empty");
  assert(report.patchDiagnostics.some((diagnostic) => diagnostic.winner), "one patch diagnostic must be marked as winner");
  assert(report.patchDiagnostics.filter((diagnostic) => diagnostic.winner).length === 1, "exactly one patch diagnostic can win");
  assert(report.receipt.winningPatch !== undefined, "receipt must include a winning patch");
  assertPatchScoreShape(report.receipt.winningPatch);
  assert(report.receipt.ledger.checksum === report.ledger.checksum, "receipt ledger must match report ledger");
  assertTraceShape(report);
}

function assertGate(gates: EvalGate[], id: string, grade: EvalGate["grade"]) {
  const gate = gates.find((candidate) => candidate.id === id);
  assert(Boolean(gate), `missing eval gate: ${id}`);
  assert(gate?.grade === grade, `gate ${id} expected ${grade} but got ${gate?.grade ?? "missing"}`);
}

function assertPatchScoreShape(score: PatchScore | undefined) {
  assert(Boolean(score), "patch score is required");
  if (!score) return;
  assert(score.score >= 72, "winning patch must meet the default patch threshold");
  assert(score.rank === 1, "winning patch must be ranked first");
  assert(score.winner === true, "winning patch must be marked winner");
  assert(score.touchedFiles.length > 0, "winning patch must touch at least one file");
  assert(score.checksum.length > 0, "winning patch checksum is required");
}

function assertTraceShape(report: EvalReport) {
  assert(/^trace\.[a-f0-9]{8}$/.test(report.trace.id), "trace id must be stable trace.<hash> format");
  assert(report.trace.mode === "seeded-eval", "trace mode must be seeded-eval");
  assert(report.trace.repo === report.repo, "trace repo must match report repo");
  assert(report.trace.generatedAt === report.generatedAt, "trace generatedAt must match report generatedAt");
  assert(report.trace.receiptId === report.receipt.id, "trace receipt id must match receipt");
  assert(report.trace.checksum === report.traceChecksum, "trace checksum field must match trace.checksum");
  assert(report.trace.entries.length === REQUIRED_TRACE_STAGES.length, "trace must include the expected stage count");

  for (const [index, stage] of REQUIRED_TRACE_STAGES.entries()) {
    const entry = report.trace.entries[index];
    assert(entry.index === index + 1, `trace entry ${stage} must have sequential index`);
    assert(entry.stage === stage, `trace entry ${index + 1} expected stage ${stage}`);
    assert(entry.boundary.kind === "deterministic", `trace stage ${stage} must record deterministic boundary`);
    assert(entry.boundary.model === "none", `trace stage ${stage} must not imply model use`);
    assert(entry.receiptId === report.receipt.id, `trace stage ${stage} receipt id must match`);
    assert(entry.inputChecksum.length > 0, `trace stage ${stage} input checksum is required`);
    assert(entry.outputChecksum.length > 0, `trace stage ${stage} output checksum is required`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  exit(1);
});
