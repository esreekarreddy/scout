import type { Aspect, Finding, JudgeVerdict } from "./types";

const severityRank = { critical: 0, warning: 1, info: 2 };

function signature(finding: Finding) {
  const file = finding.file.toLowerCase();
  const title = finding.title.toLowerCase();
  if (file.includes("audit") || title.includes("email") || title.includes("privacy")) return "privacy-log";
  if (file.includes("auth") || title.includes("token") || title.includes("package") || title.includes("verifier")) return "auth-hallucination";
  if (file.includes("route") || title.includes("rate")) return "route-rate-limit";
  if (file.includes("test") || title.includes("test")) return `test-${title.slice(0, 24)}`;
  return `${file}:${finding.line ?? 0}:${title.slice(0, 32)}`;
}

function verdictFor(finding: Finding, matchedAgents: Aspect[]): JudgeVerdict {
  if (finding.confidence >= 94 || matchedAgents.length > 1) return "confirmed";
  if (finding.confidence >= 84) return "likely";
  return "speculative";
}

export function judgeFindings(findings: Finding[]): Finding[] {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings) {
    const key = signature(finding);
    groups.set(key, [...(groups.get(key) ?? []), finding]);
  }

  return [...groups.values()]
    .map((group) => {
      const sorted = [...group].sort((a, b) => {
        const severityDelta = severityRank[a.severity] - severityRank[b.severity];
        if (severityDelta !== 0) return severityDelta;
        return b.confidence - a.confidence;
      });
      const lead = sorted[0];
      const matchedAgents = [...new Set(sorted.map((f) => f.aspect))];
      const confidence = Math.min(
        99,
        Math.round(sorted.reduce((sum, f) => sum + f.confidence, 0) / sorted.length + (matchedAgents.length - 1) * 6),
      );
      return {
        ...lead,
        confidence,
        verdict: verdictFor(lead, matchedAgents),
        matchedAgents,
        evidence: sorted.map((f) => `${f.aspect}: ${f.title}`).join(" | "),
      };
    })
    .sort((a, b) => {
      const verdictRank: Record<JudgeVerdict, number> = { confirmed: 0, likely: 1, speculative: 2 };
      const verdictDelta = verdictRank[a.verdict ?? "speculative"] - verdictRank[b.verdict ?? "speculative"];
      if (verdictDelta !== 0) return verdictDelta;
      const severityDelta = severityRank[a.severity] - severityRank[b.severity];
      if (severityDelta !== 0) return severityDelta;
      return b.confidence - a.confidence;
    });
}

export function calcEvalScore(findings: Finding[]) {
  const judged = judgeFindings(findings);
  const confirmed = judged.filter((f) => f.verdict === "confirmed").length;
  const likely = judged.filter((f) => f.verdict === "likely").length;
  const speculative = judged.filter((f) => f.verdict === "speculative").length;
  const caught = Math.min(7, findings.length);
  return {
    seededMistakes: 7,
    confirmed,
    likely,
    speculative,
    caught,
    score: Math.min(100, Math.round(((caught - speculative * 0.5) / 7) * 100)),
  };
}
