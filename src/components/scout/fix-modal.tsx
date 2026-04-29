"use client";

import { useEffect, useState } from "react";
import type { Finding, FixerState, PatchExecutionSummary, PatchScore, ScoutModelProfile } from "@/lib/types";
import { buildLocalPatchTournament, buildServerPatchTournament, PatchTournament } from "./patch-tournament";
import { TournamentReceipt } from "./tournament-receipt";

/**
 * BETA: 3 parallel fixer agents shown side-by-side. Pick one + copy or
 * (Tier-1 Task 1C) open a real PR.
 *
 * OWNERSHIP: Task 1C should add the auto-PR logic by extending the footer
 * actions only. Everything above the footer is base UI; do not modify.
 */
export function FixModal({
  repo,
  finding,
  fixers,
  modelProfile,
  onClose,
}: {
  repo: string;
  finding: Finding;
  fixers: FixerState[];
  modelProfile: ScoutModelProfile;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [serverScores, setServerScores] = useState<PatchScore[]>([]);
  const [executions, setExecutions] = useState<PatchExecutionSummary[]>([]);
  const [executionMode, setExecutionMode] = useState<string>("local-score");
  const [proofExecution, setProofExecution] = useState<PatchExecutionSummary | null>(null);
  const [proofRunning, setProofRunning] = useState(false);
  const serverScoringSettled = executionMode !== "local-score";
  const tournament = serverScoringSettled
    ? buildServerPatchTournament(fixers, serverScores, executions)
    : buildLocalPatchTournament(finding, fixers);
  const winner = tournament.find((score) => score.winner);
  const noEligiblePatch = serverScoringSettled
    && tournament.length > 0
    && !tournament.some((score) => score.status === "done" && score.score > 0);
  const winnerIndex = winner ? fixers.findIndex((fixer) => fixer.strategy === winner.strategy) : -1;
  const selectedIndex = selected ?? (winnerIndex >= 0 ? winnerIndex : null);
  const selectedFixer = selectedIndex === null ? undefined : fixers[selectedIndex];
  const selectedRow = selectedFixer ? tournament.find((score) => score.strategy === selectedFixer.strategy) : undefined;
  const selectedEligible = Boolean(selectedRow && selectedRow.status === "done" && selectedRow.score > 0);
  const footerMessage = noEligiblePatch
    ? "Scout rejected every completed patch. Regenerate fixes before handing this back to an agent."
    : selectedIndex === null
      ? "Scout will auto-pick the tournament winner once enough patches complete."
      : !selectedEligible
        ? "Selected patch is not eligible. Pick an eligible patch or regenerate fixes."
      : `Selected: ${fixers[selectedIndex].label} - patch and receipt ready.`;

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    const completed = fixers.filter((fixer) => fixer.status === "done" && fixer.patch.trim().length > 0);
    if (completed.length === 0 || completed.length !== fixers.length) return;

    let cancelled = false;
    async function scoreServerSide() {
      try {
        const res = await fetch("/api/score-patches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repo, finding, fixers }),
        });
        if (!res.ok) return;
        const payload = (await res.json()) as {
          scores?: PatchScore[];
          executions?: PatchExecutionSummary[];
          mode?: string;
        };
        if (cancelled) return;
        setServerScores(payload.scores ?? []);
        setExecutions(payload.executions ?? []);
        setExecutionMode(payload.mode ?? "score-only");
      } catch {
        if (!cancelled) setExecutionMode("local-score");
      }
    }
    void scoreServerSide();

    return () => {
      cancelled = true;
    };
  }, [repo, finding, fixers]);

  function copySelected() {
    if (selectedIndex === null || !selectedEligible) return;
    navigator.clipboard.writeText(fixers[selectedIndex].patch);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function runDisqualificationProof() {
    setProofRunning(true);
    try {
      const res = await fetch("/api/score-patches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo,
          finding,
          fixers: [{
            strategy: "conservative",
            label: "Malformed proof",
            description: "Deliberately malformed patch used to prove the execution gate rejects bad repairs.",
            status: "done",
            patch: [
              "*** Begin Patch",
              "*** Update File: src/audit.ts",
              "-customerEmail: ticket.customerEmail,",
              "+customerEmail: redactEmail(ticket.customerEmail),",
              "*** End Patch",
            ].join("\n"),
          }],
        }),
      });
      const payload = (await res.json()) as { executions?: PatchExecutionSummary[] };
      setProofExecution(payload.executions?.[0] ?? {
        candidateId: "proof.invalid-patch",
        eligible: false,
        applySummary: "Patch gate returned no execution proof.",
        checkSummaries: [],
        disqualifiedReason: "invalid-patch-schema",
      });
    } catch (error) {
      setProofExecution({
        candidateId: "proof.invalid-patch",
        eligible: false,
        applySummary: error instanceof Error ? error.message : "Could not run proof.",
        checkSummaries: [],
        disqualifiedReason: "invalid-patch-schema",
      });
    } finally {
      setProofRunning(false);
    }
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
                      <p
                        style={{
                          fontSize: 12,
                          color: fx.status === "error" ? "var(--red)" : "var(--ink-3)",
                          textAlign: "center",
                          padding: "40px 0",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {fx.status === "idle"
                          ? "Queued..."
                          : fx.status === "error"
                            ? fx.errorMessage ?? "Patch generation failed."
                            : "Generating patch..."}
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
            <PatchTournament
              finding={finding}
              fixers={fixers}
              serverScores={serverScores}
              executions={executions}
              executionMode={executionMode}
              serverScoringSettled={serverScoringSettled}
            />
            {executions.length > 0 && (
              <section className="card" style={{ padding: "14px 16px", borderRadius: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
                  <div>
                    <p style={{ fontWeight: 800, fontSize: 14 }}>Patch execution gate</p>
                    <p style={{ color: "var(--ink-2)", fontSize: 12, marginTop: 3 }}>
                      Scout applied each patch in a temporary workspace before ranking it.
                    </p>
                  </div>
                  <p style={{ fontFamily: "var(--font-mono)", color: "var(--ink-3)", fontSize: 11 }}>{executionMode}</p>
                </div>
                <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                  {executions.map((execution) => (
                    <div key={execution.candidateId} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, background: execution.eligible ? "var(--green-surface)" : "var(--red-surface)" }}>
                      <p style={{ fontWeight: 800, fontSize: 12, overflowWrap: "anywhere" }}>{execution.candidateId}</p>
                      <p style={{ color: execution.eligible ? "var(--green)" : "var(--red)", fontSize: 12, marginTop: 3 }}>
                        {execution.eligible ? "eligible" : `disqualified: ${execution.disqualifiedReason ?? "unknown"}`}
                      </p>
                      <p style={{ color: "var(--ink-2)", fontSize: 11, marginTop: 5, fontFamily: "var(--font-mono)", whiteSpace: "pre-wrap" }}>
                        {execution.applySummary}
                      </p>
                    </div>
                  ))}
                  <div style={{ border: "1px dashed var(--border-strong)", borderRadius: 8, padding: 10, background: "var(--canvas)", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <div>
                      <p style={{ fontWeight: 800, fontSize: 12 }}>Execution failure proof</p>
                      <p style={{ color: "var(--ink-2)", fontSize: 11, marginTop: 3 }}>
                        Runs the same schema gate against a deliberately malformed patch. No model call.
                      </p>
                    </div>
                    <button className="btn-ghost" type="button" onClick={runDisqualificationProof} disabled={proofRunning} style={{ padding: "6px 10px", fontSize: 12 }}>
                      {proofRunning ? "Checking..." : "Show disqualification"}
                    </button>
                  </div>
                  {proofExecution && (
                    <div style={{ border: "1px solid var(--red-border)", borderRadius: 8, padding: 10, background: "var(--red-surface)" }}>
                      <p style={{ fontWeight: 800, fontSize: 12, overflowWrap: "anywhere" }}>{proofExecution.candidateId}</p>
                      <p style={{ color: "var(--red)", fontSize: 12, marginTop: 3 }}>
                        {proofExecution.eligible ? "eligible" : `disqualified: ${proofExecution.disqualifiedReason ?? "unknown"}`}
                      </p>
                      <p style={{ color: "var(--ink-2)", fontSize: 11, marginTop: 5, fontFamily: "var(--font-mono)", whiteSpace: "pre-wrap" }}>
                        {proofExecution.applySummary}
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}
            <TournamentReceipt
              repo={repo}
              finding={finding}
              fixers={fixers}
              modelProfile={modelProfile}
              serverScores={serverScores}
              executions={executions}
              serverScoringSettled={serverScoringSettled}
            />
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
            {footerMessage}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-ghost" onClick={copySelected} disabled={!selectedEligible}>
              {copied ? "Copied!" : "Copy patch"}
            </button>
            <button className="btn-primary" disabled={!selectedEligible} title="Stretch: wire this to GitHub PR creation after the demo loop is stable">
              Receipt-ready diff
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
