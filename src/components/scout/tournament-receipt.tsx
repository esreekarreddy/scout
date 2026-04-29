"use client";

import { useState } from "react";
import type { Finding, FixerState } from "@/lib/types";
import { buildLocalPatchTournament } from "./patch-tournament";

function receiptId(finding: Finding, winnerStrategy: string) {
  const raw = `${finding.id}:${finding.file}:${winnerStrategy}`;
  let hash = 2166136261;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `receipt-${(hash >>> 0).toString(16)}`;
}

export function TournamentReceipt({
  finding,
  fixers,
}: {
  finding: Finding;
  fixers: FixerState[];
}) {
  const [copied, setCopied] = useState(false);
  const scores = buildLocalPatchTournament(finding, fixers);
  const winner = scores.find((score) => score.winner);
  const completed = scores.filter((score) => score.status === "done").length;
  const id = receiptId(finding, winner?.strategy ?? "pending");
  const checklist = [
    finding.verdict === "confirmed" ? "Finding confirmed by judge layer" : "Finding carried forward with fallback verdict",
    winner ? `${winner.label} ranked first by tournament scorer` : "Patch ranking pending",
    winner?.testFiles.length ? "Winning patch includes test proof" : "Test proof still needs review",
    winner ? `${winner.touchedFiles.length || 0} touched file(s) captured for handoff` : "Touched files pending",
  ];
  const receiptText = [
    `Scout Tournament Receipt: ${id}`,
    `Finding: ${finding.title}`,
    `Location: ${finding.file}${finding.line ? `:${finding.line}` : ""}`,
    `Verdict: ${finding.verdict ?? "pending"}`,
    `Winner: ${winner ? winner.label : "pending"}`,
    `Score: ${winner ? `${winner.score}/100` : "pending"}`,
    `Touched files: ${winner?.touchedFiles.length ? winner.touchedFiles.join(", ") : "pending"}`,
    `Test proof: ${winner?.testFiles.length ? winner.testFiles.join(", ") : "pending"}`,
    "Deterministic: verdict grouping, touched files, score, receipt id.",
    "Model-generated: candidate patch text and explanation.",
  ].join("\n");

  function copyReceipt() {
    void navigator.clipboard.writeText(receiptText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <section className="card" style={{ padding: "16px 18px", borderRadius: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <p style={{ fontWeight: 800, fontSize: 14 }}>Tournament Receipt</p>
          <p style={{ color: "var(--ink-2)", fontSize: 12, marginTop: 3 }}>
            Compact handoff for Codex, a PR description, or a reviewer. It separates deterministic proof from model-written patch text.
          </p>
        </div>
        <div style={{ display: "grid", justifyItems: "end", gap: 8 }}>
          <p style={{ fontFamily: "var(--font-mono)", color: "var(--ink-3)", fontSize: 11, textAlign: "right" }}>
            {id}
          </p>
          <button className="btn-ghost" type="button" onClick={copyReceipt} style={{ padding: "5px 10px", fontSize: 12 }}>
            {copied ? "Copied" : "Copy receipt"}
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
        }}
      >
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, background: "var(--canvas)" }}>
          <p style={{ color: "var(--ink-3)", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>Finding</p>
          <p style={{ marginTop: 5, fontWeight: 700, fontSize: 12, overflowWrap: "anywhere" }}>{finding.title}</p>
        </div>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, background: "var(--canvas)" }}>
          <p style={{ color: "var(--ink-3)", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>Winner</p>
          <p style={{ marginTop: 5, fontWeight: 800, fontSize: 16, color: winner ? "var(--green)" : "var(--ink-3)" }}>
            {winner ? winner.label : "Pending"}
          </p>
        </div>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, background: "var(--canvas)" }}>
          <p style={{ color: "var(--ink-3)", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>Patch score</p>
          <p style={{ marginTop: 5, fontWeight: 800, fontSize: 16 }}>{winner ? winner.score : "-"}</p>
        </div>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, background: "var(--canvas)" }}>
          <p style={{ color: "var(--ink-3)", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>Completed</p>
          <p style={{ marginTop: 5, fontWeight: 800, fontSize: 16 }}>{completed}/{scores.length}</p>
        </div>
      </div>

      <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
        {checklist.map((item, index) => (
          <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                border: "1px solid var(--border)",
                background: index <= 1 && winner ? "var(--green-surface)" : "var(--surface)",
                color: index <= 1 && winner ? "var(--green)" : "var(--ink-3)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 900,
                flexShrink: 0,
              }}
            >
              {index + 1}
            </span>
            <p style={{ color: "var(--ink-2)", fontSize: 12, lineHeight: 1.45 }}>{item}</p>
          </div>
        ))}
      </div>

      <pre
        className="scroll-thin"
        style={{
          marginTop: 14,
          whiteSpace: "pre-wrap",
          overflow: "auto",
          maxHeight: 170,
          border: "1px solid var(--border)",
          borderRadius: 8,
          background: "var(--canvas)",
          padding: 12,
          color: "var(--ink-2)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          lineHeight: 1.55,
        }}
      >
        {receiptText}
      </pre>
    </section>
  );
}
