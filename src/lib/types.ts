export type Severity = "critical" | "warning" | "info";
export type Aspect = "hallucination" | "spec-drift" | "test-theater";
export type AgentStatus = "idle" | "running" | "done" | "error";
export type JudgeVerdict = "confirmed" | "likely" | "speculative";

export type FixStrategy = "conservative" | "idiomatic" | "robust";
export type SeedStatus = "caught" | "missed" | "extra";
export type ScoutModelProfile = "fast" | "balanced" | "deep";

export interface FixerState {
  strategy: FixStrategy;
  label: string;
  description: string;
  status: AgentStatus;
  patch: string;
}

/** A single finding emitted by an agent, pipe-delimited in stream */
export interface Finding {
  id: string;
  aspect: Aspect;
  severity: Severity;
  file: string;
  line?: number;
  title: string;
  description: string;
  confidence: number; // 0-100
  evidence?: string;
  verdict?: JudgeVerdict;
  matchedAgents?: Aspect[];
}

/** Per-agent runtime state tracked on the client */
export interface AgentState {
  aspect: Aspect;
  label: string;
  description: string;
  status: AgentStatus;
  /** Raw streaming text (think-aloud analysis) */
  raw: string;
  findings: Finding[];
  model?: string;
  durationMs?: number;
}

export interface SeededMistake {
  id: string;
  aspect: Aspect;
  severity: Severity;
  file: string;
  line?: number;
  title: string;
  contract: string;
  matchTerms: string[];
}

export interface BenchmarkManifest {
  id: string;
  repo: string;
  version: string;
  totalMistakes: number;
  seededMistakes: SeededMistake[];
  checksum: string;
}

export interface ProofLedgerEntry {
  seedId: string;
  status: SeedStatus;
  findingIds: string[];
  evidence: string;
  confidence: number;
}

export interface ProofLedger {
  manifestId: string;
  manifestChecksum: string;
  entries: ProofLedgerEntry[];
  caught: number;
  missed: number;
  extra: number;
  recall: number;
  checksum: string;
}

export interface PatchCandidate {
  id: string;
  findingId: string;
  strategy: FixStrategy;
  patch: string;
}

export interface PatchScoreBreakdown {
  targetsFinding: number;
  removesRisk: number;
  addsProof: number;
  scopeControl: number;
  regressionRisk: number;
}

export interface PatchScore {
  candidateId: string;
  findingId: string;
  strategy: FixStrategy;
  score: number;
  rank: number;
  winner: boolean;
  touchedFiles: string[];
  testFiles: string[];
  breakdown: PatchScoreBreakdown;
  checksum: string;
}

export interface PatchExecutionSummary {
  candidateId: string;
  eligible: boolean;
  applySummary: string;
  checkSummaries: string[];
  disqualifiedReason?: string;
}

export interface TournamentHandoff {
  title: string;
  summary: string;
  checklist: string[];
  receiptId: string;
}

export interface TournamentReceipt {
  id: string;
  repo: string;
  manifestId: string;
  ledger: ProofLedger;
  patchScores: PatchScore[];
  winningPatch?: PatchScore;
  handoff: TournamentHandoff;
  checksum: string;
}

export type ScoutGraphNodeKind =
  | "repo"
  | "file"
  | "finding"
  | "test"
  | "patch"
  | "gate"
  | "trace-entry"
  | "receipt";

export type ScoutGraphEdgeKind = "cites" | "fixes" | "proves" | "scores" | "summarizes";

export interface ScoutGraphReference {
  file?: string;
  line?: number;
  checksum?: string;
}

export interface ScoutGraphNode {
  id: string;
  kind: ScoutGraphNodeKind;
  label: string;
  summary: string;
  weight: number;
  refs?: ScoutGraphReference[];
  metadata?: Record<string, string | number | boolean | string[] | null>;
}

export interface ScoutGraphEdge {
  id: string;
  kind: ScoutGraphEdgeKind;
  from: string;
  to: string;
  label: string;
  weight: number;
  metadata?: Record<string, string | number | boolean | string[] | null>;
}

export interface ScoutEvidenceGraph {
  id: string;
  repo: string;
  generatedAt: string;
  nodes: ScoutGraphNode[];
  edges: ScoutGraphEdge[];
  entrypoints: {
    repo: string;
    receipt?: string;
    winningPatch?: string;
    criticalFindings: string[];
  };
  checksum: string;
}

export interface ScoutGraphNeighborhood {
  graphId: string;
  seedNodeIds: string[];
  nodes: ScoutGraphNode[];
  edges: ScoutGraphEdge[];
  omittedNodeCount: number;
  context: string;
  checksum: string;
}
