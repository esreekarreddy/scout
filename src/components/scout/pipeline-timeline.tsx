export type PipelineStepStatus = "queued" | "running" | "done" | "blocked";

export interface PipelineTimelineStep {
  id: string;
  label: string;
  description: string;
  status: PipelineStepStatus;
  detail?: string;
  count?: number;
}

export function PipelineTimeline({
  steps,
  title = "Review pipeline",
  subtitle = "From AI-written diff to judge-ready verdict.",
}: {
  steps: PipelineTimelineStep[];
  title?: string;
  subtitle?: string;
}) {
  const statusStyles: Record<PipelineStepStatus, { color: string; surface: string; border: string; label: string }> = {
    queued: { color: "var(--ink-3)", surface: "var(--surface-2)", border: "var(--border)", label: "Queued" },
    running: { color: "var(--blue)", surface: "var(--blue-surface)", border: "var(--blue-border)", label: "Running" },
    done: { color: "var(--green)", surface: "var(--green-surface)", border: "var(--green-border)", label: "Done" },
    blocked: { color: "var(--red)", surface: "var(--red-surface)", border: "var(--red-border)", label: "Blocked" },
  };

  return (
    <section className="card anim-fade-in" style={{ padding: 0, overflow: "hidden", marginBottom: 24 }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
        <p style={{ fontWeight: 700, fontSize: 14 }}>{title}</p>
        <p style={{ color: "var(--ink-2)", fontSize: 12, marginTop: 3 }}>{subtitle}</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        {steps.map((step, index) => {
          const tone = statusStyles[step.status];

          return (
            <div
              key={step.id}
              style={{
                position: "relative",
                minHeight: 158,
                padding: "18px 18px 16px",
                borderRight: index === steps.length - 1 ? "none" : "1px solid var(--border)",
                borderBottom: "1px solid var(--border)",
                background: step.status === "running" ? "linear-gradient(180deg, var(--blue-surface), var(--surface))" : "var(--surface)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <span
                  className={step.status === "running" ? "pulse-dot" : ""}
                  style={{
                    width: 11,
                    height: 11,
                    borderRadius: "50%",
                    background: tone.color,
                    boxShadow: `0 0 0 5px ${tone.surface}`,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    border: `1px solid ${tone.border}`,
                    background: tone.surface,
                    color: tone.color,
                    borderRadius: 999,
                    padding: "2px 8px",
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                  }}
                >
                  {tone.label}
                </span>
              </div>

              <p style={{ marginTop: 18, fontWeight: 700, fontSize: 14 }}>{step.label}</p>
              <p style={{ marginTop: 5, color: "var(--ink-2)", fontSize: 12, lineHeight: 1.45 }}>{step.description}</p>

              {(step.detail || typeof step.count === "number") && (
                <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  {step.detail && <p style={{ color: "var(--ink-3)", fontSize: 11, fontFamily: "var(--font-mono)", minWidth: 0, overflowWrap: "anywhere" }}>{step.detail}</p>}
                  {typeof step.count === "number" && (
                    <p style={{ color: tone.color, fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{step.count}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
