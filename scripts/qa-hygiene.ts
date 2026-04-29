#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { exit, stderr, stdout } from "node:process";

type Finding = {
  file: string;
  line: number;
  reason: string;
  sample: string;
};

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const EXCLUDED_FILES = new Set([
  "pnpm-lock.yaml",
  "skills-lock.json",
]);

const SECRET_PATTERNS: Array<{ reason: string; pattern: RegExp }> = [
  { reason: "OpenAI-style API key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { reason: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g },
  { reason: "npm token", pattern: /\bnpm_[A-Za-z0-9]{20,}\b/g },
  { reason: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { reason: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { reason: "private key block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
];

const SENSITIVE_ASSIGNMENT = /\b([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD|PASS|SSID|WIFI)[A-Z0-9_]*)\s*(?:=|:\s*["'])\s*["']?([^"'\s#]+)["']?/g;
const PLACEHOLDER_VALUE = /^(your_|your-|example|placeholder|optional|demo|test|changeme|<.*>|\$\{.*\}|xxx+|redacted|dummy)/i;
const FORBIDDEN_DASH = new RegExp("[\\u2014\\u2013]");
const ALLOWED_SENTINELS = new Set([
  "dev-secret",
  "your_openai_key",
  "your_optional_github_token",
]);

function main() {
  const files = trackedTextFiles();
  const findings = [
    ...findTypographyFindings(files),
    ...findSecretFindings(files),
    ...findWifiFindings(files),
  ];

  if (findings.length > 0) {
    for (const finding of findings) {
      stderr.write(`${finding.file}:${finding.line} ${finding.reason}: ${finding.sample}\n`);
    }
    throw new Error(`hygiene check failed with ${findings.length} finding(s)`);
  }

  stdout.write(JSON.stringify({
    ok: true,
    scannedFiles: files.length,
    checks: ["em-or-en-dash", "secret-patterns", "wifi-details"],
  }, null, 2));
  stdout.write("\n");
}

function trackedTextFiles() {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean)
    .filter((file) => !EXCLUDED_FILES.has(file))
    .filter((file) => TEXT_EXTENSIONS.has(extname(file)));
}

function findTypographyFindings(files: string[]): Finding[] {
  const findings: Finding[] = [];
  forEachLine(files, (file, line, lineNumber) => {
    if (FORBIDDEN_DASH.test(line)) {
      findings.push({
        file,
        line: lineNumber,
        reason: "em or en dash",
        sample: trimSample(line),
      });
    }
  });
  return findings;
}

function findSecretFindings(files: string[]): Finding[] {
  const findings: Finding[] = [];
  forEachLine(files, (file, line, lineNumber) => {
    for (const { reason, pattern } of SECRET_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(line)) {
        findings.push({ file, line: lineNumber, reason, sample: trimSample(line) });
      }
    }

    SENSITIVE_ASSIGNMENT.lastIndex = 0;
    for (const match of line.matchAll(SENSITIVE_ASSIGNMENT)) {
      const value = match[2];
      if (isAllowedSensitiveValue(value)) continue;
      findings.push({
        file,
        line: lineNumber,
        reason: `sensitive value assigned to ${match[1]}`,
        sample: trimSample(line),
      });
    }
  });
  return findings;
}

function findWifiFindings(files: string[]): Finding[] {
  const findings: Finding[] = [];
  forEachLine(files, (file, line, lineNumber) => {
    const lower = line.toLowerCase();
    if (!lower.includes("wifi") && !lower.includes("wi-fi") && !lower.includes("ssid")) return;
    if (!/(password|passcode|network|ssid)\s*[:=]/i.test(line)) return;
    findings.push({
      file,
      line: lineNumber,
      reason: "possible wifi detail",
      sample: trimSample(line),
    });
  });
  return findings;
}

function forEachLine(files: string[], callback: (file: string, line: string, lineNumber: number) => void) {
  for (const file of files) {
    const contents = readFileSync(file, "utf8");
    contents.split(/\r?\n/).forEach((line, index) => callback(file, line, index + 1));
  }
}

function isAllowedSensitiveValue(value: string) {
  return PLACEHOLDER_VALUE.test(value) || ALLOWED_SENTINELS.has(value);
}

function trimSample(line: string) {
  return line.trim().slice(0, 160);
}

try {
  main();
} catch (error) {
  stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  exit(1);
}
