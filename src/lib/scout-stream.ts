import type { Aspect, Finding, FixStrategy, ScoutModelProfile } from "./types";
import { contextBudgetFromHeaders, mergeContextUsageTelemetry, parseContextUsageTelemetryLine } from "./context-budget";
import { parseFindingLine } from "./prompts";

/**
 * Stream a single review agent. Pure logic - no React.
 * Calls onChunk for each text chunk, onFinding for each parsed FINDING line.
 *
 * Owned by: Tier-0 refactor. Modify with care; multiple components depend on this signature.
 */
export async function streamAgent(
  repo: string,
  aspect: Aspect,
  modelProfile: ScoutModelProfile,
  onChunk: (chunk: string) => void,
  onFinding: (f: Omit<Finding, "id" | "aspect">) => void,
): Promise<{ model?: string; contextBudget?: ReturnType<typeof contextBudgetFromHeaders> }> {
  const res = await fetch("/api/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo, aspect, modelProfile }),
  });
  if (!res.ok) throw new Error(await responseErrorMessage(res));
  if (!res.body) throw new Error("API error: empty review stream");
  const model = res.headers.get("X-Scout-Model") ?? undefined;
  const contextBudget = contextBudgetFromHeaders(res.headers);
  let usageTelemetry: ReturnType<typeof parseContextUsageTelemetryLine>;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    buffer += chunk;

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      const telemetry = parseContextUsageTelemetryLine(trimmed);
      if (telemetry) {
        usageTelemetry = telemetry;
        continue;
      }

      onChunk(`${line}\n`);
      const f = parseFindingLine(trimmed);
      if (f) onFinding(f);
    }
  }
  if (buffer.trim()) {
    const trimmed = buffer.trim();
    const telemetry = parseContextUsageTelemetryLine(trimmed);
    if (telemetry) {
      usageTelemetry = telemetry;
    } else {
      onChunk(buffer);
    }
    const f = telemetry ? null : parseFindingLine(trimmed);
    if (f) onFinding(f);
  }
  return { model, contextBudget: mergeContextUsageTelemetry(contextBudget, usageTelemetry) };
}

async function responseErrorMessage(res: Response) {
  const fallback = `API error ${res.status}`;
  const text = await res.text().catch(() => "");
  if (!text) return fallback;

  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return `API error ${res.status}: ${parsed.error}`;
    }
  } catch {
    return `API error ${res.status}: ${text.slice(0, 240)}`;
  }

  return fallback;
}

/**
 * Stream a single fixer agent. Calls onChunk for each text chunk of the
 * unified diff. The full patch is the concatenation of all chunks.
 */
export async function streamFixer(
  repo: string,
  finding: Finding,
  strategy: FixStrategy,
  modelProfile: ScoutModelProfile,
  onChunk: (chunk: string) => void,
): Promise<void> {
  const res = await fetch("/api/fix", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo, finding, strategy, modelProfile }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text ? `API error ${res.status}: ${text}` : `API error ${res.status}`);
  }
  if (!res.body) throw new Error("API error: empty patch stream");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
}
