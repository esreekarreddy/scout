import { createHash } from "node:crypto";
import { DEMO_REPO_URL, getDemoFixPatch, getDemoReviewStream, isDemoRepo } from "./demo-fixtures";
import { judgeFindings, calcEvalScore } from "./judge";
import { AGENTS, FIX_STRATEGIES, parseFindingLine } from "./prompts";
import {
  SEEDED_BENCHMARK_MANIFEST,
  buildProofLedger,
  buildTournamentReceipt,
  formatTournamentHandoff,
  scorePatchCandidate,
} from "./tournament";
import type {
  Aspect,
  BenchmarkManifest,
  Finding,
  FixStrategy,
  PatchCandidate,
  ProofLedger,
  PatchScore,
  TournamentHandoff,
} from "./types";

type ReviewResult = {
  repo: string;
  mode: "demo" | "unsupported";
  findings: Finding[];
  judgedFindings: Finding[];
  evalScore: ReturnType<typeof calcEvalScore>;
  manifest: BenchmarkManifest;
  proofLedger: ProofLedger;
  evidence: string[];
};

type FixResult = {
  repo: string;
  findingId: string;
  candidates: PatchCandidate[];
};

type HandoffResult = TournamentHandoff & {
  repo: string;
  findingId: string;
  artifact: string;
};

const DEFAULT_STRATEGIES: FixStrategy[] = FIX_STRATEGIES.map((strategy) => strategy.key);

function checksum(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function findingId(aspect: Aspect, finding: Omit<Finding, "id" | "aspect">, index: number) {
  return checksum([aspect, finding.file, finding.line ?? 0, finding.title, index]);
}

function parseDemoFindings(aspect: Aspect): Finding[] {
  return getDemoReviewStream(aspect)
    .split("\n")
    .map((line) => parseFindingLine(line.trim()))
    .filter((finding): finding is Omit<Finding, "id" | "aspect"> => Boolean(finding))
    .map((finding, index) => ({
      ...finding,
      id: findingId(aspect, finding, index),
      aspect,
      evidence: "DEMO FIXTURE",
    }));
}

export async function scoutReview(repo: string): Promise<ReviewResult> {
  if (!isDemoRepo(repo)) {
    const proofLedger = buildProofLedger([]);
    return {
      repo,
      mode: "unsupported",
      findings: [],
      judgedFindings: [],
      evalScore: calcEvalScore([]),
      manifest: SEEDED_BENCHMARK_MANIFEST,
      proofLedger,
      evidence: [
        "Only demo://ai-written-code-seed is wired for this local stdio tool runner.",
        "Live OpenAI and GitHub paths are exposed through the Next.js app routes, not this local runner.",
      ],
    };
  }

  const findings = AGENTS.flatMap((agent) => parseDemoFindings(agent.aspect));
  const judgedFindings = judgeFindings(findings);
  const proofLedger = buildProofLedger(findings);
  return {
    repo,
    mode: "demo",
    findings,
    judgedFindings,
    evalScore: calcEvalScore(findings),
    manifest: SEEDED_BENCHMARK_MANIFEST,
    proofLedger,
    evidence: [
      `Seeded proof ledger: ${proofLedger.caught}/${proofLedger.caught + proofLedger.missed} caught at checksum ${proofLedger.checksum}.`,
      ...judgedFindings.map((finding) => `${finding.verdict}: ${finding.file}${finding.line ? `:${finding.line}` : ""} - ${finding.title}`),
    ],
  };
}

export async function scoutFix(
  repo: string,
  finding: Finding,
  strategy?: FixStrategy,
): Promise<FixResult> {
  const strategies = strategy ? [strategy] : DEFAULT_STRATEGIES;
  const candidates = strategies.map((selectedStrategy) => ({
    id: checksum([repo, finding.id, selectedStrategy]),
    findingId: finding.id,
    strategy: selectedStrategy,
    patch: isDemoRepo(repo)
      ? getDemoFixPatch(finding.title, selectedStrategy)
      : `// scout_fix live mode is not implemented in the local stdio runner.\n// Requested strategy: ${selectedStrategy}`,
  }));

  return {
    repo,
    findingId: finding.id,
    candidates,
  };
}

export async function scoutScorePatch(
  repo: string,
  finding: Finding,
  candidate: Pick<PatchCandidate, "strategy" | "patch">,
): Promise<PatchScore> {
  const patchCandidate: PatchCandidate = {
    id: checksum([repo, finding.id, candidate.strategy, candidate.patch]),
    findingId: finding.id,
    strategy: candidate.strategy,
    patch: candidate.patch,
  };

  return scorePatchCandidate(patchCandidate, finding);
}

export async function scoutHandoff(repo: string, finding: Finding): Promise<HandoffResult> {
  const title = `Fix ${finding.title}`;
  const review = await scoutReview(repo);
  const receipt = buildTournamentReceipt({
    repo,
    findings: review.findings.length > 0 ? review.findings : [finding],
    manifest: SEEDED_BENCHMARK_MANIFEST,
  });
  const checklist = [
    `Inspect ${finding.file}${finding.line ? `:${finding.line}` : ""}.`,
    `Repair the behavior described by: ${finding.description}`,
    "Keep the patch scoped to the finding and existing project conventions.",
    "Add or update a focused test if the fix changes observable behavior.",
    `Preserve proof ledger ${receipt.ledger.checksum}.`,
    "Run the relevant tests before handing back the patch.",
  ];
  const summary = `${finding.severity.toUpperCase()} ${finding.aspect} finding in ${finding.file}: ${finding.title}`;
  const receiptId = receipt.id;
  const artifact = [
    `# Scout Handoff: ${title}`,
    "",
    `Repo: ${repo}`,
    `Finding: ${finding.id}`,
    `File: ${finding.file}${finding.line ? `:${finding.line}` : ""}`,
    `Verdict: ${finding.verdict ?? "unjudged"}`,
    "",
    "## Claim",
    finding.description,
    "",
    "## Evidence",
    finding.evidence ?? "No extra evidence attached.",
    "",
    "## Tournament Receipt",
    formatTournamentHandoff(receipt),
    "",
    "## Tool Boundary",
    repo === DEMO_REPO_URL
      ? "This handoff came from the deterministic seeded demo runner."
      : "This local stdio runner does not execute live GitHub or OpenAI review paths.",
    "",
    "## Repair Checklist",
    ...checklist.map((item) => `- ${item}`),
  ].join("\n");

  return {
    repo,
    findingId: finding.id,
    title,
    summary,
    checklist,
    receiptId,
    artifact,
  };
}

export { DEMO_REPO_URL, DEFAULT_STRATEGIES };
