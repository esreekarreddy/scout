import { DEMO_REPO_URL } from "../demo-fixtures";
import { judgeFindings } from "../judge";
import {
  SEEDED_BENCHMARK_MANIFEST,
  buildProofLedger,
  buildTournamentReceipt,
  proofHash,
  scorePatchTournament,
} from "../tournament";
import { buildEvalTrace } from "../trace";
import type { EvalTrace } from "../trace";
import type { PatchExecutionResult } from "../patch-executor";
import type {
  Aspect,
  BenchmarkManifest,
  Finding,
  PatchCandidate,
  PatchScore,
  ProofLedger,
  SeededMistake,
  Severity,
  TournamentReceipt,
} from "../types";

export type EvalGrade = "pass" | "warn" | "fail";

export interface EvalThresholds {
  minRecall: number;
  minCriticalRecall: number;
  maxExtraFindings: number;
  minPatchScore: number;
}

export interface EvalBenchmarkMetrics {
  manifestId: string;
  manifestChecksum: string;
  totalSeeded: number;
  caughtSeeded: number;
  missedSeeded: number;
  extraFindings: number;
  recall: number;
  precision: number;
  f1: number;
  criticalRecall: number;
  warningRecall: number;
  meanCaughtConfidence: number;
  verdicts: Record<"confirmed" | "likely" | "speculative", number>;
  byAspect: Record<Aspect, EvalBucketMetrics>;
  bySeverity: Record<Severity, EvalBucketMetrics>;
}

export interface EvalBucketMetrics {
  total: number;
  caught: number;
  missed: number;
  recall: number;
}

export interface EvalGate {
  id: string;
  label: string;
  grade: EvalGrade;
  observed: number;
  expected: number;
  detail: string;
}

export interface PatchTournamentDiagnostic {
  candidateId: string;
  rank: number;
  winner: boolean;
  score: number;
  strategy: string;
  touchedFiles: string[];
  testFiles: string[];
  changedLines: number;
  addedLines: number;
  removedLines: number;
  riskFlags: string[];
  strengths: string[];
  weaknesses: string[];
  execution?: PatchTournamentExecutionDiagnostic;
  checksum: string;
}

export interface PatchTournamentExecutionDiagnostic {
  eligible: boolean;
  disqualifiedReason?: string;
  apply: CompactCommandSummary;
  checks: CompactCommandSummary[];
}

export interface CompactCommandSummary {
  command: string;
  exitCode: number | null;
  durationMs: number;
  summary: string;
}

export interface EvalReport {
  id: string;
  repo: string;
  generatedAt: string;
  thresholds: EvalThresholds;
  manifest: BenchmarkManifest;
  ledger: ProofLedger;
  metrics: EvalBenchmarkMetrics;
  gates: EvalGate[];
  patchDiagnostics: PatchTournamentDiagnostic[];
  receipt: TournamentReceipt;
  trace: EvalTrace;
  traceChecksum: string;
  checksum: string;
}

export const DEFAULT_EVAL_THRESHOLDS: EvalThresholds = {
  minRecall: 0.85,
  minCriticalRecall: 1,
  maxExtraFindings: 3,
  minPatchScore: 72,
};

const ASPECTS: Aspect[] = ["hallucination", "spec-drift", "test-theater"];
const SEVERITIES: Severity[] = ["critical", "warning", "info"];

export function buildEvalReport(input: {
  repo?: string;
  findings: Finding[];
  patchCandidates?: PatchCandidate[];
  patchExecutions?: Record<string, PatchExecutionResult>;
  manifest?: BenchmarkManifest;
  thresholds?: Partial<EvalThresholds>;
  generatedAt?: string;
}): EvalReport {
  const manifest = input.manifest ?? SEEDED_BENCHMARK_MANIFEST;
  const repo = input.repo ?? manifest.repo ?? DEMO_REPO_URL;
  const generatedAt = input.generatedAt ?? new Date(0).toISOString();
  const thresholds = { ...DEFAULT_EVAL_THRESHOLDS, ...input.thresholds };
  const ledger = buildProofLedger(input.findings, manifest);
  const patchScores = scorePatchTournament(input.patchCandidates ?? [], input.findings, input.patchExecutions);
  const candidatesById = new Map((input.patchCandidates ?? []).map((candidate) => [candidate.id, candidate]));
  const receipt = buildTournamentReceipt({
    repo,
    findings: input.findings,
    patchCandidates: input.patchCandidates,
    patchExecutions: input.patchExecutions,
    manifest,
  });
  const metrics = buildBenchmarkMetrics({
    findings: input.findings,
    manifest,
    ledger,
  });
  const gates = buildEvalGates(metrics, patchScores, thresholds);
  const patchDiagnostics = patchScores.map((score) =>
    buildPatchDiagnostic(score, candidatesById.get(score.candidateId), input.patchExecutions?.[score.candidateId])
  );
  const trace = buildEvalTrace({
    repo,
    generatedAt,
    manifest,
    findings: input.findings,
    patchCandidates: input.patchCandidates ?? [],
    ledger,
    metrics,
    gates,
    patchDiagnostics,
    receipt,
  });
  const unsigned = {
    repo,
    generatedAt,
    thresholds,
    manifest,
    ledger,
    metrics,
    gates,
    patchDiagnostics,
    receiptId: receipt.id,
    receiptChecksum: receipt.checksum,
    traceId: trace.id,
    traceChecksum: trace.checksum,
  };
  const id = `eval.${proofHash(unsigned).slice(0, 12)}`;

  return {
    id,
    repo,
    generatedAt,
    thresholds,
    manifest,
    ledger,
    metrics,
    gates,
    patchDiagnostics,
    receipt,
    trace,
    traceChecksum: trace.checksum,
    checksum: proofHash({ id, ...unsigned }),
  };
}

export function buildBenchmarkMetrics(input: {
  findings: Finding[];
  manifest?: BenchmarkManifest;
  ledger?: ProofLedger;
}): EvalBenchmarkMetrics {
  const manifest = input.manifest ?? SEEDED_BENCHMARK_MANIFEST;
  const ledger = input.ledger ?? buildProofLedger(input.findings, manifest);
  const judged = judgeFindings(input.findings);
  const seededById = new Map(manifest.seededMistakes.map((seed) => [seed.id, seed]));
  const caughtSeedIds = new Set(
    ledger.entries
      .filter((entry) => entry.status === "caught" && seededById.has(entry.seedId))
      .map((entry) => entry.seedId),
  );
  const caughtSeeded = caughtSeedIds.size;
  const missedSeeded = manifest.totalMistakes - caughtSeeded;
  const precisionDenominator = caughtSeeded + ledger.extra;

  return {
    manifestId: manifest.id,
    manifestChecksum: manifest.checksum,
    totalSeeded: manifest.totalMistakes,
    caughtSeeded,
    missedSeeded,
    extraFindings: ledger.extra,
    recall: ratio(caughtSeeded, manifest.totalMistakes),
    precision: ratio(caughtSeeded, precisionDenominator),
    f1: f1(caughtSeeded, manifest.totalMistakes, precisionDenominator),
    criticalRecall: recallFor(manifest.seededMistakes, caughtSeedIds, "severity", "critical"),
    warningRecall: recallFor(manifest.seededMistakes, caughtSeedIds, "severity", "warning"),
    meanCaughtConfidence: mean(
      ledger.entries
        .filter((entry) => entry.status === "caught")
        .map((entry) => entry.confidence),
    ),
    verdicts: {
      confirmed: judged.filter((finding) => finding.verdict === "confirmed").length,
      likely: judged.filter((finding) => finding.verdict === "likely").length,
      speculative: judged.filter((finding) => finding.verdict === "speculative").length,
    },
    byAspect: bucketMetrics(manifest.seededMistakes, caughtSeedIds, "aspect", ASPECTS),
    bySeverity: bucketMetrics(manifest.seededMistakes, caughtSeedIds, "severity", SEVERITIES),
  };
}

export function formatEvalReportMarkdown(report: EvalReport): string {
  const metricRows = [
    ["Seeded recall", percent(report.metrics.recall), `${report.metrics.caughtSeeded}/${report.metrics.totalSeeded}`],
    ["Critical recall", percent(report.metrics.criticalRecall), thresholdDetail(report.thresholds.minCriticalRecall)],
    ["Precision", percent(report.metrics.precision), `${report.metrics.extraFindings} extra findings`],
    ["F1", percent(report.metrics.f1), "Harmonic mean of recall and precision"],
    ["Mean caught confidence", report.metrics.meanCaughtConfidence.toString(), "0-100"],
  ];
  const gateRows = report.gates.map((gate) => [
    gate.grade.toUpperCase(),
    gate.label,
    gate.observed.toString(),
    gate.expected.toString(),
    gate.detail,
  ]);
  const patchRows = report.patchDiagnostics.length > 0
    ? report.patchDiagnostics.map((diagnostic) => [
        diagnostic.winner ? "yes" : "no",
        diagnostic.rank.toString(),
        diagnostic.candidateId,
        diagnostic.score.toString(),
        diagnostic.changedLines.toString(),
        diagnostic.riskFlags.length > 0 ? diagnostic.riskFlags.join(", ") : "none",
        formatExecutionSummary(diagnostic.execution),
      ])
    : [["-", "-", "No patch candidates supplied", "-", "-", "-", "-"]];

  return [
    `# Scout Eval Report`,
    "",
    `Repo: ${report.repo}`,
    `Eval: ${report.id}`,
    `Checksum: ${report.checksum}`,
    `Manifest: ${report.manifest.id} (${report.manifest.checksum})`,
    `Receipt: ${report.receipt.id} (${report.receipt.checksum})`,
    `Trace: ${report.trace.id} (${report.traceChecksum})`,
    "",
    "## Benchmark Metrics",
    markdownTable(["Metric", "Value", "Detail"], metricRows),
    "",
    "## Gates",
    markdownTable(["Grade", "Gate", "Observed", "Expected", "Detail"], gateRows),
    "",
    "## Aspect Recall",
    markdownTable(["Aspect", "Caught", "Total", "Recall"], bucketRows(report.metrics.byAspect)),
    "",
    "## Severity Recall",
    markdownTable(["Severity", "Caught", "Total", "Recall"], bucketRows(report.metrics.bySeverity)),
    "",
    "## Patch Tournament Diagnostics",
    markdownTable(["Winner", "Rank", "Candidate", "Score", "Changed Lines", "Risk Flags", "Execution"], patchRows),
  ].join("\n");
}

function buildEvalGates(
  metrics: EvalBenchmarkMetrics,
  patchScores: PatchScore[],
  thresholds: EvalThresholds,
): EvalGate[] {
  const winningPatch = patchScores.find((score) => score.winner);
  const bestPatchScore = winningPatch?.score ?? 0;
  return [
    {
      id: "seeded-recall",
      label: "Seeded benchmark recall",
      grade: metrics.recall >= thresholds.minRecall ? "pass" : "fail",
      observed: metrics.recall,
      expected: thresholds.minRecall,
      detail: `${metrics.caughtSeeded}/${metrics.totalSeeded} seeded mistakes caught`,
    },
    {
      id: "critical-recall",
      label: "Critical finding recall",
      grade: metrics.criticalRecall >= thresholds.minCriticalRecall ? "pass" : "fail",
      observed: metrics.criticalRecall,
      expected: thresholds.minCriticalRecall,
      detail: "Critical seeded mistakes should not be missed.",
    },
    {
      id: "extra-findings",
      label: "Extra finding budget",
      grade: metrics.extraFindings <= thresholds.maxExtraFindings ? "pass" : "warn",
      observed: metrics.extraFindings,
      expected: thresholds.maxExtraFindings,
      detail: "Extras are tracked separately and excluded from seeded recall.",
    },
    {
      id: "patch-tournament",
      label: "Patch tournament winner",
      grade: patchScores.length === 0
        ? "warn"
        : winningPatch && bestPatchScore >= thresholds.minPatchScore
          ? "pass"
          : "fail",
      observed: bestPatchScore,
      expected: thresholds.minPatchScore,
      detail: patchScores.length === 0
        ? "No patch candidates supplied."
        : winningPatch
          ? `${winningPatch.candidateId} is ranked first at ${bestPatchScore}/100.`
          : "All patch candidates were disqualified or scored below the executable threshold.",
    },
  ];
}

function buildPatchDiagnostic(
  score: PatchScore,
  candidate?: PatchCandidate,
  execution?: PatchExecutionResult,
): PatchTournamentDiagnostic {
  const stats = diffStats(candidate?.patch ?? "");
  const riskFlags = patchRiskFlags(score, candidate?.patch ?? "");
  const executionDiagnostic = execution ? compactExecution(execution) : undefined;
  const strengths = [
    score.breakdown.targetsFinding >= 22 ? "targets finding file" : "",
    score.breakdown.addsProof >= 12 ? "adds executable proof" : "",
    execution?.eligible ? "passes executable checks" : "",
    score.breakdown.scopeControl >= 14 ? "keeps scope controlled" : "",
  ].filter(Boolean);
  const weaknesses = [
    score.breakdown.targetsFinding < 22 ? "weak target fit" : "",
    score.breakdown.addsProof === 0 ? "no test proof" : "",
    execution && !execution.eligible ? `disqualified: ${execution.disqualifiedReason ?? "missing-execution"}` : "",
    score.breakdown.regressionRisk < 14 ? "regression risk penalty" : "",
    riskFlags.length > 0 ? "manual review required" : "",
  ].filter(Boolean);

  return {
    candidateId: score.candidateId,
    rank: score.rank,
    winner: score.winner,
    score: score.score,
    strategy: score.strategy,
    touchedFiles: score.touchedFiles,
    testFiles: score.testFiles,
    ...stats,
    riskFlags,
    strengths,
    weaknesses,
    execution: executionDiagnostic,
    checksum: proofHash({ score, stats, riskFlags, strengths, weaknesses, execution: executionDiagnostic }),
  };
}

function compactExecution(execution: PatchExecutionResult): PatchTournamentExecutionDiagnostic {
  return {
    eligible: execution.eligible,
    disqualifiedReason: execution.disqualifiedReason,
    apply: compactCommand(execution.apply),
    checks: execution.checks.map(compactCommand),
  };
}

function compactCommand(command: PatchExecutionResult["apply"]): CompactCommandSummary {
  return {
    command: command.command,
    exitCode: command.exitCode,
    durationMs: command.durationMs,
    summary: command.summary,
  };
}

function patchRiskFlags(score: PatchScore, patch: string): string[] {
  const normalizedPatch = patch.toLowerCase();
  const flags: string[] = [];
  if (score.testFiles.length === 0) flags.push("no-test-proof");
  if (score.breakdown.regressionRisk < 14) flags.push("regression-risk");
  if (score.touchedFiles.length > 3) flags.push("wide-scope");
  if (score.breakdown.targetsFinding < 22) flags.push("weak-target-fit");
  if (normalizedPatch.includes("dev-secret")) flags.push("hardcoded-dev-secret");
  if (normalizedPatch.includes("jwt.decode")) flags.push("decode-without-verification");
  if (normalizedPatch.includes(" as any")) flags.push("unsafe-any");
  return flags;
}

function diffStats(patch: string) {
  let addedLines = 0;
  let removedLines = 0;

  for (const line of patch.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) addedLines += 1;
    if (line.startsWith("-")) removedLines += 1;
  }

  return {
    changedLines: addedLines + removedLines,
    addedLines,
    removedLines,
  };
}

function bucketMetrics<T extends Aspect | Severity>(
  seeds: SeededMistake[],
  caughtSeedIds: Set<string>,
  field: "aspect" | "severity",
  values: T[],
): Record<T, EvalBucketMetrics> {
  return Object.fromEntries(values.map((value) => {
    const seedsInBucket = seeds.filter((seed) => seed[field] === value);
    const caught = seedsInBucket.filter((seed) => caughtSeedIds.has(seed.id)).length;
    return [value, {
      total: seedsInBucket.length,
      caught,
      missed: seedsInBucket.length - caught,
      recall: ratio(caught, seedsInBucket.length),
    }];
  })) as Record<T, EvalBucketMetrics>;
}

function recallFor(
  seeds: SeededMistake[],
  caughtSeedIds: Set<string>,
  field: "aspect" | "severity",
  value: Aspect | Severity,
) {
  const seedsInBucket = seeds.filter((seed) => seed[field] === value);
  return ratio(seedsInBucket.filter((seed) => caughtSeedIds.has(seed.id)).length, seedsInBucket.length);
}

function bucketRows<T extends string>(buckets: Record<T, EvalBucketMetrics>) {
  return Object.entries(buckets).map(([label, metrics]) => {
    const typedMetrics = metrics as EvalBucketMetrics;
    return [
      label,
      typedMetrics.caught.toString(),
      typedMetrics.total.toString(),
      percent(typedMetrics.recall),
    ];
  });
}

function markdownTable(headers: string[], rows: string[][]) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`),
  ].join("\n");
}

function escapeCell(value: string) {
  return value.replace(/\|/g, "\\|");
}

function formatExecutionSummary(execution?: PatchTournamentExecutionDiagnostic) {
  if (!execution) return "not run";
  if (!execution.eligible) return execution.disqualifiedReason ?? "disqualified";
  if (execution.checks.length === 0) return "applied";
  return `${execution.checks.filter((check) => check.exitCode === 0).length}/${execution.checks.length} checks passed`;
}

function ratio(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return round(numerator / denominator, 4);
}

function f1(caught: number, totalSeeded: number, precisionDenominator: number) {
  const recall = ratio(caught, totalSeeded);
  const precision = ratio(caught, precisionDenominator);
  if (recall + precision === 0) return 0;
  return round((2 * recall * precision) / (recall + precision), 4);
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length, 2);
}

function percent(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}

function thresholdDetail(value: number) {
  return `threshold ${percent(value)}`;
}

function round(value: number, places: number) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
