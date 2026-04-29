"use client";

import Link from "next/link";
import { AGENTS } from "@/lib/prompts";

/**
 * The landing/input screen. Single GitHub URL field + launch button.
 * Owned by base. Voice input (Tier-2 Task 2B) should be added as a
 * sibling component, not inlined here.
 */
export function InputView({
  repo,
  setRepo,
  onLaunch,
  onLaunchDemo,
}: {
  repo: string;
  setRepo: (v: string) => void;
  onLaunch: () => void;
  onLaunchDemo: () => void;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        position: "relative",
      }}
    >
      {/* corner doc link */}
      <Link
        href="/docs"
        style={{
          position: "absolute",
          top: 24,
          right: 24,
          fontSize: 13,
          color: "var(--ink-2)",
          textDecoration: "none",
          padding: "6px 12px",
          borderRadius: 6,
          border: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        Docs
      </Link>

      <div style={{ maxWidth: 1120, width: "100%" }}>
        <div className="anim-fade-up" style={{ textAlign: "center", marginBottom: 48 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "var(--blue-surface)",
              border: "1px solid var(--blue-border)",
              marginBottom: 20,
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </div>
          <h1 style={{ fontWeight: 850, fontSize: 42, marginBottom: 10, lineHeight: 1.05 }}>
            Scout
          </h1>
          <p style={{ fontSize: 18, color: "var(--ink)", lineHeight: 1.45, fontWeight: 700 }}>
            Turn AI-written code into a scored repair tournament.
          </p>
          <p style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.6, maxWidth: 680, margin: "10px auto 0" }}>
            Scout gives coding agents a local tool surface: find evidence, judge it, run competing patches, score the result, and export a receipt.
          </p>
        </div>

        <div className="card anim-fade-up" style={{ padding: 28, animationDelay: "80ms", maxWidth: 680, margin: "0 auto" }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            GitHub repository URL
          </label>
          <input
            type="url"
            placeholder="https://github.com/owner/repo"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && repo.trim() && onLaunch()}
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              fontSize: 14,
              fontFamily: "var(--font-mono)",
              marginBottom: 20,
              background: "var(--canvas)",
              color: "var(--ink)",
              boxSizing: "border-box",
            }}
          />
          <button
            className="btn-primary"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={() => onLaunch()}
            disabled={!repo.trim()}
          >
            Evaluate live repo
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
          </button>
          <button
            className="btn-ghost"
            style={{ width: "100%", justifyContent: "center", marginTop: 10 }}
            onClick={onLaunchDemo}
            type="button"
          >
            Run seeded AI-code demo
          </button>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 8,
              marginTop: 16,
            }}
          >
            {[
              ["7", "seeded mistakes"],
              ["3", "specialist scouts"],
              ["3", "patch contenders"],
            ].map(([value, label]) => (
              <div
                key={label}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 7,
                  padding: "10px 8px",
                  background: "var(--surface-2)",
                  textAlign: "center",
                }}
              >
                <p style={{ fontWeight: 850, fontSize: 18, lineHeight: 1, color: "var(--ink)" }}>{value}</p>
                <p style={{ marginTop: 4, fontSize: 11, color: "var(--ink-2)", lineHeight: 1.25 }}>{label}</p>
              </div>
            ))}
          </div>
        </div>

        <div
          className="anim-fade-up"
          style={{
            marginTop: 32,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
            animationDelay: "140ms",
            maxWidth: 920,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          {AGENTS.map((a, idx) => {
            const examples = [
              "Example: import exists nowhere",
              "Example: comment says redacted",
              "Example: test only checks called",
            ];
            return (
            <div
              key={a.label}
              title={a.system.split("\n").slice(0, 4).join(" ").slice(0, 240) + "..."}
              style={{
                padding: "16px 16px",
                borderRadius: 8,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                textAlign: "left",
                cursor: "help",
                minHeight: 118,
              }}
            >
              <p style={{ fontWeight: 600, fontSize: 12, marginBottom: 2 }}>{a.label}</p>
              <p style={{ fontSize: 11, color: "var(--ink-2)", lineHeight: 1.45 }}>{a.description}</p>
              <p style={{ marginTop: 10, fontSize: 11, color: "var(--blue)", fontFamily: "var(--font-mono)" }}>
                {examples[idx]}
              </p>
            </div>
          )})}
        </div>

      </div>
    </div>
  );
}
