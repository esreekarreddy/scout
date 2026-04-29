"use client";

import { useEffect, useState } from "react";
import type { Finding, FixerState } from "@/lib/types";
import { buildLocalPatchTournament, PatchTournament } from "./patch-tournament";
import { TournamentReceipt } from "./tournament-receipt";

/**
 * BETA: 3 parallel fixer agents shown side-by-side. Pick one + copy or
 * (Tier-1 Task 1C) open a real PR.
 *
 * OWNERSHIP: Task 1C should add the auto-PR logic by extending the footer
 * actions only. Everything above the footer is base UI; do not modify.
 */
export function FixModal({
  finding,
  fixers,
  onClose,
}: {
  finding: Finding;
  fixers: FixerState[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const tournament = buildLocalPatchTournament(finding, fixers);
  const winner = tournament.find((score) => score.winner);
  const winnerIndex = winner ? fixers.findIndex((fixer) => fixer.strategy === winner.strategy) : -1;
  const selectedIndex = selected ?? (winnerIndex >= 0 ? winnerIndex : null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  function copySelected() {
    if (selectedIndex === null) return;
    navigator.clipboard.writeText(fixers[selectedIndex].patch);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(17,17,19,0.5)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="anim-fade-up"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          width: "100%",
          maxWidth: 1280,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--blue)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 4,
              }}
            >
              MCP-native patch tournament
            </p>
            <h2 style={{ fontWeight: 700, fontSize: 18 }}>{finding.title}</h2>
            <p style={{ fontSize: 12, color: "var(--ink-2)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
              {finding.file}{finding.line ? `:${finding.line}` : ""} - {finding.confidence}% confidence
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: "6px 14px" }}>
            Close (esc)
          </button>
        </div>

        {/* 3 fixer columns */}
        <div
          className="scroll-thin"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 16,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", gap: 12 }}>
            {fixers.map((fx, idx) => {
              const isSelected = selectedIndex === idx;
              const dotColor: Record<string, string> = {
                idle: "var(--border-strong)",
                running: "var(--blue)",
                done: "var(--green)",
                error: "var(--red)",
              };
              return (
                <div
                  key={fx.strategy}
                  style={{
                    border: `1px solid ${isSelected ? "var(--blue)" : "var(--border)"}`,
                    borderRadius: 10,
                    background: "var(--canvas)",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    transition: "border-color 0.15s",
                    boxShadow: isSelected ? "0 0 0 2px var(--blue-surface)" : "none",
                  }}
                >
                  <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        className={fx.status === "running" ? "pulse-dot" : ""}
                        style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor[fx.status], display: "inline-block" }}
                      />
                      <p style={{ fontWeight: 600, fontSize: 13 }}>{fx.label}</p>
                    </div>
                    <p style={{ fontSize: 11, color: "var(--ink-2)", marginTop: 3 }}>{fx.description}</p>
                  </div>
                  <div className="scroll-thin" style={{ flex: 1, overflow: "auto", padding: "10px 12px", maxHeight: 380, minHeight: 240 }}>
                    {fx.patch ? (
                      <pre style={{ fontSize: 11, lineHeight: 1.5, fontFamily: "var(--font-mono)", color: "var(--ink)", whiteSpace: "pre", margin: 0 }}>
                        {fx.patch}
                      </pre>
                    ) : (
                      <p style={{ fontSize: 12, color: "var(--ink-3)", textAlign: "center", padding: "40px 0" }}>
                        {fx.status === "idle" ? "Queued..." : "Generating patch..."}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setSelected(idx)}
                    disabled={fx.status !== "done"}
                    style={{
                      padding: "10px",
                      border: "none",
                      borderTop: "1px solid var(--border)",
                      background: isSelected ? "var(--blue)" : "transparent",
                      color: isSelected ? "#fff" : "var(--ink-2)",
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: fx.status === "done" ? "pointer" : "not-allowed",
                      opacity: fx.status === "done" ? 1 : 0.4,
                      transition: "background 0.15s",
                    }}
                  >
                    {isSelected ? "Selected" : "Pick this fix"}
                  </button>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
            <PatchTournament finding={finding} fixers={fixers} />
            <TournamentReceipt finding={finding} fixers={fixers} />
          </div>
        </div>

        {/* footer actions - Task 1C extends here */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--border)",
            background: "var(--surface)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <p style={{ fontSize: 12, color: "var(--ink-2)" }}>
            {selectedIndex === null
              ? "Scout will auto-pick the tournament winner once enough patches complete."
              : `Selected: ${fixers[selectedIndex].label} - patch and receipt ready.`}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-ghost" onClick={copySelected} disabled={selectedIndex === null}>
              {copied ? "Copied!" : "Copy patch"}
            </button>
            <button className="btn-primary" disabled={selectedIndex === null} title="Stretch: wire this to GitHub PR creation after the demo loop is stable">
              Receipt-ready diff
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
