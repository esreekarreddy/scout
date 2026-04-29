import { proofHash } from "./tournament";
import type {
  BenchmarkManifest,
  Finding,
  PatchCandidate,
  ProofLedger,
  TournamentReceipt,
} from "./types";

export type TraceStage = "review/scout" | "judge" | "fix" | "score" | "handoff";
export type TraceBoundaryKind = "deterministic" | "model";

export interface TraceBoundary {
  kind: TraceBoundaryKind;
  source: string;
  model: string;
  note: string;
}

export interface TraceEntry {
  index: number;
  stage: TraceStage;
  label: string;
  boundary: TraceBoundary;
  inputChecksum: string;
  outputChecksum: string;
  receiptId: string;
  summary: string;
  metadata: Record<string, unknown>;
}

export interface EvalTrace {
  id: string;
  mode: "seeded-eval";
  repo: string;
  generatedAt: string;
  receiptId: string;
  entries: TraceEntry[];
  checksum: string;
}

interface TraceGate {
  id: string;
  grade: string;
  observed: number;
  expected: number;
}

interface TracePatchDiagnostic {
  candidateId: string;
  rank: number;
  winner: boolean;
  score: number;
  checksum: string;
  touchedFiles: string[];
  testFiles: string[];
  riskFlags: string[];
}

interface TraceMetrics {
  caughtSeeded: number;
  totalSeeded: number;
  extraFindings: number;
  recall: number;
  precision: number;
  f1: number;
  criticalRecall: number;
}

export function buildEvalTrace(input: {
  repo: string;
  generatedAt: string;
  manifest: BenchmarkManifest;
  findings: Finding[];
  patchCandidates: PatchCandidate[];
  ledger: ProofLedger;
  metrics: TraceMetrics;
  gates: TraceGate[];
  patchDiagnostics: TracePatchDiagnostic[];
  receipt: TournamentReceipt;
}): EvalTrace {
  const receiptId = input.receipt.id;
  const findingSummaries = input.findings.map(summarizeFinding);
  const patchCandidateSummaries = input.patchCandidates.map(summarizePatchCandidate);
  const patchDiagnosticSummaries = input.patchDiagnostics.map(summarizePatchDiagnostic);
  const boundary = deterministicBoundary();

  const entries: TraceEntry[] = [
    {
      index: 1,
      stage: "review/scout",
      label: "Seeded scout review",
      boundary,
      inputChecksum: traceChecksum({
        repo: input.repo,
        manifestId: input.manifest.id,
        manifestChecksum: input.manifest.checksum,
      }),
      outputChecksum: traceChecksum(findingSummaries),
      receiptId,
      summary: `${input.findings.length} seeded fixture findings emitted by local scouts.`,
      metadata: {
        findingCount: input.findings.length,
        aspects: uniqueSorted(input.findings.map((finding) => finding.aspect)),
        severities: uniqueSorted(input.findings.map((finding) => finding.severity)),
      },
    },
    {
      index: 2,
      stage: "judge",
      label: "Deterministic judge",
      boundary,
      inputChecksum: traceChecksum({
        findings: findingSummaries,
        manifestChecksum: input.manifest.checksum,
      }),
      outputChecksum: traceChecksum({
        ledgerChecksum: input.ledger.checksum,
        metrics: input.metrics,
      }),
      receiptId,
      summary: `${input.ledger.caught}/${input.ledger.caught + input.ledger.missed} seeded mistakes mapped to findings.`,
      metadata: {
        ledgerChecksum: input.ledger.checksum,
        caught: input.ledger.caught,
        missed: input.ledger.missed,
        extra: input.ledger.extra,
        criticalRecall: input.metrics.criticalRecall,
      },
    },
    {
      index: 3,
      stage: "fix",
      label: "Deterministic fix candidates",
      boundary,
      inputChecksum: traceChecksum({
        repo: input.repo,
        findings: findingSummaries,
      }),
      outputChecksum: traceChecksum(patchCandidateSummaries),
      receiptId,
      summary: `${input.patchCandidates.length} patch candidates generated for seeded findings.`,
      metadata: {
        candidateCount: input.patchCandidates.length,
        strategies: uniqueSorted(input.patchCandidates.map((candidate) => candidate.strategy)),
        patchChecksums: patchCandidateSummaries.map((candidate) => candidate.patchChecksum),
      },
    },
    {
      index: 4,
      stage: "score",
      label: "Deterministic score and gates",
      boundary,
      inputChecksum: traceChecksum({
        findings: findingSummaries,
        candidates: patchCandidateSummaries,
      }),
      outputChecksum: traceChecksum({
        gates: input.gates,
        patchDiagnostics: patchDiagnosticSummaries,
      }),
      receiptId,
      summary: `${input.gates.filter((gate) => gate.grade === "fail").length} failing gates after patch scoring.`,
      metadata: {
        gateGrades: Object.fromEntries(input.gates.map((gate) => [gate.id, gate.grade])),
        winningPatch: patchDiagnosticSummaries.find((diagnostic) => diagnostic.winner) ?? null,
      },
    },
    {
      index: 5,
      stage: "handoff",
      label: "Receipt and handoff",
      boundary,
      inputChecksum: traceChecksum({
        ledgerChecksum: input.ledger.checksum,
        patchDiagnostics: patchDiagnosticSummaries,
      }),
      outputChecksum: traceChecksum({
        receiptId: input.receipt.id,
        receiptChecksum: input.receipt.checksum,
        handoff: input.receipt.handoff,
      }),
      receiptId,
      summary: `Receipt ${input.receipt.id} created for coding-agent handoff.`,
      metadata: {
        receiptId: input.receipt.id,
        receiptChecksum: input.receipt.checksum,
        handoffReceiptId: input.receipt.handoff.receiptId,
      },
    },
  ];

  const unsigned = {
    mode: "seeded-eval" as const,
    repo: input.repo,
    generatedAt: input.generatedAt,
    receiptId,
    entries,
  };
  const id = `trace.${traceChecksum(unsigned).slice(0, 12)}`;

  return {
    id,
    ...unsigned,
    checksum: traceChecksum({ id, ...unsigned }),
  };
}

function deterministicBoundary(): TraceBoundary {
  return {
    kind: "deterministic",
    source: "seeded-fixture",
    model: "none",
    note: "No model call is used during the seeded eval run.",
  };
}

function summarizeFinding(finding: Finding) {
  return {
    id: finding.id,
    aspect: finding.aspect,
    severity: finding.severity,
    file: finding.file,
    line: finding.line ?? null,
    title: finding.title,
    confidence: finding.confidence,
    verdict: finding.verdict ?? "unjudged",
    matchedAgents: finding.matchedAgents ?? [],
  };
}

function summarizePatchCandidate(candidate: PatchCandidate) {
  return {
    id: candidate.id,
    findingId: candidate.findingId,
    strategy: candidate.strategy,
    patchChecksum: traceChecksum(candidate.patch),
  };
}

function summarizePatchDiagnostic(diagnostic: TracePatchDiagnostic) {
  return {
    candidateId: diagnostic.candidateId,
    rank: diagnostic.rank,
    winner: diagnostic.winner,
    score: diagnostic.score,
    checksum: diagnostic.checksum,
    touchedFiles: diagnostic.touchedFiles,
    testFiles: diagnostic.testFiles,
    riskFlags: diagnostic.riskFlags,
  };
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort();
}

function traceChecksum(value: unknown) {
  return proofHash(value);
}
