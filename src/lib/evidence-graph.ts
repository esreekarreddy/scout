import type { EvalGate, EvalReport, PatchTournamentDiagnostic } from "./eval";
import { proofHash } from "./tournament";
import type {
  Finding,
  PatchCandidate,
  PatchScore,
  ScoutEvidenceGraph,
  ScoutGraphEdge,
  ScoutGraphEdgeKind,
  ScoutGraphNeighborhood,
  ScoutGraphNode,
  ScoutGraphNodeKind,
  TournamentReceipt,
} from "./types";

type GraphGate = Pick<EvalGate, "id" | "label" | "grade" | "observed" | "expected" | "detail">;
type GraphTraceEntry = EvalReport["trace"]["entries"][number];

export interface BuildScoutEvidenceGraphInput {
  repo: string;
  generatedAt?: string;
  findings: Finding[];
  patchCandidates?: PatchCandidate[];
  patchScores?: PatchScore[];
  patchDiagnostics?: PatchTournamentDiagnostic[];
  gates?: GraphGate[];
  traceEntries?: GraphTraceEntry[];
  receipt?: TournamentReceipt;
}

export interface GraphNeighborhoodOptions {
  radius?: number;
  maxNodes?: number;
  includeKinds?: ScoutGraphNodeKind[];
}

const DEFAULT_RADIUS = 2;
const DEFAULT_MAX_NODES = 18;

export function buildScoutEvidenceGraph(input: BuildScoutEvidenceGraphInput): ScoutEvidenceGraph {
  const generatedAt = input.generatedAt ?? new Date(0).toISOString();
  const nodes = new Map<string, ScoutGraphNode>();
  const edges = new Map<string, ScoutGraphEdge>();
  const repoNode = node("repo", repoNodeId(input.repo), input.repo, "Repository under Scout review.", 100);
  nodes.set(repoNode.id, repoNode);

  const findingsById = new Map(input.findings.map((finding) => [finding.id, finding]));
  const candidateById = new Map((input.patchCandidates ?? []).map((candidate) => [candidate.id, candidate]));
  const scoreByCandidateId = new Map((input.patchScores ?? input.receipt?.patchScores ?? []).map((score) => [score.candidateId, score]));
  const diagnosticByCandidateId = new Map((input.patchDiagnostics ?? []).map((diagnostic) => [diagnostic.candidateId, diagnostic]));

  for (const finding of input.findings) {
    const fileNodeId = ensureFileNode(nodes, finding.file, isTestFile(finding.file));
    const findingNode = findingNodeFor(finding);
    nodes.set(findingNode.id, findingNode);
    addEdge(edges, "cites", findingNode.id, fileNodeId, "finding cites file", finding.confidence);
    addEdge(edges, "summarizes", findingNode.id, repoNode.id, "finding summarizes repo risk", severityWeight(finding.severity));
  }

  const patchScores = input.patchScores ?? input.receipt?.patchScores ?? [];
  const patchIds = uniqueSortedValues([
    ...(input.patchCandidates ?? []).map((candidate) => candidate.id),
    ...patchScores.map((score) => score.candidateId),
    ...(input.patchDiagnostics ?? []).map((diagnostic) => diagnostic.candidateId),
  ]);

  for (const candidateId of patchIds) {
    const candidate = candidateById.get(candidateId);
    const score = scoreByCandidateId.get(candidateId);
    const diagnostic = diagnosticByCandidateId.get(candidateId);
    const findingId = candidate?.findingId ?? score?.findingId;
    const patchNode = patchNodeFor(candidateId, candidate, score, diagnostic);
    nodes.set(patchNode.id, patchNode);

    if (findingId && findingsById.has(findingId)) {
      addEdge(edges, "fixes", patchNode.id, findingNodeId(findingId), "patch fixes finding", score?.score ?? 50);
    }

    const touchedFiles = uniqueSorted([
      ...(score?.touchedFiles ?? []),
      ...(diagnostic?.touchedFiles ?? []),
      ...extractTouchedFiles(candidate?.patch ?? ""),
    ]);
    for (const file of touchedFiles) {
      const fileNodeId = ensureFileNode(nodes, file, isTestFile(file));
      addEdge(edges, "cites", patchNode.id, fileNodeId, "patch touches file", score?.score ?? 40);
    }

    const testFiles = uniqueSorted([
      ...(score?.testFiles ?? []),
      ...(diagnostic?.testFiles ?? []),
      ...touchedFiles.filter(isTestFile),
    ]);
    for (const file of testFiles) {
      const testNodeId = ensureFileNode(nodes, file, true);
      addEdge(edges, "proves", testNodeId, patchNode.id, "test proves patch", score?.breakdown.addsProof ?? 30);
    }
  }

  for (const gate of input.gates ?? []) {
    const gateNode = gateNodeFor(gate);
    nodes.set(gateNode.id, gateNode);
    addEdge(edges, "scores", gateNode.id, repoNode.id, "gate scores repo", gateWeight(gate.grade));
    if (gate.id === "patch-tournament") {
      const winningPatch = patchScores.find((score) => score.winner);
      if (winningPatch) addEdge(edges, "scores", gateNode.id, patchNodeId(winningPatch.candidateId), "gate scores winning patch", winningPatch.score);
    }
  }

  for (const entry of input.traceEntries ?? []) {
    const traceNode = traceNodeFor(entry);
    nodes.set(traceNode.id, traceNode);
    addEdge(edges, "summarizes", traceNode.id, repoNode.id, "trace summarizes repo step", 45);
    if (entry.stage === "review/scout") {
      for (const finding of input.findings) {
        addEdge(edges, "summarizes", traceNode.id, findingNodeId(finding.id), "trace summarizes finding", finding.confidence);
      }
    }
    if (entry.stage === "score") {
      for (const gate of input.gates ?? []) {
        addEdge(edges, "summarizes", traceNode.id, gateNodeId(gate.id), "trace summarizes gate", gateWeight(gate.grade));
      }
    }
  }

  if (input.receipt) {
    const receiptNode = receiptNodeFor(input.receipt);
    nodes.set(receiptNode.id, receiptNode);
    addEdge(edges, "summarizes", receiptNode.id, repoNode.id, "receipt summarizes run", 100);
    for (const score of input.receipt.patchScores) {
      addEdge(edges, "scores", receiptNode.id, patchNodeId(score.candidateId), "receipt scores patch", score.score);
    }
  }

  const unsigned = {
    repo: input.repo,
    generatedAt,
    nodes: sortedById([...nodes.values()]),
    edges: sortedById([...edges.values()]),
    receiptId: input.receipt?.id ?? null,
  };
  const id = `graph.${proofHash(unsigned).slice(0, 12)}`;
  const graph = {
    id,
    ...unsigned,
    entrypoints: {
      repo: repoNode.id,
      receipt: input.receipt ? receiptNodeId(input.receipt.id) : undefined,
      winningPatch: input.receipt?.winningPatch ? patchNodeId(input.receipt.winningPatch.candidateId) : undefined,
      criticalFindings: input.findings
        .filter((finding) => finding.severity === "critical")
        .map((finding) => findingNodeId(finding.id)),
    },
  };

  return {
    ...graph,
    checksum: proofHash(graph),
  };
}

export function buildScoutEvidenceGraphFromEvalReport(
  report: EvalReport,
  patchCandidates: PatchCandidate[] = [],
): ScoutEvidenceGraph {
  return buildScoutEvidenceGraph({
    repo: report.repo,
    generatedAt: report.generatedAt,
    findings: collectFindingsFromReport(report),
    patchCandidates,
    patchScores: report.receipt.patchScores,
    patchDiagnostics: report.patchDiagnostics,
    gates: report.gates,
    traceEntries: report.trace.entries,
    receipt: report.receipt,
  });
}

export function buildScoutEvidenceGraphFromRun(input: {
  report: EvalReport;
  findings: Finding[];
  patchCandidates?: PatchCandidate[];
}): ScoutEvidenceGraph {
  return buildScoutEvidenceGraph({
    repo: input.report.repo,
    generatedAt: input.report.generatedAt,
    findings: input.findings,
    patchCandidates: input.patchCandidates ?? [],
    patchScores: input.report.receipt.patchScores,
    patchDiagnostics: input.report.patchDiagnostics,
    gates: input.report.gates,
    traceEntries: input.report.trace.entries,
    receipt: input.report.receipt,
  });
}

export function selectFindingNeighborhood(
  graph: ScoutEvidenceGraph,
  findingId: string,
  options: GraphNeighborhoodOptions = {},
): ScoutGraphNeighborhood {
  return selectGraphNeighborhood(graph, [normalizeSeedId(findingId, "finding")], options);
}

export function selectPatchNeighborhood(
  graph: ScoutEvidenceGraph,
  candidateId: string,
  options: GraphNeighborhoodOptions = {},
): ScoutGraphNeighborhood {
  return selectGraphNeighborhood(graph, [normalizeSeedId(candidateId, "patch")], options);
}

export function selectGraphNeighborhood(
  graph: ScoutEvidenceGraph,
  seedNodeIds: string[],
  options: GraphNeighborhoodOptions = {},
): ScoutGraphNeighborhood {
  const radius = options.radius ?? DEFAULT_RADIUS;
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  const includeKinds = new Set(options.includeKinds ?? []);
  const nodeById = new Map(graph.nodes.map((graphNode) => [graphNode.id, graphNode]));
  const selectedIds = new Set(seedNodeIds.filter((seedId) => nodeById.has(seedId)));
  const frontier = [...selectedIds].map((id) => ({ id, depth: 0 }));

  for (let index = 0; index < frontier.length; index += 1) {
    const current = frontier[index];
    if (!current || current.depth >= radius) continue;
    for (const edge of graph.edges) {
      if (edge.from !== current.id && edge.to !== current.id) continue;
      const nextId = edge.from === current.id ? edge.to : edge.from;
      const nextNode = nodeById.get(nextId);
      if (!nextNode || selectedIds.has(nextId)) continue;
      if (includeKinds.size > 0 && !includeKinds.has(nextNode.kind)) continue;
      selectedIds.add(nextId);
      frontier.push({ id: nextId, depth: current.depth + 1 });
    }
  }

  const nodes = [...selectedIds]
    .map((id) => nodeById.get(id))
    .filter((graphNode): graphNode is ScoutGraphNode => Boolean(graphNode))
    .sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id))
    .slice(0, maxNodes);
  const finalIds = new Set(nodes.map((graphNode) => graphNode.id));
  const edges = graph.edges
    .filter((edge) => finalIds.has(edge.from) && finalIds.has(edge.to))
    .sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
  const unsigned = {
    graphId: graph.id,
    seedNodeIds,
    nodes,
    edges,
  };

  return {
    ...unsigned,
    omittedNodeCount: graph.nodes.length - nodes.length,
    context: formatGraphNeighborhoodContext(nodes, edges),
    checksum: proofHash(unsigned),
  };
}

export function formatGraphNeighborhoodContext(nodes: ScoutGraphNode[], edges: ScoutGraphEdge[]): string {
  const nodeLines = nodes.map((graphNode) => {
    const refs = graphNode.refs?.map((ref) => `${ref.file ?? ""}${ref.line ? `:${ref.line}` : ""}`).filter(Boolean).join(", ");
    return `node ${graphNode.id} [${graphNode.kind}] ${graphNode.label}: ${graphNode.summary}${refs ? ` refs=${refs}` : ""}`;
  });
  const edgeLines = edges.map((edge) => `edge ${edge.from} -${edge.kind}-> ${edge.to}: ${edge.label}`);
  return [...nodeLines, ...edgeLines].join("\n");
}

function collectFindingsFromReport(report: EvalReport): Finding[] {
  const seedsById = new Map(report.manifest.seededMistakes.map((seed) => [seed.id, seed]));
  const findings = new Map<string, Finding>();

  for (const entry of report.ledger.entries) {
    for (const findingId of entry.findingIds) {
      if (findings.has(findingId)) continue;
      const seed = seedsById.get(entry.seedId);
      if (seed) {
        findings.set(findingId, {
          id: findingId,
          aspect: seed.aspect,
          severity: seed.severity,
          file: seed.file,
          line: seed.line,
          title: seed.title,
          description: seed.contract,
          confidence: entry.confidence,
          evidence: entry.evidence,
          verdict: entry.status === "caught" ? "confirmed" : "likely",
          matchedAgents: [seed.aspect],
        });
        continue;
      }

      const parsed = parseLedgerEvidence(entry.evidence);
      findings.set(findingId, {
        id: findingId,
        aspect: "spec-drift",
        severity: "info",
        file: parsed.file,
        line: parsed.line,
        title: parsed.title,
        description: entry.evidence,
        confidence: entry.confidence,
        evidence: entry.evidence,
        verdict: "speculative",
      });
    }
  }

  return [...findings.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function findingNodeFor(finding: Finding): ScoutGraphNode {
  return node("finding", findingNodeId(finding.id), finding.title, finding.description, severityWeight(finding.severity), {
    refs: [{ file: finding.file, line: finding.line }],
    metadata: {
      findingId: finding.id,
      aspect: finding.aspect,
      severity: finding.severity,
      confidence: finding.confidence,
      verdict: finding.verdict ?? null,
      matchedAgents: finding.matchedAgents ?? [],
    },
  });
}

function patchNodeFor(
  candidateId: string,
  candidate?: PatchCandidate,
  score?: PatchScore,
  diagnostic?: PatchTournamentDiagnostic,
): ScoutGraphNode {
  const scoreSummary = score ? `${score.score}/100 rank ${score.rank}` : "unscored";
  const riskFlags = diagnostic?.riskFlags ?? [];
  return node("patch", patchNodeId(candidateId), candidate?.strategy ?? score?.strategy ?? "patch", `Patch candidate ${scoreSummary}.`, score?.score ?? 45, {
    refs: [{ checksum: candidate ? proofHash(candidate.patch) : diagnostic?.checksum ?? score?.checksum }],
    metadata: {
      candidateId,
      findingId: candidate?.findingId ?? score?.findingId ?? null,
      strategy: candidate?.strategy ?? score?.strategy ?? null,
      score: score?.score ?? null,
      rank: score?.rank ?? null,
      winner: score?.winner ?? false,
      touchedFiles: score?.touchedFiles ?? diagnostic?.touchedFiles ?? [],
      testFiles: score?.testFiles ?? diagnostic?.testFiles ?? [],
      riskFlags,
    },
  });
}

function gateNodeFor(gate: GraphGate): ScoutGraphNode {
  return node("gate", gateNodeId(gate.id), gate.label, `${gate.grade}: ${gate.detail}`, gateWeight(gate.grade), {
    metadata: {
      gateId: gate.id,
      grade: gate.grade,
      observed: gate.observed,
      expected: gate.expected,
    },
  });
}

function traceNodeFor(entry: GraphTraceEntry): ScoutGraphNode {
  return node("trace-entry", traceNodeId(entry.index), entry.label, entry.summary, 40, {
    refs: [{ checksum: entry.outputChecksum }],
    metadata: {
      index: entry.index,
      stage: entry.stage,
      boundary: entry.boundary.kind,
      inputChecksum: entry.inputChecksum,
      outputChecksum: entry.outputChecksum,
      receiptId: entry.receiptId,
    },
  });
}

function receiptNodeFor(receipt: TournamentReceipt): ScoutGraphNode {
  return node("receipt", receiptNodeId(receipt.id), receipt.id, receipt.handoff.summary, 100, {
    refs: [{ checksum: receipt.checksum }],
    metadata: {
      receiptId: receipt.id,
      manifestId: receipt.manifestId,
      ledgerChecksum: receipt.ledger.checksum,
      caught: receipt.ledger.caught,
      missed: receipt.ledger.missed,
      extra: receipt.ledger.extra,
      winningPatch: receipt.winningPatch?.candidateId ?? null,
    },
  });
}

function ensureFileNode(nodes: Map<string, ScoutGraphNode>, file: string, test: boolean) {
  const id = fileNodeId(file, test);
  if (!nodes.has(id)) {
    nodes.set(id, node(test ? "test" : "file", id, file, test ? "Executable proof file." : "Repository file cited by evidence.", test ? 65 : 55, {
      refs: [{ file }],
      metadata: { file },
    }));
  }
  return id;
}

function node(
  kind: ScoutGraphNodeKind,
  id: string,
  label: string,
  summary: string,
  weight: number,
  extra: Pick<ScoutGraphNode, "refs" | "metadata"> = {},
): ScoutGraphNode {
  return { id, kind, label, summary, weight, ...extra };
}

function addEdge(
  edges: Map<string, ScoutGraphEdge>,
  kind: ScoutGraphEdgeKind,
  from: string,
  to: string,
  label: string,
  weight: number,
) {
  const id = `${kind}:${from}:${to}`;
  edges.set(id, { id, kind, from, to, label, weight });
}

function repoNodeId(repo: string) {
  return `repo:${proofHash(repo).slice(0, 10)}`;
}

function findingNodeId(findingId: string) {
  return `finding:${findingId}`;
}

function patchNodeId(candidateId: string) {
  return `patch:${candidateId}`;
}

function gateNodeId(gateId: string) {
  return `gate:${gateId}`;
}

function traceNodeId(index: number) {
  return `trace:${index}`;
}

function receiptNodeId(receiptId: string) {
  return `receipt:${receiptId}`;
}

function fileNodeId(file: string, test: boolean) {
  return `${test ? "test" : "file"}:${normalizePath(file)}`;
}

function normalizeSeedId(id: string, kind: "finding" | "patch") {
  return id.startsWith(`${kind}:`) ? id : `${kind}:${id}`;
}

function severityWeight(severity: Finding["severity"]) {
  if (severity === "critical") return 95;
  if (severity === "warning") return 70;
  return 35;
}

function gateWeight(grade: GraphGate["grade"]) {
  if (grade === "fail") return 95;
  if (grade === "warn") return 70;
  return 50;
}

function extractTouchedFiles(patch: string): string[] {
  const files = new Set<string>();
  for (const line of patch.split("\n")) {
    const match = /^(?:---|\+\+\+) [ab]\/(.+)$/.exec(line.trim());
    if (!match || match[1] === "/dev/null") continue;
    files.add(normalizePath(match[1]));
  }
  return [...files].sort();
}

function isTestFile(file: string) {
  return /(^|\/)(test|tests|__tests__)\/|(\.|-)(test|spec)\.[cm]?[tj]sx?$/.test(normalizePath(file));
}

function normalizePath(file: string) {
  return file.replace(/\\/g, "/").replace(/^\.?\//, "");
}

function parseLedgerEvidence(evidence: string) {
  const match = /^(\S+?)(?::(\d+))?\s+(.+)$/.exec(evidence.trim());
  if (!match) return { file: "unknown", line: undefined, title: evidence };
  return {
    file: match[1],
    line: match[2] ? Number(match[2]) : undefined,
    title: match[3],
  };
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean).map(normalizePath))].sort();
}

function uniqueSortedValues(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort();
}

function sortedById<T extends { id: string }>(items: T[]) {
  return [...items].sort((a, b) => a.id.localeCompare(b.id));
}
