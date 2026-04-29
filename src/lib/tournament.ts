import { DEMO_REPO_URL } from "./demo-fixtures";
import { judgeFindings } from "./judge";
import type {
  BenchmarkManifest,
  Finding,
  PatchCandidate,
  PatchScore,
  PatchScoreBreakdown,
  ProofLedger,
  ProofLedgerEntry,
  SeededMistake,
  TournamentHandoff,
  TournamentReceipt,
} from "./types";
import type { PatchExecutionResult } from "./patch-executor";

const SEEDED_MISTAKES: SeededMistake[] = [
  {
    id: "seed.fake-auth-package",
    aspect: "hallucination",
    severity: "critical",
    file: "src/auth.ts",
    line: 2,
    title: "Fake auth package import",
    contract: "Auth code must not depend on undeclared or nonexistent packages.",
    matchTerms: ["@acme/auth-guard", "fake auth package", "package import"],
  },
  {
    id: "seed.nonexistent-token-verifier",
    aspect: "hallucination",
    severity: "critical",
    file: "src/auth.ts",
    line: 10,
    title: "Nonexistent token verifier",
    contract: "Token verification must call a real verifier instead of invented helpers.",
    matchTerms: ["verifysessiontoken", "nonexistent token verifier", "jwt.decode"],
  },
  {
    id: "seed.missing-rate-limit",
    aspect: "spec-drift",
    severity: "warning",
    file: "src/routes.ts",
    line: 7,
    title: "README promises rate limiting that does not exist",
    contract: "Documented auth rate limits must be enforced on the login route.",
    matchTerms: ["rate limit", "rate-limited", "/auth/login"],
  },
  {
    id: "seed.raw-email-logged",
    aspect: "spec-drift",
    severity: "critical",
    file: "src/audit.ts",
    line: 5,
    title: "Comment says email is redacted but raw email is logged",
    contract: "Login telemetry must not include raw user email addresses.",
    matchTerms: ["redact", "raw email", "privacy", "user.email"],
  },
  {
    id: "seed.permissive-bearer-parser",
    aspect: "spec-drift",
    severity: "warning",
    file: "src/auth.ts",
    line: 5,
    title: "Bearer parser accepts malformed tokens",
    contract: "Bearer parsing must reject malformed authorization headers.",
    matchTerms: ["bearer", "malformed", "parsebearer", "strict"],
  },
  {
    id: "seed.truthy-bearer-test",
    aspect: "test-theater",
    severity: "warning",
    file: "test/auth.test.ts",
    line: 7,
    title: "Bearer test passes without checking behavior",
    contract: "Bearer parser tests must assert the exact accepted and rejected values.",
    matchTerms: ["tobetruthy", "bearer test", "exact token"],
  },
  {
    id: "seed.telemetry-test-misses-privacy",
    aspect: "test-theater",
    severity: "critical",
    file: "test/auth.test.ts",
    line: 13,
    title: "Telemetry test misses the privacy contract",
    contract: "Telemetry tests must prove raw email is omitted or redacted.",
    matchTerms: ["tohavebeencalled", "telemetry test", "privacy contract", "ada@example.com"],
  },
];

export const SEEDED_BENCHMARK_MANIFEST: BenchmarkManifest = withManifestChecksum({
  id: "scout.seeded-ai-code.v1",
  repo: DEMO_REPO_URL,
  version: "1.0.0",
  totalMistakes: SEEDED_MISTAKES.length,
  seededMistakes: SEEDED_MISTAKES,
  checksum: "",
});

export function buildProofLedger(
  findings: Finding[],
  manifest: BenchmarkManifest = SEEDED_BENCHMARK_MANIFEST,
): ProofLedger {
  const usedFindingIds = new Set<string>();
  const entries: ProofLedgerEntry[] = manifest.seededMistakes.map((seed) => {
    const matches = findings
      .map((finding) => ({ finding, score: matchSeed(seed, finding) }))
      .filter(({ score }) => score >= 3)
      .sort((a, b) => b.score - a.score || b.finding.confidence - a.finding.confidence);
    const findingIds = matches.map(({ finding }) => finding.id);
    for (const id of findingIds) usedFindingIds.add(id);

    return {
      seedId: seed.id,
      status: matches.length > 0 ? "caught" : "missed",
      findingIds,
      evidence: matches.length > 0
        ? matches.map(({ finding }) => `${finding.aspect}: ${finding.title}`).join(" | ")
        : `No finding matched ${seed.file}:${seed.line ?? 0} ${seed.title}`,
      confidence: matches.length > 0 ? Math.max(...matches.map(({ finding }) => finding.confidence)) : 0,
    };
  });

  const judged = judgeFindings(findings);
  for (const finding of judged) {
    if (usedFindingIds.has(finding.id)) continue;
    entries.push({
      seedId: `extra.${finding.id}`,
      status: "extra",
      findingIds: [finding.id],
      evidence: `${finding.file}${finding.line ? `:${finding.line}` : ""} ${finding.title}`,
      confidence: finding.confidence,
    });
  }

  const caught = entries.filter((entry) => entry.status === "caught").length;
  const missed = entries.filter((entry) => entry.status === "missed").length;
  const extra = entries.filter((entry) => entry.status === "extra").length;
  const unsigned = {
    manifestId: manifest.id,
    manifestChecksum: manifest.checksum,
    entries,
    caught,
    missed,
    extra,
    recall: round(caught / Math.max(1, manifest.totalMistakes), 3),
  };

  return {
    ...unsigned,
    checksum: proofHash(unsigned),
  };
}

export function scorePatchCandidate(candidate: PatchCandidate, finding?: Finding): PatchScore {
  const touchedFiles = extractTouchedFiles(candidate.patch);
  const testFiles = touchedFiles.filter(isTestFile);
  const patchText = candidate.patch.toLowerCase();
  const findingText = finding ? `${finding.file} ${finding.title} ${finding.description}`.toLowerCase() : "";
  const breakdown: PatchScoreBreakdown = {
    targetsFinding: scoreTargetsFinding(touchedFiles, finding),
    removesRisk: scoreRiskRemoval(patchText, findingText),
    addsProof: Math.min(25, testFiles.length * 12 + countMatches(patchText, ["expect(", "it(", "describe("]) * 4),
    scopeControl: scoreScopeControl(touchedFiles.length, candidate.patch),
    regressionRisk: scoreRegressionSafety(patchText),
  };
  const score = clamp(
    breakdown.targetsFinding
      + breakdown.removesRisk
      + breakdown.addsProof
      + breakdown.scopeControl
      + breakdown.regressionRisk,
    0,
    100,
  );
  const unsigned = {
    candidateId: candidate.id,
    findingId: candidate.findingId,
    strategy: candidate.strategy,
    score,
    rank: 0,
    winner: false,
    touchedFiles,
    testFiles,
    breakdown,
  };

  return {
    ...unsigned,
    checksum: proofHash(unsigned),
  };
}

export function scorePatchTournament(
  candidates: PatchCandidate[],
  findings: Finding[] = [],
  executions?: Record<string, PatchExecutionResult>,
): PatchScore[] {
  const findingsById = new Map(findings.map((finding) => [finding.id, finding]));
  return candidates
    .map((candidate) => {
      const score = scorePatchCandidate(candidate, findingsById.get(candidate.findingId));
      const execution = executions?.[candidate.id];
      const eligible = executions ? execution?.eligible === true : true;
      return {
        ...score,
        score: eligible ? score.score : 0,
        checksum: proofHash({
          ...score,
          score: eligible ? score.score : 0,
          executionEligible: eligible,
          executionReason: executions && !eligible ? execution?.disqualifiedReason ?? "missing-execution" : undefined,
          checksum: undefined,
        }),
      };
    })
    .sort((a, b) => b.score - a.score || a.candidateId.localeCompare(b.candidateId))
    .map((score, index) => ({
      ...score,
      rank: index + 1,
      winner: index === 0 && score.score > 0,
      checksum: proofHash({ ...score, rank: index + 1, winner: index === 0 && score.score > 0, checksum: undefined }),
    }));
}

export function buildTournamentReceipt(input: {
  repo?: string;
  findings: Finding[];
  patchCandidates?: PatchCandidate[];
  patchExecutions?: Record<string, PatchExecutionResult>;
  manifest?: BenchmarkManifest;
}): TournamentReceipt {
  const repo = input.repo ?? input.manifest?.repo ?? SEEDED_BENCHMARK_MANIFEST.repo;
  const manifest = input.manifest ?? SEEDED_BENCHMARK_MANIFEST;
  const ledger = buildProofLedger(input.findings, manifest);
  const patchScores = scorePatchTournament(input.patchCandidates ?? [], input.findings, input.patchExecutions);
  const winningPatch = patchScores.find((score) => score.winner);
  const unsigned = {
    repo,
    manifestId: manifest.id,
    ledger,
    patchScores,
    winningPatch,
  };
  const id = `receipt.${proofHash(unsigned).slice(0, 12)}`;
  const handoff = buildTournamentHandoff(id, ledger, patchScores);
  const receipt = {
    id,
    ...unsigned,
    handoff,
  };

  return {
    ...receipt,
    checksum: proofHash(receipt),
  };
}

export function buildFindingHandoff(finding: Finding, ledger: ProofLedger): TournamentHandoff {
  const linkedEntries = ledger.entries.filter((entry) => entry.findingIds.includes(finding.id));
  const summary = linkedEntries.length > 0
    ? `Finding maps to ${linkedEntries.map((entry) => entry.seedId).join(", ")}.`
    : "Finding is outside the seeded benchmark manifest.";

  return {
    title: `Handoff: ${finding.title}`,
    summary,
    checklist: [
      `Confirm ${finding.file}${finding.line ? `:${finding.line}` : ""}`,
      `Preserve evidence: ${finding.evidence ?? finding.description}`,
      "Score candidate patches before applying a fix.",
    ],
    receiptId: ledger.checksum,
  };
}

export function formatTournamentHandoff(receipt: TournamentReceipt): string {
  const patchLine = receipt.winningPatch
    ? `Winning patch: ${receipt.winningPatch.candidateId} (${receipt.winningPatch.score}/100)`
    : "Winning patch: none submitted";
  const checklist = receipt.handoff.checklist.map((item) => `- ${item}`).join("\n");

  return [
    `# ${receipt.handoff.title}`,
    "",
    receipt.handoff.summary,
    "",
    `Receipt: ${receipt.id}`,
    `Ledger: ${receipt.ledger.caught}/${receipt.ledger.caught + receipt.ledger.missed} seeded mistakes caught`,
    patchLine,
    "",
    "## Handoff checklist",
    checklist,
  ].join("\n");
}

export function proofHash(value: unknown): string {
  const input = stableJson(value);
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function withManifestChecksum(manifest: BenchmarkManifest): BenchmarkManifest {
  const unsigned = { ...manifest, checksum: "" };
  return {
    ...manifest,
    checksum: proofHash(unsigned),
  };
}

function buildTournamentHandoff(
  receiptId: string,
  ledger: ProofLedger,
  patchScores: PatchScore[],
): TournamentHandoff {
  const winningPatch = patchScores.find((score) => score.winner);
  return {
    title: "Scout Tournament Receipt",
    summary: `Seeded recall ${ledger.caught}/${ledger.caught + ledger.missed}; ${ledger.extra} extra finding${ledger.extra === 1 ? "" : "s"} tracked separately.`,
    checklist: [
      `Use receipt ${receiptId} as the immutable eval artifact.`,
      `Keep manifest ${ledger.manifestId} at checksum ${ledger.manifestChecksum}.`,
      winningPatch
        ? `Apply only the winning patch candidate ${winningPatch.candidateId} unless a human reviewer overrides it.`
        : "Generate patch candidates before repair handoff.",
      "Do not claim extra findings as seeded benchmark recall.",
    ],
    receiptId,
  };
}

function matchSeed(seed: SeededMistake, finding: Finding): number {
  const haystack = `${finding.file} ${finding.title} ${finding.description} ${finding.evidence ?? ""}`.toLowerCase();
  const fileMatch = normalizePath(seed.file) === normalizePath(finding.file) ? 2 : 0;
  const aspectMatch = seed.aspect === finding.aspect || finding.matchedAgents?.includes(seed.aspect) ? 1 : 0;
  const termMatches = seed.matchTerms.filter((term) => haystack.includes(term.toLowerCase())).length;
  const lineMatch = seed.line && finding.line && Math.abs(seed.line - finding.line) <= 2 ? 1 : 0;
  if (termMatches === 0) return 0;
  return fileMatch + aspectMatch + termMatches + lineMatch;
}

function scoreTargetsFinding(touchedFiles: string[], finding?: Finding): number {
  if (!finding) return touchedFiles.length > 0 ? 10 : 0;
  if (touchedFiles.includes(normalizePath(finding.file))) return 30;
  if (touchedFiles.some((file) => normalizePath(finding.file).endsWith(file) || file.endsWith(normalizePath(finding.file)))) {
    return 22;
  }
  return 6;
}

function scoreRiskRemoval(patchText: string, findingText: string): number {
  const riskTerms = ["redact", "verify", "rate", "bearer", "malformed", "emailhash", "jwt.verify"];
  const matchedRiskTerms = countMatches(`${patchText} ${findingText}`, riskTerms);
  const removesUnsafeFallback = patchText.includes("-  return verifysessiontoken") || patchText.includes("-  return jwt.decode");
  const removesRawEmail = patchText.includes("-  logger.info") && patchText.includes("user.email");
  return clamp(matchedRiskTerms * 5 + (removesUnsafeFallback ? 10 : 0) + (removesRawEmail ? 10 : 0), 0, 30);
}

function scoreScopeControl(touchedFileCount: number, patch: string): number {
  const changedLines = patch.split("\n").filter((line) => line.startsWith("+") || line.startsWith("-")).length;
  if (touchedFileCount === 0) return 0;
  if (touchedFileCount <= 2 && changedLines <= 40) return 20;
  if (touchedFileCount <= 3 && changedLines <= 80) return 14;
  return 8;
}

function scoreRegressionSafety(patchText: string): number {
  const penalty = countMatches(patchText, ["process.env", "dev-secret", "any", "unknown", "map<string, number>"]) * 4
    + (patchText.includes("jwt.decode") ? 10 : 0);
  return clamp(20 - penalty, 0, 20);
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

function isTestFile(file: string): boolean {
  return file.includes(".test.") || file.includes(".spec.") || file.startsWith("test/");
}

function countMatches(haystack: string, needles: string[]): number {
  const normalized = haystack.toLowerCase();
  return needles.filter((needle) => normalized.includes(needle.toLowerCase())).length;
}

function normalizePath(path: string): string {
  return path.replace(/^\.?\//, "").toLowerCase();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}
