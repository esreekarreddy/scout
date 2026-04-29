#!/usr/bin/env node
import { exit, stderr, stdout } from "node:process";
import {
  buildContextBudget,
  buildPromptCacheKey,
  contextUsageTelemetryFromUsage,
  encodeContextUsageTelemetry,
  mergeContextUsageTelemetry,
  parseContextUsageTelemetryLine,
} from "../src/lib/context-budget";
import { buildEvalReport, formatEvalReportMarkdown } from "../src/lib/eval";
import { patchMetadataFromDiff, validateLiveFinding, validateLiveFixerPatch } from "../src/lib/live-schemas";
import { calcEvalScore, judgeFindings } from "../src/lib/judge";
import { calcLiveTargetStats, SCOUT_TARGET_REPO_URL } from "../src/lib/live-target";
import { parseFindingLine } from "../src/lib/prompts";
import { DEMO_REPO_URL, scoutFix, scoutReview } from "../src/lib/scout-runner";
import {
  SEEDED_BENCHMARK_MANIFEST,
  buildProofLedger,
  buildTournamentReceipt,
  formatAgentReceipt,
  formatHandoffForAgent,
  formatTournamentHandoff,
  scorePatchTournament,
} from "../src/lib/tournament";
import type { Finding, PatchCandidate } from "../src/lib/types";

const FIXED_TIME = "2026-04-29T00:00:00.000Z";
const FORBIDDEN_DASH = /[\u2013\u2014]/;
const CREDENTIAL_SHAPE = /\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})\b/;

async function main() {
  await testJudgeDedupeAndEvalScore();
  await testSeededEvalTournamentAndTrace();
  await testExtraFindingsStayOutOfSeededRecall();
  testLiveSchemas();
  testAgentHandoffFormatting();
  testContextBudget();
  testContextUsageTelemetry();
  testStructuredFindingParserAndLiveTargetStats();
  testGeneratedArtifactHygiene();

  stdout.write(JSON.stringify({
    ok: true,
    tests: [
      "judge-dedupe",
      "seeded-eval-tournament-trace",
      "extra-finding-accounting",
      "live-schema-validation",
      "agent-handoff-formatting",
      "context-budget",
      "context-usage-telemetry",
      "structured-live-target-stats",
      "generated-artifact-hygiene",
    ],
  }, null, 2));
  stdout.write("\n");
}

function testStructuredFindingParserAndLiveTargetStats() {
  const parsed = parseFindingLine([
    "FINDING_JSON|",
    JSON.stringify({
      severity: "critical",
      file: "src/audit.ts",
      line: 14,
      title: "Raw email logged despite redaction claim",
      description: "auditTicketCreated logs customerEmail directly even though the comment promises redaction.",
      confidence: 98,
      evidence: "customerEmail: ticket.customerEmail",
    }),
  ].join(""));

  assert(Boolean(parsed), "structured finding parser must accept schema-valid JSON line");
  assert(parsed?.evidence?.includes("customerEmail"), "structured finding parser must preserve evidence");

  const stats = calcLiveTargetStats(SCOUT_TARGET_REPO_URL, [
    {
      ...parsed!,
      id: "target.raw-email",
      aspect: "spec-drift",
      verdict: "confirmed",
    },
  ]);
  assert(stats.enabled, "live target stats must activate for the public target repo URL");
  assert(stats.total === 7, "live target stats must track seven target issues");
  assert(stats.caught >= 1, "live target stats must count matched planted issues");
  assert(stats.missed <= 6, "live target stats must count missed planted issues");
}

async function testJudgeDedupeAndEvalScore() {
  const findings: Finding[] = [
    finding({
      id: "privacy.spec",
      aspect: "spec-drift",
      severity: "critical",
      file: "src/audit.ts",
      line: 5,
      title: "Comment says email is redacted but raw email is logged",
      confidence: 91,
    }),
    finding({
      id: "privacy.test",
      aspect: "test-theater",
      severity: "critical",
      file: "test/auth.test.ts",
      line: 13,
      title: "Telemetry test misses the privacy contract",
      confidence: 86,
    }),
    finding({
      id: "bearer.spec",
      aspect: "spec-drift",
      severity: "warning",
      file: "src/auth.ts",
      line: 5,
      title: "Bearer parser accepts malformed tokens",
      confidence: 83,
    }),
  ];

  const judged = judgeFindings(findings);
  const privacy = judged.find((candidate) => candidate.id === "privacy.spec");
  const bearer = judged.find((candidate) => candidate.id === "bearer.spec");

  assert(judged.length === 2, "judge must dedupe related privacy findings");
  assert(Boolean(privacy), "deduped privacy finding must keep the highest severity lead");
  assert(privacy?.verdict === "confirmed", "cross-agent privacy finding must be confirmed");
  assert(privacy?.matchedAgents?.includes("spec-drift"), "privacy finding must retain spec-drift evidence");
  assert(privacy?.matchedAgents?.includes("test-theater"), "privacy finding must retain test-theater evidence");
  assert((privacy?.confidence ?? 0) > 91, "dedupe must boost confidence when multiple agents agree");
  assert(bearer?.verdict === "speculative", "lower confidence single-agent finding must stay speculative");

  const evalScore = calcEvalScore(findings);
  assert(evalScore.confirmed === 1, "eval score must count confirmed judged groups");
  assert(evalScore.speculative === 1, "eval score must count speculative judged groups");
  assert(evalScore.caught === findings.length, "legacy eval score caught count must use emitted findings");
}

async function testSeededEvalTournamentAndTrace() {
  const review = await scoutReview(DEMO_REPO_URL);
  const patchCandidates = await buildPatchCandidates(review.judgedFindings);
  const report = buildEvalReport({
    repo: DEMO_REPO_URL,
    findings: review.findings,
    patchCandidates,
    manifest: review.manifest,
    generatedAt: FIXED_TIME,
  });

  assert(review.findings.length === 7, "seeded review must emit all seven planted findings");
  assert(review.judgedFindings.length > 0, "seeded review must include judged findings");
  assert(report.metrics.caughtSeeded === 7, "eval report must catch all seeded mistakes");
  assert(report.metrics.missedSeeded === 0, "eval report must not miss seeded mistakes");
  assert(report.metrics.recall === 1, "eval recall must be deterministic 100 percent");
  assert(report.metrics.precision === 1, "eval precision must be deterministic 100 percent");
  assert(report.metrics.criticalRecall === 1, "critical recall must stay at 100 percent");
  assert(report.gates.every((gate) => gate.grade !== "fail"), "seeded eval must not fail hard gates");

  const ledger = buildProofLedger(review.findings, SEEDED_BENCHMARK_MANIFEST);
  assert(ledger.checksum === report.ledger.checksum, "standalone ledger must match report ledger");
  assert(ledger.entries.every((entry) => entry.status === "caught"), "every seeded ledger entry must be caught");

  const scores = scorePatchTournament(patchCandidates, review.findings);
  assert(scores.length === patchCandidates.length, "every patch candidate must receive a score");
  assert(scores[0].winner === true, "top tournament score must be marked winner");
  assert(scores.filter((score) => score.winner).length === 1, "only one tournament patch can win");
  assert(scores[0].rank === 1, "winning patch must have rank one");
  assert(scores[0].score >= 72, "winning patch must meet the default patch threshold");
  assert(scores[0].testFiles.length > 0, "winning patch must include proof in a test file");

  assert(report.receipt.winningPatch?.candidateId === scores[0].candidateId, "receipt must use tournament winner");
  assert(report.receipt.ledger.checksum === report.ledger.checksum, "receipt ledger must match report ledger");
  assert(report.receipt.handoff.receiptId === report.receipt.id, "handoff must point at its receipt id");

  assert(report.trace.mode === "seeded-eval", "trace must record seeded eval mode");
  assert(report.trace.entries.length === 5, "trace must include review, judge, fix, score, and handoff");
  assert(report.trace.checksum === report.traceChecksum, "trace checksum field must match trace checksum");
  report.trace.entries.forEach((entry, index) => {
    assert(entry.index === index + 1, `trace entry ${entry.stage} must have a sequential index`);
    assert(entry.boundary.kind === "deterministic", `trace entry ${entry.stage} must be deterministic`);
    assert(entry.boundary.model === "none", `trace entry ${entry.stage} must not imply a model call`);
    assert(entry.receiptId === report.receipt.id, `trace entry ${entry.stage} must reference the receipt`);
    assert(entry.inputChecksum.length > 0, `trace entry ${entry.stage} must include an input checksum`);
    assert(entry.outputChecksum.length > 0, `trace entry ${entry.stage} must include an output checksum`);
  });
}

async function testExtraFindingsStayOutOfSeededRecall() {
  const review = await scoutReview(DEMO_REPO_URL);
  const extra = finding({
    id: "extra.docs",
    aspect: "spec-drift",
    severity: "info",
    file: "docs/notes.md",
    line: 1,
    title: "Unrelated documentation note",
    description: "This does not match any seeded mistake term.",
    confidence: 97,
  });
  const report = buildEvalReport({
    repo: DEMO_REPO_URL,
    findings: [...review.findings, extra],
    patchCandidates: [],
    manifest: review.manifest,
    thresholds: { maxExtraFindings: 0 },
    generatedAt: FIXED_TIME,
  });
  const extraGate = report.gates.find((gate) => gate.id === "extra-findings");

  assert(report.metrics.caughtSeeded === 7, "extra finding must not reduce caught seeded count");
  assert(report.metrics.extraFindings === 1, "extra finding must be counted separately");
  assert(report.metrics.precision === 0.875, "precision must include extra findings in denominator");
  assert(extraGate?.grade === "warn", "extra finding budget breach must warn rather than inflate recall");
}

function testLiveSchemas() {
  const parsed = validateLiveFinding({
    severity: "critical",
    file: "src/audit.ts",
    line: 5,
    title: "Raw email logged",
    description: "Telemetry includes raw email.",
    confidence: 97,
  });
  assert(parsed.confidence === 97, "live finding schema must preserve valid confidence");

  let rejected = false;
  try {
    validateLiveFinding({
      severity: "critical",
      file: "src/audit.ts",
      title: "Bad confidence",
      description: "Confidence is outside schema.",
      confidence: 1000,
    });
  } catch {
    rejected = true;
  }
  assert(rejected, "live finding schema must reject invalid confidence");

  const metadata = patchMetadataFromDiff({
    findingId: "privacy.finding",
    strategy: "robust",
    patch: [
      "--- a/src/audit.ts",
      "+++ b/src/audit.ts",
      "@@",
      "-logger.info(user.email)",
      "+logger.info(redactEmail(user.email))",
      "--- a/test/auth.test.ts",
      "+++ b/test/auth.test.ts",
      "@@",
      "-expect(logger.info).toHaveBeenCalled()",
      "+expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('ada@example.com'))",
    ].join("\n"),
  });
  assert(metadata.touchedFiles.includes("src/audit.ts"), "patch metadata must include touched source file");
  assert(metadata.testFiles.includes("test/auth.test.ts"), "patch metadata must include touched test file");

  const fixerPatch = validateLiveFixerPatch({
    findingId: "privacy.finding",
    strategy: "robust",
    patch: [
      "--- a/src/audit.ts",
      "+++ b/src/audit.ts",
      "@@",
      "-logger.info(user.email)",
      "+logger.info(redactEmail(user.email))",
    ].join("\n"),
  });
  assert(fixerPatch.strategy === "robust", "fixer patch schema must preserve strategy");

  const newFilePatch = validateLiveFixerPatch({
    findingId: "privacy.finding",
    strategy: "robust",
    patch: [
      "--- /dev/null",
      "+++ b/test/privacy.test.ts",
      "@@",
      "+test('redacts email', () => {",
      "+  expect(redactEmail('ada@example.com')).not.toContain('ada@example.com');",
      "+});",
    ].join("\n"),
  });
  assert(newFilePatch.strategy === "robust", "fixer patch schema must allow new test files");

  let invalidPatchRejected = false;
  try {
    validateLiveFixerPatch({
      findingId: "privacy.finding",
      strategy: "robust",
      patch: "logger.info(redactEmail(user.email))",
    });
  } catch {
    invalidPatchRejected = true;
  }
  assert(invalidPatchRejected, "fixer patch schema must reject non-diff patch text");

  let fencedPatchRejected = false;
  try {
    validateLiveFixerPatch({
      findingId: "privacy.finding",
      strategy: "robust",
      patch: [
        "```diff",
        "--- a/src/audit.ts",
        "+++ b/src/audit.ts",
        "@@",
        "-logger.info(user.email)",
        "+logger.info(redactEmail(user.email))",
        "```",
      ].join("\n"),
    });
  } catch {
    fencedPatchRejected = true;
  }
  assert(fencedPatchRejected, "fixer patch schema must reject fenced patch text");

  let missingHunkRejected = false;
  try {
    validateLiveFixerPatch({
      findingId: "privacy.finding",
      strategy: "robust",
      patch: [
        "--- a/src/audit.ts",
        "+++ b/src/audit.ts",
        "-logger.info(user.email)",
        "+logger.info(redactEmail(user.email))",
      ].join("\n"),
    });
  } catch {
    missingHunkRejected = true;
  }
  assert(missingHunkRejected, "fixer patch schema must reject diffs without hunk headers");

  let mismatchedHeaderRejected = false;
  try {
    validateLiveFixerPatch({
      findingId: "privacy.finding",
      strategy: "robust",
      patch: [
        "--- a/src/audit.ts",
        "+++ b/src/routes.ts",
        "@@",
        "-logger.info(user.email)",
        "+logger.info(redactEmail(user.email))",
      ].join("\n"),
    });
  } catch {
    mismatchedHeaderRejected = true;
  }
  assert(mismatchedHeaderRejected, "fixer patch schema must reject mismatched file headers");
}

function testAgentHandoffFormatting() {
  const privacyFinding = finding({
    id: "privacy.spec",
    aspect: "spec-drift",
    severity: "critical",
    file: "src/audit.ts",
    line: 5,
    title: "Comment says email is redacted but raw email is logged",
    confidence: 98,
  });
  const winningPatch = {
    strategy: "robust" as const,
    label: "Robust",
    score: 91,
    touchedFiles: ["src/audit.ts", "test/auth.test.ts"],
    testFiles: ["test/auth.test.ts"],
    checksum: "abc123",
    patch: [
      "--- a/src/audit.ts",
      "+++ b/src/audit.ts",
      "@@",
      "-logger.info(user.email)",
      "+logger.info(redactEmail(user.email))",
    ].join("\n"),
  };
  const receipt = formatAgentReceipt({
    repo: DEMO_REPO_URL,
    receiptId: "receipt.unit",
    finding: privacyFinding,
    winningPatch,
    modelProfile: "fast",
  });
  const codex = formatHandoffForAgent({
    target: "codex",
    repo: DEMO_REPO_URL,
    receiptId: "receipt.unit",
    finding: privacyFinding,
    winningPatch,
    modelProfile: "fast",
  });
  const claude = formatHandoffForAgent({
    target: "claude-code",
    repo: DEMO_REPO_URL,
    receiptId: "receipt.unit",
    finding: privacyFinding,
    winningPatch,
    modelProfile: "fast",
  });

  assert(receipt.includes("Model profile: Fast profile"), "receipt must include selected model profile");
  assert(receipt.includes("review gpt-5.4-mini"), "receipt must include resolved review model");
  assert(codex.includes("Codex"), "Codex handoff must name Codex");
  assert(claude.includes("Claude Code"), "Claude handoff must name Claude Code");
  assert(codex.includes("receipt.unit"), "agent handoff must preserve receipt id");
  assert(codex.includes("target repo's relevant test command"), "agent handoff must include target repo test guidance");
  assert(codex.includes("```diff"), "agent handoff must include winning patch text");
  assert(!FORBIDDEN_DASH.test(receipt + codex + claude), "agent handoff text must not contain em or en dashes");

  const outcomeHandoff = formatHandoffForAgent({
    target: "codex",
    repo: DEMO_REPO_URL,
    receiptId: "receipt.unit",
    finding: privacyFinding,
    winningPatch,
    modelProfile: "fast",
    patchOutcomes: [
      {
        strategy: "robust",
        label: "Robust",
        score: 91,
        rank: 1,
        winner: true,
        touchedFiles: ["src/audit.ts", "test/auth.test.ts"],
        testFiles: ["test/auth.test.ts"],
        eligible: true,
      },
      {
        strategy: "conservative",
        label: "Conservative",
        score: 0,
        rank: 0,
        touchedFiles: [],
        testFiles: [],
        eligible: false,
        disqualifiedReason: "invalid-patch-schema",
      },
    ],
  });
  assert(outcomeHandoff.includes("Patch tournament results"), "agent handoff must include patch outcome ledger");
  assert(outcomeHandoff.includes("disqualified: invalid-patch-schema"), "agent handoff must include disqualification reason");
}

function testContextBudget() {
  const promptCacheKey = buildPromptCacheKey("review", "hallucination");
  const budget = buildContextBudget({
    repoContext: [
      "// Repo: owner/repo",
      "// Context mode: bounded GitHub tree",
      "// src/audit.ts",
      "export const x = 1;",
      "---",
      "// test/audit.test.ts",
      "expect(x).toBe(1);",
    ].join("\n"),
    model: "gpt-5.4-mini",
    modelProfile: "fast",
    promptCacheKey,
  });

  assert(budget.inspectedFiles === 2, "context budget must count inspected source files");
  assert(budget.estimatedInputTokens > 0, "context budget must estimate input tokens");
  assert(budget.cacheHint.includes("Static scout rules"), "context budget must explain cache posture");
  assert(budget.promptCacheKey === "scout-review-hallucination-v1", "context budget must carry stable prompt cache key");
}

function testContextUsageTelemetry() {
  const telemetry = contextUsageTelemetryFromUsage({
    inputTokens: 2048,
    outputTokens: 300,
    totalTokens: 2348,
    inputTokenDetails: {
      cacheReadTokens: 1024,
      cacheWriteTokens: 0,
      noCacheTokens: 1024,
    },
  });

  assert(telemetry?.measuredInputTokens === 2048, "usage telemetry must read measured input tokens");
  assert(telemetry?.cachedInputTokens === 1024, "usage telemetry must read cached input tokens");
  assert(telemetry?.noCacheTokens === 1024, "usage telemetry must read non-cached input tokens");

  const rawTelemetry = contextUsageTelemetryFromUsage({
    raw: {
      prompt_tokens: 2006,
      completion_tokens: 300,
      total_tokens: 2306,
      prompt_tokens_details: {
        cached_tokens: 1920,
      },
    },
  });

  assert(rawTelemetry?.cachedInputTokens === 1920, "usage telemetry must read provider cached token metadata");

  const line = encodeContextUsageTelemetry(rawTelemetry);
  assert(Boolean(line?.startsWith("SCOUT_USAGE|")), "usage telemetry must encode as a hidden stream line");
  const parsed = parseContextUsageTelemetryLine(line!);
  assert(parsed?.measuredInputTokens === 2006, "usage telemetry must parse hidden stream line");

  const merged = mergeContextUsageTelemetry(
    buildContextBudget({ repoContext: "// src/audit.ts\nexport {}", model: "gpt-5.5", modelProfile: "balanced" }),
    parsed,
  );
  assert(merged?.cachedInputTokens === 1920, "usage telemetry must merge into context budget");
}

function testGeneratedArtifactHygiene() {
  const privacyFinding = finding({
    id: "privacy.spec",
    aspect: "spec-drift",
    severity: "critical",
    file: "src/audit.ts",
    line: 5,
    title: "Comment says email is redacted but raw email is logged",
    confidence: 98,
  });
  const receipt = buildTournamentReceipt({
    repo: DEMO_REPO_URL,
    findings: [privacyFinding],
    manifest: SEEDED_BENCHMARK_MANIFEST,
  });
  const report = buildEvalReport({
    repo: DEMO_REPO_URL,
    findings: [privacyFinding],
    patchCandidates: [],
    manifest: SEEDED_BENCHMARK_MANIFEST,
    generatedAt: FIXED_TIME,
  });
  const artifacts = [
    formatTournamentHandoff(receipt),
    formatEvalReportMarkdown(report),
    JSON.stringify(report.trace),
  ];

  for (const artifact of artifacts) {
    assert(!FORBIDDEN_DASH.test(artifact), "generated artifacts must not contain em or en dashes");
    assert(!CREDENTIAL_SHAPE.test(artifact), "generated artifacts must not contain token-shaped credentials");
    assert(!/wifi\s*(?:password|network|ssid)\s*[:=]/i.test(artifact), "generated artifacts must not contain wifi details");
  }
}

async function buildPatchCandidates(findings: Finding[]): Promise<PatchCandidate[]> {
  const candidates: PatchCandidate[] = [];
  for (const reviewedFinding of findings) {
    const fix = await scoutFix(DEMO_REPO_URL, reviewedFinding);
    candidates.push(...fix.candidates);
  }
  return candidates;
}

function finding(input: {
  id: string;
  aspect: Finding["aspect"];
  severity: Finding["severity"];
  file: string;
  line?: number;
  title: string;
  description?: string;
  confidence: number;
}): Finding {
  return {
    id: input.id,
    aspect: input.aspect,
    severity: input.severity,
    file: input.file,
    line: input.line,
    title: input.title,
    description: input.description ?? `${input.title} in ${input.file}`,
    confidence: input.confidence,
    evidence: "UNIT FIXTURE",
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  exit(1);
});
