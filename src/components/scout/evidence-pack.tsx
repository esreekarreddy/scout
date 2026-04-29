import type { AgentState, Finding, JudgeVerdict } from "@/lib/types";

function verdictLabel(verdict?: JudgeVerdict) {
  if (!verdict) return "Pending";
  return verdict[0].toUpperCase() + verdict.slice(1);
}

function compactText(text: string, max = 150) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 3)}...`;
}

function latestTranscript(agent: AgentState) {
  const lines = agent.raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("FINDING|") && !line.startsWith("FINDING_JSON|"));
  return lines.at(-1) ?? (agent.status === "running" ? "Waiting for scout stream..." : "No transcript captured.");
}

export function EvidencePack({
  repo,
  findings,
  agents,
}: {
  repo: string;
  findings: Finding[];
  agents: AgentState[];
}) {
  const confirmed = findings.filter((finding) => finding.verdict === "confirmed");
  const evidenceRows = (confirmed.length > 0 ? confirmed : findings).slice(0, 4);
  const transcriptRows = agents.map((agent) => ({
    id: agent.aspect,
    label: agent.label,
    status: agent.status,
    text: latestTranscript(agent),
  }));
  const toolRows = [
    ["scout_review", "parallel scout findings"],
    ["scout_fix", "competing repair candidates"],
    ["scout_score_patch", "deterministic score table"],
    ["scout_handoff", "receipt for Codex or a PR"],
  ];

  return (
    <section
      className="card anim-fade-in"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))",
        gap: 0,
        overflow: "hidden",
        marginBottom: 24,
      }}
    >
      <div style={{ padding: "18px 20px", borderRight: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
          <div>
            <p style={{ fontWeight: 800, fontSize: 15 }}>Evidence pack</p>
            <p style={{ color: "var(--ink-2)", fontSize: 12, marginTop: 3 }}>
              Judge-ready proof snippets grouped before repair work starts. This is the artifact, not just chat.
            </p>
          </div>
          <p
            style={{
              color: "var(--ink-3)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              overflowWrap: "anywhere",
              textAlign: "right",
              maxWidth: 280,
            }}
          >
            {repo}
          </p>
        </div>

        {evidenceRows.length === 0 ? (
          <div
            style={{
              marginTop: 16,
              border: "1px dashed var(--border-strong)",
              borderRadius: 8,
              padding: 16,
              color: "var(--ink-3)",
              fontSize: 13,
              background: "var(--surface-2)",
            }}
          >
            Evidence will appear as scouts emit findings and the judge dedupes them.
          </div>
        ) : (
          <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
            {evidenceRows.map((finding) => (
              <div
                key={finding.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 12,
                  background: finding.verdict === "confirmed" ? "var(--green-surface)" : "var(--surface)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span className={`badge badge-${finding.severity}`}>{finding.severity}</span>
                  <span style={{ color: "var(--ink-2)", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>
                    {verdictLabel(finding.verdict)} proof
                  </span>
                  {finding.matchedAgents && finding.matchedAgents.length > 1 && (
                    <span style={{ color: "var(--green)", fontSize: 11, fontWeight: 700 }}>
                      {finding.matchedAgents.length} agents agree
                    </span>
                  )}
                </div>
                <p style={{ marginTop: 8, fontWeight: 700, fontSize: 13, overflowWrap: "anywhere" }}>
                  {finding.title}
                </p>
                <p
                  style={{
                    marginTop: 5,
                    color: "var(--ink-3)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    overflowWrap: "anywhere",
                  }}
                >
                  {finding.file}
                  {finding.line ? `:${finding.line}` : ""}
                </p>
                <p style={{ marginTop: 8, color: "var(--ink-2)", fontSize: 12, lineHeight: 1.45 }}>
                  {compactText(finding.evidence || finding.description, 190)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <aside style={{ padding: "18px 20px", background: "var(--canvas)" }}>
        <p style={{ fontWeight: 800, fontSize: 15 }}>Tool call strip</p>
        <p style={{ color: "var(--ink-2)", fontSize: 12, marginTop: 3 }}>
          The official local MCP server exposes review, fix, score, and handoff calls for agent tools.
        </p>
        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
          {toolRows.map(([tool, output]) => (
            <div
              key={tool}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: "var(--surface)",
                padding: "9px 10px",
                minHeight: 74,
              }}
            >
              <p style={{ color: "var(--blue)", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, overflowWrap: "anywhere" }}>
                {tool}
              </p>
              <p style={{ marginTop: 5, color: "var(--ink-2)", fontSize: 11, lineHeight: 1.35 }}>{output}</p>
            </div>
          ))}
        </div>
        <p style={{ color: "var(--ink-3)", fontSize: 11, fontWeight: 800, marginTop: 16, textTransform: "uppercase" }}>
          Live scout stream
        </p>
        <div style={{ marginTop: 8, display: "grid", gap: 10 }}>
          {transcriptRows.map((row) => (
            <div
              key={row.id}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: "var(--surface)",
                padding: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <p style={{ fontWeight: 700, fontSize: 12 }}>{row.label}</p>
                <span style={{ color: row.status === "running" ? "var(--blue)" : "var(--ink-3)", fontSize: 11, fontWeight: 700 }}>
                  {row.status}
                </span>
              </div>
              <p style={{ marginTop: 8, color: "var(--ink-2)", fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.45 }}>
                {compactText(row.text, 130)}
              </p>
            </div>
          ))}
        </div>
      </aside>
    </section>
  );
}
