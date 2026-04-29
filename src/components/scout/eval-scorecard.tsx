export type EvalScoreTone = "green" | "amber" | "red" | "blue";

export interface EvalScoreItem {
  id: string;
  label: string;
  value: number;
  max?: number;
  note?: string;
  tone?: EvalScoreTone;
}

export function EvalScorecard({
  scores,
  title = "Eval scorecard",
  subtitle = "Compact pass/fail signals for reviewer confidence.",
}: {
  scores: EvalScoreItem[];
  title?: string;
  subtitle?: string;
}) {
  const toneColor: Record<EvalScoreTone, string> = {
    green: "var(--green)",
    amber: "var(--amber)",
    red: "var(--red)",
    blue: "var(--blue)",
  };

  return (
    <section className="card" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <p style={{ fontWeight: 700, fontSize: 14 }}>{title}</p>
        <p style={{ color: "var(--ink-2)", fontSize: 12, marginTop: 3 }}>{subtitle}</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        {scores.map((score) => {
          const max = score.max ?? 100;
          const value = Math.max(0, Math.min(score.value, max));
          const pct = max === 0 ? 0 : Math.round((value / max) * 100);
          const tone = toneColor[score.tone ?? (pct >= 80 ? "green" : pct >= 55 ? "amber" : "red")];

          return (
            <div
              key={score.id}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 12,
                background: "var(--surface)",
                minHeight: 112,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                <p style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 600 }}>{score.label}</p>
                <p style={{ fontSize: 20, fontWeight: 800, color: tone }}>
                  {value}
                  <span style={{ color: "var(--ink-3)", fontSize: 11, fontWeight: 700 }}>/{max}</span>
                </p>
              </div>

              <div style={{ height: 6, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden", marginTop: 14 }}>
                <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: tone }} />
              </div>

              {score.note && <p style={{ marginTop: 12, color: "var(--ink-3)", fontSize: 11, lineHeight: 1.35 }}>{score.note}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
