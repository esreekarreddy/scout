import Link from "next/link";
import { PathwayPanel } from "@/components/scout/pathway-panel";

export const metadata = {
  title: "Scout strategy",
  description: "Hackathon pathway and stretch feature choices for Scout.",
};

export default function StrategyPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--canvas)" }}>
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
        <Link href="/" style={{ fontWeight: 800, fontSize: 15, color: "var(--ink)", textDecoration: "none" }}>
          Scout
        </Link>
        <Link href="/" className="btn-ghost" style={{ padding: "6px 14px", textDecoration: "none" }}>
          Back to app
        </Link>
      </div>

      <main style={{ maxWidth: 1040, margin: "0 auto", padding: "44px 24px 96px" }}>
        <section style={{ marginBottom: 18 }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: "var(--blue)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
            Hackathon strategy
          </p>
          <h1 style={{ fontWeight: 800, fontSize: 40, marginBottom: 12 }}>The main app stays product-first.</h1>
          <p style={{ color: "var(--ink-2)", fontSize: 15, lineHeight: 1.7, maxWidth: 760 }}>
            This page keeps the internal lane choice out of the demo surface. The product pitch is Scout:
            the patch tournament for AI-written code. The build strategy is Agentic Coding plus Building Evals.
          </p>
        </section>

        <PathwayPanel
          title="Pathway choices"
          subtitle="Use this for planning and judging narrative, not as the first screen of the app."
          pathways={[
            {
              id: "agentic-evals",
              label: "Agentic Coding + Evals",
              status: "recommended",
              description: "Specialist scouts evaluate AI-written code, a judge dedupes findings, repair agents compete, and a receipt captures the proof.",
              steps: ["tool calls", "parallel scouts", "patch tournament", "receipt"],
            },
            {
              id: "multimodal",
              label: "Multimodal Intake",
              status: "available",
              description: "Voice or screen-recorded bug reports can feed the same evaluation pipeline after the core loop is stable.",
              steps: ["audio", "transcript", "triage"],
            },
            {
              id: "domain",
              label: "Domain Agents",
              status: "available",
              description: "The chosen domain is agentic engineering itself: review infrastructure for code produced by coding agents.",
              steps: ["AI-code taxonomy", "policy", "evidence"],
            },
          ]}
        />

        <section className="card" style={{ marginTop: 16, padding: 22 }}>
          <h2 style={{ fontWeight: 800, fontSize: 18, marginBottom: 10 }}>OpenAI API usage</h2>
          <p style={{ color: "var(--ink-2)", fontSize: 14, lineHeight: 1.7 }}>
            Seeded demo mode is deterministic for recording reliability. Live repo review uses the OpenAI
            API in <code style={codeStyle}>/api/review</code>, and live patch generation uses the OpenAI
            API in <code style={codeStyle}>/api/fix</code>. Once hackathon credits are available, set{" "}
            <code style={codeStyle}>OPENAI_API_KEY</code> and optionally tune <code style={codeStyle}>OPENAI_MODEL</code>.
            Scout keeps static prompt rules ahead of dynamic repo context and shows cached-token usage
            when the live model response reports it.
          </p>
        </section>
      </main>
    </div>
  );
}

const codeStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "1px 5px",
};
