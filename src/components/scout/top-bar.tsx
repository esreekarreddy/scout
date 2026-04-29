import Link from "next/link";
import { MODEL_PROFILES } from "@/lib/model-policy";
import type { ScoutModelProfile } from "@/lib/types";

/**
 * Sticky top bar shown on dashboard. Repo URL on left, reset on right.
 * Owned by base. Adding nav items is OK - append, don't reorder.
 */
export function TopBar({
  repo,
  modelProfile,
  onReset,
}: {
  repo: string;
  modelProfile: ScoutModelProfile;
  onReset: () => void;
}) {
  const modelPath = MODEL_PROFILES[modelProfile];
  return (
    <div
      style={{
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "8px 24px",
        minHeight: 56,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flexWrap: "wrap", flex: "1 1 360px" }}>
        <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: 0 }}>Scout</span>
        <span style={{ color: "var(--border-strong)" }}>|</span>
        <span
          style={{
            fontSize: 13,
            fontFamily: "var(--font-mono)",
            color: "var(--ink-2)",
            maxWidth: "min(360px, 52vw)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {repo}
        </span>
        <span
          title={`${modelPath.label}: review ${modelPath.review}, fix ${modelPath.fix}, judge ${modelPath.judge}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            border: "1px solid var(--border)",
            borderRadius: 999,
            padding: "4px 8px",
            background: "var(--canvas)",
            color: "var(--ink-2)",
            fontSize: 12,
            whiteSpace: "nowrap",
            maxWidth: 170,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--blue)", display: "inline-block" }} />
          {modelPath.label} profile
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
        <Link href="/docs" className="btn-ghost" style={{ padding: "6px 14px", textDecoration: "none" }}>
          Docs
        </Link>
        <button className="btn-ghost" style={{ padding: "6px 14px" }} onClick={onReset}>
          New scan
        </button>
      </div>
    </div>
  );
}
