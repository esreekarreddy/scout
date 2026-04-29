/**
 * Single number-with-label, used in the dashboard summary row.
 * Pure & dumb. Owned by base; safe to import anywhere.
 */
export function Stat({
  label,
  value,
  color,
  labelColor = "var(--ink-2)",
}: {
  label: string;
  value: number | string;
  color: string;
  labelColor?: string;
}) {
  return (
    <div>
      <p style={{ fontSize: 24, fontWeight: 700, color, lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: 12, color: labelColor, marginTop: 2 }}>{label}</p>
    </div>
  );
}
