"use client";

import type { Finding } from "@/lib/types";
import { FindingRow } from "./finding-row";

/**
 * Collated feed of all findings across all agents, sorted by severity.
 * Future Tier-1 Task 1B (Judge) should consume the same list and decorate
 * each FindingRow with judge-confidence scores; do that via FindingRow
 * props - not by modifying this list logic.
 */
export function FindingFeed({
  findings,
  onFix,
}: {
  findings: Finding[];
  onFix: (f: Finding) => void;
}) {
  if (findings.length === 0) return null;

  const sorted = [...findings].sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <p style={{ fontWeight: 600, fontSize: 14 }}>Findings</p>
        <p style={{ fontSize: 12, color: "var(--ink-2)" }}>
          {findings.length} total · click any row to fix
        </p>
      </div>
      {sorted.map((f) => (
        <FindingRow key={f.id} finding={f} onFix={() => onFix(f)} />
      ))}
    </div>
  );
}
