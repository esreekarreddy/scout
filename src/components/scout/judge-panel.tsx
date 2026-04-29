import type { Finding, JudgeVerdict } from "@/lib/types";

export function JudgePanel({
  findings,
  title = "Judge panel",
  subtitle = "Second-pass review that dedupes specialist agents and labels what is proved.",
  onSelectFinding,
}: {
  findings: Finding[];
  title?: string;
  subtitle?: string;
  onSelectFinding?: (finding: Finding) => void;
}) {
  const verdictStyles: Record<JudgeVerdict, { label: string; color: string; surface: string; border: string }> = {
    confirmed: { label: "Confirmed", color: "var(--green)", surface: "var(--green-surface)", border: "var(--green-border)" },
    likely: { label: "Likely", color: "var(--amber)", surface: "var(--amber-surface)", border: "var(--amber-border)" },
    speculative: { label: "Speculative", color: "var(--ink-2)", surface: "var(--surface-2)", border: "var(--border-strong)" },
  };

  return (
    <section className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
        <p style={{ fontWeight: 700, fontSize: 14 }}>{title}</p>
        <p style={{ color: "var(--ink-2)", fontSize: 12, marginTop: 3 }}>{subtitle}</p>
      </div>

      {findings.length === 0 ? (
        <div style={{ padding: 20, color: "var(--ink-3)", fontSize: 13 }}>No findings to judge yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {findings.map((finding) => {
            const verdict = finding.verdict ? verdictStyles[finding.verdict] : undefined;
            const row = (
              <>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0 }}>
                  <span className={`badge badge-${finding.severity}`} style={{ flexShrink: 0 }}>
                    {finding.severity}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {finding.title}
                    </p>
                    <p style={{ marginTop: 3, color: "var(--ink-3)", fontSize: 11, fontFamily: "var(--font-mono)", overflowWrap: "anywhere" }}>
                      {finding.file}
                      {finding.line ? `:${finding.line}` : ""}
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  {verdict ? (
                    <span
                      style={{
                        border: `1px solid ${verdict.border}`,
                        background: verdict.surface,
                        color: verdict.color,
                        borderRadius: 999,
                        padding: "3px 9px",
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {verdict.label}
                    </span>
                  ) : (
                    <span style={{ color: "var(--ink-3)", fontSize: 11 }}>Pending</span>
                  )}
                  <span style={{ color: "var(--ink-2)", fontSize: 12, fontWeight: 700 }}>{finding.confidence}%</span>
                </div>
              </>
            );

            return (
              <div key={finding.id} style={{ borderBottom: "1px solid var(--border)" }}>
                {onSelectFinding ? (
                  <button
                    onClick={() => onSelectFinding(finding)}
                    style={{
                      width: "100%",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 14,
                      padding: "13px 16px",
                      border: "none",
                      background: "transparent",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    {row}
                  </button>
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, padding: "13px 16px" }}>
                    {row}
                  </div>
                )}

                {finding.evidence && (
                  <p style={{ padding: "0 16px 13px 16px", color: "var(--ink-2)", fontSize: 12, lineHeight: 1.45, overflowWrap: "anywhere" }}>
                    Evidence: {finding.evidence}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
