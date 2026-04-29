"use client";

import { useState } from "react";
import type { AgentState, Finding } from "@/lib/types";
import { AGENTS } from "@/lib/prompts";

/**
 * Per-agent card. Click `?` to reveal system prompt; click `Trace` to
 * reveal raw stream; click any finding to fire onFindingClick.
 *
 * OWNERSHIP: this is the canonical agent UI. New agent types (orchestrator,
 * judge) should NOT modify this - they should add their own card components.
 */
export function AgentCard({
  agent,
  promptOpen,
  onTogglePrompt,
  onFindingClick,
}: {
  agent: AgentState;
  promptOpen: boolean;
  onTogglePrompt: () => void;
  onFindingClick: (f: Finding) => void;
}) {
  const [traceOpen, setTraceOpen] = useState(false);
  const meta = AGENTS.find((a) => a.aspect === agent.aspect);

  const dotColor: Record<string, string> = {
    idle: "var(--border-strong)",
    running: "var(--blue)",
    done: "var(--green)",
    error: "var(--red)",
  };

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* header */}
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              className={agent.status === "running" ? "pulse-dot" : ""}
              style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor[agent.status], display: "inline-block" }}
            />
            <p style={{ fontWeight: 600, fontSize: 14 }}>{agent.label}</p>
            <button
              onClick={onTogglePrompt}
              title="Show system prompt"
              style={{
                background: "none",
                border: "1px solid var(--border)",
                borderRadius: 4,
                color: "var(--ink-3)",
                cursor: "pointer",
                padding: "0 6px",
                height: 18,
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              {promptOpen ? "-" : "?"}
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {agent.findings.length > 0 && (
              <span style={{ fontSize: 12, fontWeight: 600, color: dotColor[agent.status] }}>
                {agent.findings.length} found
              </span>
            )}
            {agent.raw && (
              <button
                onClick={() => setTraceOpen((v) => !v)}
                style={{
                  fontSize: 11,
                  color: "var(--ink-3)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "2px 6px",
                }}
              >
                {traceOpen ? "Hide" : "Trace"}
              </button>
            )}
          </div>
        </div>
        <p style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 4 }}>{agent.description}</p>
      </div>

      {/* system prompt panel */}
      {promptOpen && meta && (
        <div style={{ padding: "12px 16px", background: "var(--blue-surface)", borderBottom: "1px solid var(--blue-border)" }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "var(--blue)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
            System prompt
          </p>
          <pre style={{ fontSize: 11, lineHeight: 1.5, fontFamily: "var(--font-mono)", color: "var(--ink-2)", whiteSpace: "pre-wrap", margin: 0 }}>
            {meta.system}
          </pre>
        </div>
      )}

      {/* findings */}
      {agent.findings.length > 0 && (
        <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
          {agent.findings.map((f) => (
            <button
              key={f.id}
              onClick={() => onFindingClick(f)}
              className="agent-finding-button"
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                background: "none",
                border: "1px solid transparent",
                borderRadius: 6,
                padding: "6px 8px",
                cursor: "pointer",
                textAlign: "left",
                transition: "background 0.12s, border-color 0.12s",
              }}
            >
              <span className={`badge badge-${f.severity}`}>{f.severity}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {f.title}
                </p>
                <p style={{ fontSize: 11, color: "var(--ink-2)", fontFamily: "var(--font-mono)" }}>
                  {f.file}{f.line ? `:${f.line}` : ""}
                </p>
              </div>
              <span style={{ fontSize: 11, color: "var(--ink-3)", flexShrink: 0 }}>{f.confidence}%</span>
            </button>
          ))}
        </div>
      )}

      {/* empty state */}
      {agent.findings.length === 0 && (
        <div style={{ padding: 16, flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ fontSize: 13, color: "var(--ink-3)" }}>
            {agent.status === "idle"    && "Waiting..."}
            {agent.status === "running" && "Analysing..."}
            {agent.status === "done"    && "No findings."}
            {agent.status === "error"   && "Agent error."}
          </p>
        </div>
      )}

      {/* trace */}
      {traceOpen && agent.raw && (
        <div
          className="scroll-thin"
          style={{
            borderTop: "1px solid var(--border)",
            maxHeight: 200,
            overflowY: "auto",
            padding: "12px 14px",
            background: "var(--canvas)",
          }}
        >
          <pre style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-2)", whiteSpace: "pre-wrap", margin: 0 }}>
            {agent.raw}
          </pre>
        </div>
      )}
    </div>
  );
}
