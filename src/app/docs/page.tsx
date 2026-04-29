import Link from "next/link";
import { AGENTS, FIX_STRATEGIES } from "@/lib/prompts";

export const metadata = {
  title: "Scout docs",
  description: "How Scout evaluates AI-written code and ranks repair patches.",
};

const textStyle = { fontSize: 14, color: "var(--ink-2)", lineHeight: 1.7 };
const codeStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "1px 5px",
};

export default function DocsPage() {
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
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/strategy" className="btn-ghost" style={{ padding: "6px 14px", textDecoration: "none" }}>
            Strategy
          </Link>
          <Link href="/" className="btn-ghost" style={{ padding: "6px 14px", textDecoration: "none" }}>
            Back to app
          </Link>
        </div>
      </div>

      <main style={{ maxWidth: 920, margin: "0 auto", padding: "44px 24px 96px" }}>
        <section style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: "var(--blue)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
            Agentic Coding + Building Evals
          </p>
          <h1 style={{ fontWeight: 800, fontSize: 42, marginBottom: 14 }}>Scout runs a patch tournament for AI-written code.</h1>
          <p style={{ ...textStyle, fontSize: 17, color: "var(--ink)" }}>
            Scout is an eval-backed review layer for code produced by coding agents. It looks for
            hallucinated APIs, spec drift, and tests that pass without proving behavior. Then competing
            repair agents produce patches, a deterministic scorer ranks them, and a receipt captures the handoff.
          </p>
        </section>

        <Section title="Why this pathway">
          <p style={textStyle}>
            The selected hackathon path is <strong>Agentic Coding + Building Evals</strong>. Generic AI
            code review is already crowded. Scout is narrower: it evaluates the codebase you and your AI
            write together, and it can show a benchmark score against planted AI-code mistakes.
          </p>
        </Section>

        <Section title="Pipeline">
          <ol style={{ ...textStyle, paddingLeft: 20, listStyleType: "decimal", listStylePosition: "outside" }}>
            <li>Load a GitHub repo or the deterministic <code style={codeStyle}>demo://ai-written-code-seed</code> fixture.</li>
            <li>Run three specialist scouts in parallel.</li>
            <li>Judge the findings, dedupe overlaps, and label verdicts.</li>
            <li>Show seeded recall only when an answer key exists; otherwise show a live review summary.</li>
            <li>Spawn Conservative, Idiomatic, and Robust repair agents for any finding.</li>
            <li>Validate patch shape, apply candidates in a temp workspace, rank eligible repairs, and export a receipt.</li>
          </ol>
        </Section>

        <Section title="Proof boundaries">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            {[
              ["Seeded demo", "Offline fixture streams and seven planted mistakes. Scout can report recall, critical recall, precision, and gates."],
              ["Live target repo", "Real model calls against a public repo that has a known answer key, so found and missed target issues stay visible."],
              ["Arbitrary live repo", "No answer key is claimed. Scout reports confirmed, likely, and speculative findings without pretending they are benchmark recall."],
            ].map(([title, body]) => (
              <article key={title} className="card" style={{ padding: 16 }}>
                <p style={{ fontWeight: 800, fontSize: 14 }}>{title}</p>
                <p style={{ ...textStyle, fontSize: 12, marginTop: 6 }}>{body}</p>
              </article>
            ))}
          </div>
        </Section>

        <Section title="Specialist scouts">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            {AGENTS.map((agent) => (
              <article key={agent.aspect} className="card" style={{ padding: 16 }}>
                <p style={{ fontWeight: 800, fontSize: 14 }}>{agent.label}</p>
                <p style={{ ...textStyle, fontSize: 12, marginTop: 6 }}>{agent.description}</p>
              </article>
            ))}
          </div>
        </Section>

        <Section title="Seeded benchmark">
          <p style={textStyle}>
            Demo mode plants seven realistic AI-code mistakes: fake package import, nonexistent helper,
            raw email logging despite a redaction comment, permissive bearer parsing, missing rate
            limiting, a <code style={codeStyle}>toBeTruthy()</code> test, and a telemetry test that never
            checks whether PII is removed.
          </p>
          <p style={textStyle}>
            The judge separates <strong>confirmed</strong>, <strong>likely</strong>, and{" "}
            <strong>speculative</strong> findings so the demo can claim measured recall without hiding
            noise.
          </p>
        </Section>

        <Section title="Repair agents">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {FIX_STRATEGIES.map((strategy) => (
              <article key={strategy.key} className="card" style={{ padding: 16 }}>
                <p style={{ fontWeight: 800, fontSize: 14 }}>{strategy.label}</p>
                <p style={{ ...textStyle, fontSize: 12, marginTop: 6 }}>{strategy.description}</p>
              </article>
            ))}
          </div>
        </Section>

        <Section title="Context budget">
          <p style={textStyle}>
            Live review keeps static scout rules at the front of each prompt and repo-specific context at
            the end. The app shows inspected files, estimated input tokens, stable prompt cache keys, and
            OpenAI usage metadata when the stream returns it, including cached input tokens.
          </p>
        </Section>

        <Section title="Patch safety gate">
          <p style={textStyle}>
            Scout rejects malformed patch output before it can win. The scoring route requires a plain
            unified diff, applies each valid candidate in a temporary workspace, and marks failed applies,
            unavailable repo context, failed checks, or unsafe check commands as ineligible.
          </p>
          <p style={textStyle}>
            Patch checks run with a stripped environment, so API keys and repository credentials are not
            inherited by candidate execution. The demo also includes a deterministic malformed-patch proof
            button, so disqualification can be shown without faking a model failure.
          </p>
        </Section>

        <Section title="MCP surface">
          <p style={textStyle}>
            Scout also runs as an official TypeScript SDK MCP server over stdio. Coding agents can call
            <code style={codeStyle}>scout_review</code>, <code style={codeStyle}>scout_fix</code>,{" "}
            <code style={codeStyle}>scout_score_patch</code>, <code style={codeStyle}>scout_handoff</code>,
            and <code style={codeStyle}>scout_eval</code>. The server also exposes native resources for
            the seeded manifest, seeded eval, and demo handoff prompt, plus native prompts for review,
            patch tournament, and Codex handoff workflows.
          </p>
          <p style={textStyle}>
            Seeded MCP eval is offline and deterministic. Live <code style={codeStyle}>scout_review</code>{" "}
            and <code style={codeStyle}>scout_fix</code> use the same bounded GitHub context and configured
            OpenAI model path as the web app. The repeatable live smoke command is{" "}
            <code style={codeStyle}>npm run scout:mcp -- --smoke-live</code>; it requires network access and{" "}
            <code style={codeStyle}>OPENAI_API_KEY</code>.
          </p>
        </Section>

        <Section title="Deterministic versus model output">
          <ul style={{ ...textStyle, paddingLeft: 20, listStyleType: "disc", listStylePosition: "outside" }}>
            <li>Model-generated: live scout text, live finding candidates, and live patch text.</li>
            <li>Deterministic: schema validation, judge grouping, seeded answer-key scoring, patch shape checks, patch apply eligibility, checksums, and receipts.</li>
            <li>Heuristic: risk score and patch score. They are visible ranking signals, not a production security audit.</li>
          </ul>
        </Section>

        <Section title="Code map">
          <pre
            className="scroll-thin"
            style={{
              overflow: "auto",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 16,
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >{`src/lib/demo-fixtures.ts   seeded benchmark and deterministic patches
src/lib/prompts.ts         specialist scout and repair prompts
src/lib/live-runner.ts     shared live OpenAI runner for API and MCP
src/lib/judge.ts           dedupe, verdicts, eval score
src/lib/patch-executor.ts  temp-workspace patch apply and safety checks
src/app/api/review         live or seeded review stream
src/app/api/fix            live or seeded repair stream
src/lib/context-budget.ts  token estimate, cache keys, usage telemetry
src/mcp/server.ts          official SDK MCP tools, resources, prompts
src/components/scout       modular product UI`}</pre>
        </Section>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card" style={{ padding: 22, marginBottom: 16 }}>
      <h2 style={{ fontWeight: 800, fontSize: 18, marginBottom: 10 }}>{title}</h2>
      {children}
    </section>
  );
}
