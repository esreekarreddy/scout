import { healthColor, healthLabel } from "@/lib/health";

/**
 * Animated circular risk score. Spins while not done; settles to a
 * severity-coloured ring when complete. Owned by base.
 */
export function HealthGauge({ score, done }: { score: number; done: boolean }) {
  const color = healthColor(score);
  const label = healthLabel(score);

  return (
    <div style={{ textAlign: "center", minWidth: 100 }}>
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          border: `4px solid ${done ? color : "var(--border)"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 8px",
          transition: "border-color 0.5s",
          position: "relative",
        }}
      >
        {!done && (
          <div
            className="spin-slow"
            style={{
              position: "absolute",
              inset: -4,
              borderRadius: "50%",
              border: "4px solid transparent",
              borderTopColor: "var(--blue)",
            }}
          />
        )}
        <span style={{ fontWeight: 800, fontSize: 22, color: done ? color : "var(--ink-3)" }}>
          {done ? score : "..."}
        </span>
      </div>
      <p style={{ fontSize: 12, fontWeight: 600, color: done ? color : "var(--ink-3)" }}>
        {done ? label : "Scanning"}
      </p>
    </div>
  );
}
