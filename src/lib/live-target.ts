import type { Aspect, Finding, SeededMistake } from "./types";

export const SCOUT_TARGET_REPO_URL = "https://github.com/esreekarreddy/scout-target-repo";

export const LIVE_TARGET_MISTAKES: SeededMistake[] = [
  {
    id: "target.fake-token-package",
    aspect: "hallucination",
    severity: "critical",
    file: "src/auth.ts",
    line: 1,
    title: "Fake token package import",
    contract: "Auth must not depend on undeclared packages.",
    matchTerms: ["secure-token-kit", "package", "dependency", "fake"],
  },
  {
    id: "target.malformed-token-accepted",
    aspect: "spec-drift",
    severity: "critical",
    file: "src/auth.ts",
    line: 13,
    title: "Malformed bearer token accepted",
    contract: "Malformed bearer tokens must be rejected after verification fails.",
    matchTerms: ["malformed", "fallback", "bearer", "token.includes"],
  },
  {
    id: "target.raw-email-logged",
    aspect: "spec-drift",
    severity: "critical",
    file: "src/audit.ts",
    line: 14,
    title: "Raw email logged despite redaction claim",
    contract: "Raw customer emails must not be written to logs.",
    matchTerms: ["raw email", "customeremail", "redact", "privacy"],
  },
  {
    id: "target.rate-limit-stub",
    aspect: "spec-drift",
    severity: "warning",
    file: "src/rate-limit.ts",
    line: 6,
    title: "Rate limit always allows requests",
    contract: "Rate limiting must enforce a deny path.",
    matchTerms: ["rate limit", "allowed: true", "always allows", "remaining"],
  },
  {
    id: "target.route-misses-rate-limit",
    aspect: "spec-drift",
    severity: "warning",
    file: "src/tickets.ts",
    line: 15,
    title: "Ticket route never checks rate limit",
    contract: "README rate-limit claim must be enforced in ticket creation.",
    matchTerms: ["rate limit", "checkratelimit", "tickets", "readme"],
  },
  {
    id: "target.truthy-auth-test",
    aspect: "test-theater",
    severity: "warning",
    file: "test/auth.test.ts",
    line: 9,
    title: "Auth test accepts fake token with toBeTruthy",
    contract: "Auth tests must prove malformed tokens are rejected.",
    matchTerms: ["tobetruthy", "fake token", "aaa.bbb.ccc", "malformed"],
  },
  {
    id: "target.audit-test-misses-email",
    aspect: "test-theater",
    severity: "critical",
    file: "test/audit.test.ts",
    line: 14,
    title: "Audit test does not prove email redaction",
    contract: "Privacy tests must assert raw email is absent from log fields.",
    matchTerms: ["tohavebeencalled", "ada@example.com", "raw email", "redaction"],
  },
];

export interface LiveTargetStats {
  enabled: boolean;
  total: number;
  caught: number;
  missed: number;
  confirmed: number;
  likely: number;
  speculative: number;
  matchedIds: string[];
  missedIds: string[];
}

export function isScoutTargetRepo(repo: string) {
  const normalized = repo.trim().replace(/\.git$/, "").toLowerCase();
  return normalized === SCOUT_TARGET_REPO_URL
    || normalized === `${SCOUT_TARGET_REPO_URL}.git`
    || normalized.endsWith("/esreekarreddy/scout-target-repo");
}

export function calcLiveTargetStats(repo: string, findings: Finding[]): LiveTargetStats {
  if (!isScoutTargetRepo(repo)) {
    return {
      enabled: false,
      total: 0,
      caught: 0,
      missed: 0,
      confirmed: 0,
      likely: 0,
      speculative: 0,
      matchedIds: [],
      missedIds: [],
    };
  }

  const matchedIds: string[] = [];
  const missedIds: string[] = [];

  for (const mistake of LIVE_TARGET_MISTAKES) {
    const matched = findings.some((finding) => scoreTargetMatch(mistake, finding) >= 3);
    if (matched) matchedIds.push(mistake.id);
    else missedIds.push(mistake.id);
  }

  return {
    enabled: true,
    total: LIVE_TARGET_MISTAKES.length,
    caught: matchedIds.length,
    missed: missedIds.length,
    confirmed: findings.filter((finding) => finding.verdict === "confirmed").length,
    likely: findings.filter((finding) => finding.verdict === "likely").length,
    speculative: findings.filter((finding) => finding.verdict === "speculative").length,
    matchedIds,
    missedIds,
  };
}

function scoreTargetMatch(seed: SeededMistake, finding: Finding) {
  const haystack = `${finding.file} ${finding.title} ${finding.description} ${finding.evidence ?? ""}`.toLowerCase();
  const fileMatch = normalize(seed.file) === normalize(finding.file) ? 2 : 0;
  const aspectMatch = seed.aspect === finding.aspect || finding.matchedAgents?.includes(seed.aspect as Aspect) ? 1 : 0;
  const termMatches = seed.matchTerms.filter((term) => haystack.includes(term.toLowerCase())).length;
  const lineMatch = seed.line && finding.line && Math.abs(seed.line - finding.line) <= 3 ? 1 : 0;
  if (termMatches === 0) return 0;
  return fileMatch + aspectMatch + termMatches + lineMatch;
}

function normalize(path: string) {
  return path.replace(/^\.?\//, "").toLowerCase();
}
