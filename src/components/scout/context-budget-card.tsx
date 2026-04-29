import type { AgentState, ContextBudget } from "@/lib/types";

export function ContextBudgetCard({ agents }: { agents: AgentState[] }) {
  const budgets = agents
    .map((agent) => agent.contextBudget)
    .filter((budget): budget is ContextBudget => Boolean(budget));
  const totalDurationMs = agents.reduce((sum, agent) => sum + (agent.durationMs ?? 0), 0);
  const representative = budgets[0];
  const estimatedTokens = budgets.reduce((sum, budget) => sum + budget.estimatedInputTokens, 0);
  const measuredInputTokens = sumMetric(budgets, "measuredInputTokens");
  const measuredOutputTokens = sumMetric(budgets, "measuredOutputTokens");
  const measuredTotalTokens = sumMetric(budgets, "measuredTotalTokens");
  const cachedInputTokens = sumMetric(budgets, "cachedInputTokens");
  const cacheWriteTokens = sumMetric(budgets, "cacheWriteTokens");
  const hasMeasuredInput = measuredInputTokens !== undefined;
  const hasUsage = hasMeasuredInput
    || measuredOutputTokens !== undefined
    || measuredTotalTokens !== undefined
    || cachedInputTokens !== undefined
    || cacheWriteTokens !== undefined;
  const inputTokens = measuredInputTokens ?? estimatedTokens;
  const cacheRate = hasMeasuredInput && measuredInputTokens && cachedInputTokens !== undefined
    ? Math.round((cachedInputTokens / measuredInputTokens) * 100)
    : undefined;
  const inspectedFiles = representative?.inspectedFiles ?? 0;
  const contextChars = representative?.contextChars ?? 0;
  const model = representative?.model ?? agents.find((agent) => agent.model)?.model ?? "pending";
  const cacheHint = representative?.cacheHint ?? "Static scout rules first, repo context last";
  const cacheKeyCount = new Set(budgets.map((budget) => budget.promptCacheKey).filter(Boolean)).size;
  const ready = budgets.length > 0;

  return (
    <section className="card anim-fade-in" style={{ padding: "18px 20px", minHeight: 196 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
        <div>
          <p style={{ fontWeight: 850, fontSize: 15 }}>Context budget</p>
          <p style={{ color: "var(--ink-2)", fontSize: 12, lineHeight: 1.45, marginTop: 4 }}>
            Shows estimated context first, then OpenAI usage and cached tokens when a live stream finishes.
          </p>
        </div>
        <span
          style={{
            border: "1px solid var(--blue-border)",
            borderRadius: 999,
            background: "var(--blue-surface)",
            color: "var(--blue)",
            fontSize: 10,
            fontWeight: 900,
            padding: "3px 8px",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {hasUsage ? "OpenAI usage" : ready ? "estimated" : "pending"}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(92px, 1fr))", gap: 8, marginTop: 14 }}>
        <Metric label="Files" value={ready ? inspectedFiles : "-"} />
        <Metric label={hasMeasuredInput ? "Input tokens" : "Est. tokens"} value={ready ? inputTokens.toLocaleString() : "-"} />
        <Metric label="Cached" value={hasUsage && cachedInputTokens !== undefined ? cachedInputTokens.toLocaleString() : "-"} />
        <Metric label="Hit rate" value={cacheRate !== undefined ? `${cacheRate}%` : "-"} />
      </div>

      <div style={{ borderTop: "1px solid var(--border)", marginTop: 13, paddingTop: 11, display: "grid", gap: 4 }}>
        <p style={{ color: "var(--ink-2)", fontSize: 12 }}>
          Model: <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink)" }}>{model}</span>
        </p>
        <p style={{ color: "var(--ink-2)", fontSize: 12 }}>
          Scout latency: <span style={{ color: "var(--ink)" }}>{totalDurationMs ? `${(totalDurationMs / 1000).toFixed(1)}s total` : "pending"}</span>
        </p>
        <p style={{ color: "var(--ink-2)", fontSize: 12 }}>
          Usage: <span style={{ color: "var(--ink)" }}>{usageLine(hasUsage, measuredOutputTokens, measuredTotalTokens, cachedInputTokens, cacheWriteTokens)}</span>
        </p>
        <p style={{ color: "var(--ink-3)", fontSize: 11, lineHeight: 1.35 }}>
          {cacheHint}{cacheKeyCount ? ` - ${cacheKeyCount} stable cache keys` : ""} - {contextChars.toLocaleString()} chars per scout
        </p>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, background: "var(--canvas)", padding: "9px 8px" }}>
      <p style={{ color: "var(--ink-3)", fontSize: 10, fontWeight: 850, textTransform: "uppercase" }}>{label}</p>
      <p style={{ marginTop: 5, fontWeight: 850, fontSize: 15, overflowWrap: "anywhere" }}>{value}</p>
    </div>
  );
}

type NumericBudgetMetric =
  | "measuredInputTokens"
  | "measuredOutputTokens"
  | "measuredTotalTokens"
  | "cachedInputTokens"
  | "cacheWriteTokens";

function sumMetric(budgets: ContextBudget[], key: NumericBudgetMetric): number | undefined {
  const values = budgets
    .map((budget) => budget[key])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0);
}

function usageLine(
  hasUsage: boolean,
  outputTokens: number | undefined,
  totalTokens: number | undefined,
  cachedInputTokens: number | undefined,
  cacheWriteTokens: number | undefined,
) {
  if (!hasUsage) return "waiting for live usage metadata";
  const parts = [
    outputTokens !== undefined ? `${outputTokens.toLocaleString()} output` : undefined,
    totalTokens !== undefined ? `${totalTokens.toLocaleString()} total` : undefined,
    cachedInputTokens !== undefined ? `${cachedInputTokens.toLocaleString()} cached input` : undefined,
    cacheWriteTokens ? `${cacheWriteTokens.toLocaleString()} cache write` : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "usage received";
}
