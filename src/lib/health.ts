import type { Finding } from "./types";

/**
 * Health score: starts at 100, each finding deducts a confidence-weighted
 * penalty based on severity. Pure function - no React, no DOM.
 */
export function calcHealth(findings: Finding[]): number {
  if (findings.length === 0) return 100;
  const penalty = findings.reduce((acc, f) => {
    const sev = f.severity === "critical" ? 15 : f.severity === "warning" ? 6 : 2;
    return acc + sev * (f.confidence / 100);
  }, 0);
  return Math.max(0, Math.round(100 - penalty));
}

export function healthColor(score: number): string {
  if (score >= 80) return "var(--green)";
  if (score >= 50) return "var(--amber)";
  return "var(--red)";
}

export function healthLabel(score: number): string {
  if (score >= 80) return "Healthy";
  if (score >= 50) return "Fair";
  return "At risk";
}
