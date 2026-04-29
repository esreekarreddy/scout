"use client";

import { useMemo, useState } from "react";
import { DEMO_REPO_URL } from "@/lib/demo-fixtures";
import type { AgentState, Finding } from "@/lib/types";

type BoundaryKind = "deterministic" | "model" | "fixture";
type TraceStatus = "queued" | "running" | "done";

interface TraceStep {
  id: string;
  label: string;
  owner: string;
  status: TraceStatus;
  boundary: BoundaryKind;
  input: string;
  output: string;
  detail: string;
}

function stableHash(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function boundaryColor(kind: BoundaryKind) {
  if (kind === "model") return "var(--amber)";
  if (kind === "fixture") return "var(--blue)";
  return "var(--green)";
}

function statusColor(status: TraceStatus) {
  if (status === "done") return "var(--green)";
  if (status === "running") return "var(--blue)";
  return "var(--ink-3)";
}

function compactRepo(repo: string) {
  if (!repo) return "pending repo";
  if (repo.length <= 44) return repo;
  return `${repo.slice(0, 20)}...${repo.slice(-18)}`;
}

function buildTraceSteps(repo: string, agents: AgentState[], findings: Finding[], allDone: boolean): TraceStep[] {
  const isDemo = repo.trim() === DEMO_REPO_URL;
  const runningAgents = agents.filter((agent) => agent.status === "running").length;
  const doneAgents = agents.filter((agent) => agent.status === "done").length;
  const confirmed = findings.filter((finding) => finding.verdict === "confirmed").length;
  const files = [...new Set(findings.map((finding) => finding.file))];
  const scoutBoundary: BoundaryKind = isDemo ? "fixture" : "model";

  return [
    {
      id: "intake",
      label: "Tool intake",
      owner: "scout_review",
      status: repo ? "done" : "queued",
      boundary: "deterministic",
      input: stableHash(repo || "pending"),
      output: stableHash(`${repo}:accepted`),
      detail: compactRepo(repo),
    },
    {
      id: "scouts",
      label: "Specialist scouts",
      owner: "parallel agents",
      status: allDone ? "done" : runningAgents > 0 ? "running" : "queued",
      boundary: scoutBoundary,
      input: stableHash(`${repo}:scouts:${agents.length}`),
      output: stableHash(agents.map((agent) => `${agent.aspect}:${agent.status}:${agent.findings.length}`).join("|")),
      detail: `${doneAgents}/${agents.length} scouts done`,
    },
    {
      id: "judge",
      label: "Judge grouping",
      owner: "local judge",
      status: findings.length > 0 ? "done" : allDone ? "done" : "queued",
      boundary: "deterministic",
      input: stableHash(findings.map((finding) => `${finding.id}:${finding.title}`).join("|") || "no-findings"),
      output: stableHash(findings.map((finding) => `${finding.verdict}:${finding.confidence}`).join("|") || "no-verdicts"),
      detail: `${confirmed}/${findings.length} confirmed`,
    },
    {
      id: "graph",
      label: "Evidence graph",
      owner: "UI proof map",
      status: findings.length > 0 ? "done" : "queued",
      boundary: "deterministic",
      input: stableHash(files.join("|") || "no-files"),
      output: stableHash(`${files.length}:${findings.length}:graph`),
      detail: `${files.length} files linked`,
    },
    {
      id: "handoff",
      label: "Receipt boundary",
      owner: "scout_handoff",
      status: findings.length > 0 && allDone ? "done" : findings.length > 0 ? "running" : "queued",
      boundary: "deterministic",
      input: stableHash(`${repo}:${findings.length}:${confirmed}`),
      output: stableHash(`${repo}:${allDone}:${findings.map((finding) => finding.id).join("|")}`),
      detail: allDone ? "ready for repair" : "still collecting proof",
    },
  ];
}

export function TraceReceipt({
  repo,
  agents,
  findings,
  allDone,
}: {
  repo: string;
  agents: AgentState[];
  findings: Finding[];
  allDone: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const steps = useMemo(() => buildTraceSteps(repo, agents, findings, allDone), [agents, allDone, findings, repo]);
  const receiptId = `trace-ui-${stableHash(steps.map((step) => `${step.id}:${step.output}:${step.status}`).join("|"))}`;
  const isDemo = repo.trim() === DEMO_REPO_URL;
  const traceText = [
    `Scout Trace Receipt: ${receiptId}`,
    `Repo: ${repo || "pending"}`,
    `Boundary: ${isDemo ? "seeded fixture, no model call for scout stream" : "live scout stream may use configured model route"}`,
    ...steps.map((step) => `${step.label}: ${step.status}, ${step.boundary}, in ${step.input}, out ${step.output}`),
  ].join("\n");

  function copyTrace() {
    void navigator.clipboard.writeText(traceText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <section className="card anim-fade-in" aria-labelledby="trace-receipt-title" style={{ padding: "16px 18px", minHeight: 430 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
        <div>
          <p id="trace-receipt-title" style={{ fontWeight: 900, fontSize: 15 }}>
            Trace receipt
          </p>
          <p style={{ color: "var(--ink-2)", fontSize: 12, marginTop: 3 }}>
            A compact run ledger that keeps proof checksums and model boundaries visible.
          </p>
        </div>
        <div style={{ display: "grid", justifyItems: "end", gap: 8 }}>
          <p style={{ color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 11, textAlign: "right" }}>{receiptId}</p>
          <button className="btn-ghost" type="button" onClick={copyTrace} style={{ padding: "5px 10px", fontSize: 12 }}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
        {steps.map((step, index) => (
          <div
            key={step.id}
            style={{
              display: "grid",
              gridTemplateColumns: "26px minmax(0, 1fr)",
              gap: 10,
              alignItems: "stretch",
              minHeight: 66,
            }}
          >
            <div style={{ display: "grid", justifyItems: "center", gridTemplateRows: "22px 1fr" }}>
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  border: `1px solid ${statusColor(step.status)}`,
                  color: statusColor(step.status),
                  background: step.status === "done" ? "var(--green-surface)" : "var(--surface)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 900,
                }}
              >
                {index + 1}
              </span>
              {index < steps.length - 1 && <span style={{ width: 1, background: "var(--border)", minHeight: 32 }} />}
            </div>
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "9px 10px", background: "var(--canvas)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 800, fontSize: 12 }}>{step.label}</p>
                  <p style={{ color: "var(--ink-3)", fontSize: 10, marginTop: 2, fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {step.owner} - {step.detail}
                  </p>
                </div>
                <span
                  style={{
                    border: `1px solid ${boundaryColor(step.boundary)}`,
                    color: boundaryColor(step.boundary),
                    background: "var(--surface)",
                    borderRadius: 999,
                    padding: "2px 7px",
                    fontSize: 10,
                    fontWeight: 900,
                    textTransform: "uppercase",
                    flexShrink: 0,
                  }}
                >
                  {step.boundary}
                </span>
              </div>
              <div style={{ marginTop: 7, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <p style={{ color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 10 }}>in {step.input}</p>
                <p style={{ color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 10 }}>out {step.output}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 8,
        }}
      >
        <div style={{ border: "1px solid var(--green-border)", borderRadius: 8, background: "var(--green-surface)", padding: 10 }}>
          <p style={{ color: "var(--green)", fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>Deterministic</p>
          <p style={{ marginTop: 5, color: "var(--ink-2)", fontSize: 11, lineHeight: 1.4 }}>
            Intake hashes, judge grouping, graph links, health score, and receipt ids.
          </p>
        </div>
        <div style={{ border: "1px solid var(--amber-border)", borderRadius: 8, background: "var(--amber-surface)", padding: 10 }}>
          <p style={{ color: "var(--amber)", fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>Model boundary</p>
          <p style={{ marginTop: 5, color: "var(--ink-2)", fontSize: 11, lineHeight: 1.4 }}>
            {isDemo ? "Seeded demo uses fixture streams. Live mode may use model scout and patch text." : "Scout streams and patch candidates may come from the configured model route."}
          </p>
        </div>
      </div>
    </section>
  );
}
