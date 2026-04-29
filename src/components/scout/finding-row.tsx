"use client";

import { useState } from "react";
import type { Finding } from "@/lib/types";

/**
 * One row in the global findings feed. Expandable to show description +
 * "Spawn 3 fix agents" CTA. Owned by base.
 */
export function FindingRow({
  finding,
  onFix,
}: {
  finding: Finding;
  onFix: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="row-button"
        style={{
          padding: "14px 20px",
          cursor: "pointer",
          transition: "background 0.12s",
          width: "100%",
          border: "none",
          background: "transparent",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className={`badge badge-${finding.severity}`}>{finding.severity}</span>
          <p style={{ fontWeight: 600, fontSize: 14, flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{finding.title}</p>
          <span style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
            {finding.verdict ?? "raw"} · {finding.confidence}%
          </span>
          <span style={{ fontSize: 11, color: "var(--ink-3)", marginLeft: 8 }}>{open ? "▲" : "▼"}</span>
        </div>
        <p style={{ fontSize: 12, color: "var(--ink-2)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
          {finding.file}{finding.line ? `:${finding.line}` : ""}
          <span style={{ marginLeft: 12, fontFamily: "var(--font-ui)" }}>· {finding.aspect}</span>
          {finding.matchedAgents && finding.matchedAgents.length > 1 && (
            <span style={{ marginLeft: 12, fontFamily: "var(--font-ui)", color: "var(--green)" }}>
              · corroborated by {finding.matchedAgents.length} agents
            </span>
          )}
        </p>
      </button>
      {open && (
        <div style={{ padding: "0 20px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
          <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6, flex: 1 }}>
            {finding.description}
          </p>
          <button
            className="btn-primary"
            style={{ flexShrink: 0, padding: "8px 14px", fontSize: 13 }}
            onClick={(e) => { e.stopPropagation(); onFix(); }}
          >
            Spawn 3 fix agents →
          </button>
        </div>
      )}
    </div>
  );
}
