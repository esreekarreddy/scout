#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { argv, exit, stderr, stdout } from "node:process";
import { buildEvalReport, formatEvalReportMarkdown } from "../lib/eval";
import { scoutFix, scoutReview, DEMO_REPO_URL } from "../lib/scout-runner";
import type { EvalReport, EvalThresholds } from "../lib/eval";
import type { Finding, PatchCandidate } from "../lib/types";

type OutputFormat = "json" | "markdown" | "summary";

interface CliOptions {
  repo: string;
  format: OutputFormat;
  out?: string;
  assert: boolean;
  generatedAt?: string;
  thresholds: Partial<EvalThresholds>;
}

const HELP = `Scout deterministic eval CLI

Usage:
  scout-eval [--repo demo://ai-written-code-seed] [--format json|markdown|summary] [--out path] [--assert]

Options:
  --repo <repo>                 Repo target. The local deterministic runner supports ${DEMO_REPO_URL}.
  --format <format>             Output format. Defaults to summary.
  --out <path>                  Write output to a file instead of stdout.
  --assert                      Exit non-zero if any hard eval gate fails.
  --generated-at <iso-string>   Include a specific report timestamp.
  --min-recall <number>         Override seeded recall threshold. Defaults to 0.85.
  --min-critical-recall <num>   Override critical recall threshold. Defaults to 1.
  --max-extra-findings <num>    Override extra-finding budget. Defaults to 3.
  --min-patch-score <num>       Override winning patch score threshold. Defaults to 72.
  --help                        Show this help.
`;

async function main() {
  const options = parseArgs(argv.slice(2));
  const review = await scoutReview(options.repo);
  const patchCandidates = await buildPatchCandidates(options.repo, review.judgedFindings);
  const report = buildEvalReport({
    repo: options.repo,
    findings: review.findings,
    patchCandidates,
    manifest: review.manifest,
    thresholds: options.thresholds,
    generatedAt: options.generatedAt,
  });
  const output = formatReport(report, options.format);

  if (options.out) {
    const target = resolve(options.out);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, output);
  } else {
    stdout.write(output);
    stdout.write("\n");
  }

  if (options.assert) {
    const failures = report.gates.filter((gate) => gate.grade === "fail");
    if (failures.length > 0) {
      stderr.write(`Scout eval failed ${failures.length} gate(s): ${failures.map((gate) => gate.id).join(", ")}\n`);
      exit(1);
    }
  }
}

async function buildPatchCandidates(repo: string, findings: Finding[]): Promise<PatchCandidate[]> {
  const candidates: PatchCandidate[] = [];
  for (const finding of findings) {
    const fix = await scoutFix(repo, finding);
    candidates.push(...fix.candidates);
  }
  return candidates;
}

function formatReport(report: EvalReport, format: OutputFormat) {
  if (format === "json") return JSON.stringify(report, null, 2);
  if (format === "markdown") return formatEvalReportMarkdown(report);
  const bestPatch = report.patchDiagnostics.find((diagnostic) => diagnostic.winner);
  const failingGates = report.gates.filter((gate) => gate.grade === "fail");
  return [
    `Scout eval ${report.id}`,
    `Repo: ${report.repo}`,
    `Seeded recall: ${report.metrics.caughtSeeded}/${report.metrics.totalSeeded} (${percent(report.metrics.recall)})`,
    `Critical recall: ${percent(report.metrics.criticalRecall)}`,
    `Precision: ${percent(report.metrics.precision)} (${report.metrics.extraFindings} extra findings)`,
    `Best patch: ${bestPatch ? `${bestPatch.candidateId} ${bestPatch.score}/100` : "none"}`,
    `Gates: ${failingGates.length === 0 ? "pass" : `fail ${failingGates.map((gate) => gate.id).join(", ")}`}`,
    `Trace: ${report.trace.id} (${report.traceChecksum})`,
    `Checksum: ${report.checksum}`,
  ].join("\n");
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    repo: DEMO_REPO_URL,
    format: "summary",
    assert: false,
    thresholds: {},
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      stdout.write(HELP);
      exit(0);
    }
    if (arg === "--assert") {
      options.assert = true;
      continue;
    }

    const next = args[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`${arg} requires a value`);
    index += 1;

    if (arg === "--repo") options.repo = next;
    else if (arg === "--format") options.format = parseFormat(next);
    else if (arg === "--out") options.out = next;
    else if (arg === "--generated-at") options.generatedAt = next;
    else if (arg === "--min-recall") options.thresholds.minRecall = parseNumber(arg, next);
    else if (arg === "--min-critical-recall") options.thresholds.minCriticalRecall = parseNumber(arg, next);
    else if (arg === "--max-extra-findings") options.thresholds.maxExtraFindings = parseNumber(arg, next);
    else if (arg === "--min-patch-score") options.thresholds.minPatchScore = parseNumber(arg, next);
    else throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function parseFormat(value: string): OutputFormat {
  if (value === "json" || value === "markdown" || value === "summary") return value;
  throw new Error("--format must be json, markdown, or summary");
}

function parseNumber(name: string, value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a finite number`);
  return parsed;
}

function percent(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}

main().catch((error) => {
  stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  exit(1);
});
