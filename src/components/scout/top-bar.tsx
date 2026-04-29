import Link from "next/link";

/**
 * Sticky top bar shown on dashboard. Repo URL on left, reset on right.
 * Owned by base. Adding nav items is OK - append, don't reorder.
 */
export function TopBar({ repo, onReset }: { repo: string; onReset: () => void }) {
  return (
    <div
      style={{
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "0 24px",
        height: 52,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: 0 }}>Scout</span>
        <span style={{ color: "var(--border-strong)" }}>|</span>
        <span
          style={{
            fontSize: 13,
            fontFamily: "var(--font-mono)",
            color: "var(--ink-2)",
            maxWidth: 360,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {repo}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
