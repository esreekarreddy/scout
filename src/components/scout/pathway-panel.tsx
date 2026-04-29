export type PathwayStatus = "available" | "recommended" | "in-progress" | "complete";

export interface ReviewPathway {
  id: string;
  label: string;
  description: string;
  status: PathwayStatus;
  owner?: string;
  steps?: string[];
}

export function PathwayPanel({
  pathways,
  title = "Review pathways",
  subtitle = "Wedges for turning AI-written code into a reviewable decision.",
}: {
  pathways: ReviewPathway[];
  title?: string;
  subtitle?: string;
}) {
  const statusStyles: Record<PathwayStatus, { label: string; color: string; surface: string; border: string }> = {
    available: { label: "Available", color: "var(--ink-2)", surface: "var(--surface-2)", border: "var(--border)" },
    recommended: { label: "Recommended", color: "var(--blue)", surface: "var(--blue-surface)", border: "var(--blue-border)" },
    "in-progress": { label: "In progress", color: "var(--amber)", surface: "var(--amber-surface)", border: "var(--amber-border)" },
    complete: { label: "Complete", color: "var(--green)", surface: "var(--green-surface)", border: "var(--green-border)" },
  };

  return (
    <section className="card" style={{ padding: "18px 20px" }}>
      <div style={{ marginBottom: 14 }}>
        <p style={{ fontWeight: 700, fontSize: 14 }}>{title}</p>
        <p style={{ color: "var(--ink-2)", fontSize: 12, marginTop: 3 }}>{subtitle}</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {pathways.map((pathway) => {
          const tone = statusStyles[pathway.status];

          return (
            <article
              key={pathway.id}
              style={{
                border: `1px solid ${tone.border}`,
                borderRadius: 8,
                padding: 14,
                background: pathway.status === "recommended" ? "var(--blue-surface)" : "var(--surface)",
                minHeight: 172,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <p style={{ fontWeight: 800, fontSize: 14 }}>{pathway.label}</p>
                <span
                  style={{
                    color: tone.color,
                    background: tone.surface,
                    border: `1px solid ${tone.border}`,
                    borderRadius: 999,
                    padding: "2px 8px",
                    fontSize: 10,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    flexShrink: 0,
                  }}
                >
                  {tone.label}
                </span>
              </div>

              <p style={{ marginTop: 8, color: "var(--ink-2)", fontSize: 12, lineHeight: 1.45 }}>{pathway.description}</p>

              {pathway.owner && (
                <p style={{ marginTop: 12, color: "var(--ink-3)", fontSize: 11, fontFamily: "var(--font-mono)" }}>owner:{pathway.owner}</p>
              )}

              {pathway.steps && pathway.steps.length > 0 && (
                <div style={{ marginTop: 13, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {pathway.steps.map((step) => (
                    <span
                      key={step}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        padding: "3px 7px",
                        color: "var(--ink-2)",
                        background: "var(--surface)",
                        fontSize: 11,
                      }}
                    >
                      {step}
                    </span>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
