#!/usr/bin/env node
import { exit, stderr, stdout } from "node:process";
import { buildEvalReport } from "../src/lib/eval";
import {
  buildScoutEvidenceGraphFromRun,
  formatGraphNeighborhoodContext,
  selectPatchNeighborhood,
} from "../src/lib/evidence-graph";
import { DEMO_REPO_URL, scoutFix, scoutReview } from "../src/lib/scout-runner";
import type { Finding, PatchCandidate, ScoutEvidenceGraph, ScoutGraphEdgeKind, ScoutGraphNodeKind } from "../src/lib/types";

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
  const graph = buildScoutEvidenceGraphFromRun({
    report,
    findings: review.findings,
    patchCandidates,
  });

  assertGraphShape(graph);
  assertGraphSemantics(graph, review.findings);

  const winner = report.receipt.winningPatch;
  assert(Boolean(winner), "report must have a winning patch");
  if (!winner) return;

  const focused = selectPatchNeighborhood(graph, winner.candidateId);
  assert(focused.nodes.some((node) => node.kind === "patch"), "focused context must include patch node");
  assert(focused.nodes.some((node) => node.kind === "finding"), "focused context must include linked finding");
  assert(focused.nodes.some((node) => node.kind === "test"), "focused context must include proof test");
  assert(focused.nodes.length < graph.nodes.length, "focused context must be smaller than full graph");
  assert(focused.context === formatGraphNeighborhoodContext(focused.nodes, focused.edges), "focused context must be deterministic");
  assert(!focused.context.includes("--- a/"), "focused context must not include raw patch hunks");

  stdout.write(JSON.stringify({
    ok: true,
    graph: graph.id,
    checksum: graph.checksum,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    focusedNodes: focused.nodes.length,
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

function assertGraphShape(graph: ScoutEvidenceGraph) {
  assert(/^graph\.[a-f0-9]{8}$/.test(graph.id), "graph id must be graph.<hash>");
  assert(graph.repo === DEMO_REPO_URL, "graph repo must target seeded demo");
  assert(graph.checksum.length > 0, "graph checksum is required");
  assert(new Set(graph.nodes.map((node) => node.id)).size === graph.nodes.length, "graph nodes must be unique");

  for (const edge of graph.edges) {
    assert(graph.nodes.some((node) => node.id === edge.from), `edge source missing: ${edge.from}`);
    assert(graph.nodes.some((node) => node.id === edge.to), `edge target missing: ${edge.to}`);
  }

  for (const kind of ["repo", "file", "finding", "patch", "test", "gate", "trace-entry", "receipt"] as ScoutGraphNodeKind[]) {
    assert(graph.nodes.some((node) => node.kind === kind), `graph must include ${kind} nodes`);
  }
}

function assertGraphSemantics(graph: ScoutEvidenceGraph, findings: Finding[]) {
  for (const finding of findings) {
    assert(
      hasEdge(graph, `finding:${finding.id}`, `file:${finding.file}`, "cites")
        || hasEdge(graph, `finding:${finding.id}`, `test:${finding.file}`, "cites"),
      `finding ${finding.id} must cite its file`,
    );
  }

  const winningPatchId = graph.entrypoints.winningPatch;
  assert(Boolean(winningPatchId), "graph must expose winning patch entrypoint");
  if (!winningPatchId) return;

  assert(graph.nodes.some((node) => node.id === winningPatchId && node.metadata?.winner === true), "winning patch node must be marked winner");
  assert(graph.edges.some((edge) => edge.from === winningPatchId && edge.kind === "fixes"), "winning patch must fix a finding");
  assert(graph.edges.some((edge) => edge.to === winningPatchId && edge.kind === "proves"), "winning patch must have test proof edge");
  assert(graph.entrypoints.criticalFindings.length > 0, "graph must expose critical finding entrypoints");

  const serialized = JSON.stringify(graph);
  assert(!serialized.includes("--- a/"), "graph must not store raw patch hunks");
  assert(serialized.length < 40000, "graph must stay compact enough for focused model context");
}

function hasEdge(graph: ScoutEvidenceGraph, from: string, to: string, kind: ScoutGraphEdgeKind) {
  return graph.edges.some((edge) => edge.from === from && edge.to === to && edge.kind === kind);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  exit(1);
});
