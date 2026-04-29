#!/usr/bin/env node
import { exit, stderr, stdout } from "node:process";
import { executePatchTournament } from "../src/lib/patch-executor";
import { scorePatchTournament } from "../src/lib/tournament";
import type { Finding, PatchCandidate } from "../src/lib/types";

async function main() {
  const finding = privacyFinding();
  const passing = candidate("privacy.robust", validPrivacyPatch());
  const badContext = candidate("privacy.bad-context", badContextPatch());
  const failingCommand = candidate("privacy.command-fail", validPrivacyPatch());

  const passResult = await executePatchTournament({
    candidates: [passing],
    repoFiles: fixtureFiles(),
    checkCommands: [nodeCheckCommand([
      "const fs = require('fs');",
      "const audit = fs.readFileSync('src/audit.ts', 'utf8');",
      "const test = fs.readFileSync('test/auth.test.ts', 'utf8');",
      "if (!audit.includes('emailHash: redactEmail(user.email)')) throw new Error('missing redacted telemetry');",
      "if (audit.includes('email: user.email')) throw new Error('raw email still logged');",
      "if (!test.includes('ada***@example.com')) throw new Error('missing privacy proof');",
    ])],
  });
  assert(passResult[passing.id]?.eligible === true, "valid patch and passing command must be eligible");
  assert(passResult[passing.id]?.apply.exitCode === 0, "valid patch must apply");
  assert(passResult[passing.id]?.checks.length === 1, "valid patch must run the requested check");

  const applyFailure = await executePatchTournament({
    candidates: [badContext],
    repoFiles: fixtureFiles(),
    checkCommands: [nodeCheckCommand(["throw new Error('must not run')"])],
  });
  assert(applyFailure[badContext.id]?.eligible === false, "bad patch context must be ineligible");
  assert(applyFailure[badContext.id]?.disqualifiedReason === "apply-failed", "bad context must fail at apply gate");
  assert(applyFailure[badContext.id]?.checks.length === 0, "checks must not run after apply failure");

  const commandFailure = await executePatchTournament({
    candidates: [failingCommand],
    repoFiles: fixtureFiles(),
    checkCommands: [nodeCheckCommand(["process.exit(7);"])],
  });
  assert(commandFailure[failingCommand.id]?.eligible === false, "failed command must make patch ineligible");
  assert(commandFailure[failingCommand.id]?.disqualifiedReason === "check-failed", "failed command must fail at check gate");
  assert(commandFailure[failingCommand.id]?.checks[0]?.exitCode === 7, "failed check summary must retain exit code");

  const scores = scorePatchTournament([passing, badContext, failingCommand], [finding], {
    ...passResult,
    ...applyFailure,
    ...commandFailure,
  });
  const winner = scores.find((score) => score.winner);
  assert(winner?.candidateId === passing.id, "only the eligible passing candidate can win");
  assert(scores.find((score) => score.candidateId === badContext.id)?.score === 0, "apply-failed candidate must score zero");
  assert(scores.find((score) => score.candidateId === failingCommand.id)?.score === 0, "check-failed candidate must score zero");

  stdout.write(JSON.stringify({
    ok: true,
    tests: [
      "patch-applies-and-commands-pass",
      "failed-apply-disqualifies",
      "failed-command-disqualifies",
      "execution-results-affect-ranking",
    ],
  }, null, 2));
  stdout.write("\n");
}

function privacyFinding(): Finding {
  return {
    id: "privacy.finding",
    aspect: "spec-drift",
    severity: "critical",
    file: "src/audit.ts",
    line: 5,
    title: "Comment says email is redacted but raw email is logged",
    description: "Login telemetry must not include raw user email addresses.",
    confidence: 98,
    evidence: "UNIT FIXTURE",
    verdict: "confirmed",
  };
}

function candidate(id: string, patch: string): PatchCandidate {
  return {
    id,
    findingId: "privacy.finding",
    strategy: id.includes("robust") || id.includes("command") ? "robust" : "conservative",
    patch,
  };
}

function fixtureFiles() {
  return [
    {
      path: "src/audit.ts",
      content: [
        "type User = { id: string; email: string };",
        "",
        "export function logLogin(user: User, logger = console) {",
        "  // Redacts email before writing login telemetry.",
        "  logger.info(\"login\", { userId: user.id, email: user.email });",
        "}",
        "",
      ].join("\n"),
    },
    {
      path: "test/auth.test.ts",
      content: [
        "import { describe, expect, it, vi } from \"vitest\";",
        "import { logLogin } from \"../src/audit\";",
        "",
        "describe(\"auth\", () => {",
        "  it(\"logs login telemetry\", () => {",
        "    const logger = { info: vi.fn() };",
        "    logLogin({ id: \"u_1\", email: \"ada@example.com\" }, logger as any);",
        "    expect(logger.info).toHaveBeenCalled();",
        "  });",
        "});",
        "",
      ].join("\n"),
    },
  ];
}

function validPrivacyPatch() {
  return [
    "diff --git a/src/audit.ts b/src/audit.ts",
    "--- a/src/audit.ts",
    "+++ b/src/audit.ts",
    "@@ -1,6 +1,12 @@",
    " type User = { id: string; email: string };",
    "+",
    "+function redactEmail(email: string) {",
    "+  const [name, domain] = email.split(\"@\");",
    "+  if (!name || !domain) return \"[redacted]\";",
    "+  return `${name.slice(0, 3)}***@${domain}`;",
    "+}",
    " ",
    " export function logLogin(user: User, logger = console) {",
    "   // Redacts email before writing login telemetry.",
    "-  logger.info(\"login\", { userId: user.id, email: user.email });",
    "+  logger.info(\"login\", { userId: user.id, emailHash: redactEmail(user.email) });",
    " }",
    "diff --git a/test/auth.test.ts b/test/auth.test.ts",
    "--- a/test/auth.test.ts",
    "+++ b/test/auth.test.ts",
    "@@ -5,6 +5,9 @@ describe(\"auth\", () => {",
    "   it(\"logs login telemetry\", () => {",
    "     const logger = { info: vi.fn() };",
    "     logLogin({ id: \"u_1\", email: \"ada@example.com\" }, logger as any);",
    "-    expect(logger.info).toHaveBeenCalled();",
    "+    expect(logger.info).toHaveBeenCalledWith(\"login\", {",
    "+      userId: \"u_1\",",
    "+      emailHash: \"ada***@example.com\",",
    "+    });",
    "   });",
    " });",
  ].join("\n");
}

function badContextPatch() {
  return [
    "--- a/src/audit.ts",
    "+++ b/src/audit.ts",
    "@@",
    "-  logger.info('missing context');",
    "+  logger.info('fixed');",
  ].join("\n");
}

function nodeCheckCommand(statements: string[]) {
  return `${process.execPath} -e "${statements.join(" ").replaceAll("\"", "\\\"")}"`;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  exit(1);
});
