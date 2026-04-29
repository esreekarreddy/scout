import type { ContextBudget, ScoutModelProfile } from "./types";

const CHARS_PER_ESTIMATED_UNIT = 4;
const USAGE_TELEMETRY_PREFIX = "SCOUT_USAGE|";

export type ContextUsageTelemetry = Pick<
  ContextBudget,
  | "measuredInputTokens"
  | "measuredOutputTokens"
  | "measuredTotalTokens"
  | "cachedInputTokens"
  | "cacheWriteTokens"
  | "noCacheTokens"
  | "usageSource"
>;

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / CHARS_PER_ESTIMATED_UNIT));
}

export function buildContextBudget(input: {
  repoContext: string;
  model?: string;
  modelProfile?: ScoutModelProfile | "env";
  promptCacheKey?: string;
}): ContextBudget {
  const inspectedFiles = countContextFiles(input.repoContext);
  const estimatedInputTokens = estimateTokens(input.repoContext);

  return {
    contextChars: input.repoContext.length,
    estimatedInputTokens,
    inspectedFiles,
    model: input.model,
    modelProfile: input.modelProfile,
    cacheHint: "Static scout rules first, repo context last",
    promptCacheKey: input.promptCacheKey,
  };
}

export function contextBudgetHeaders(budget: ContextBudget): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Scout-Context-Chars": String(budget.contextChars),
    "X-Scout-Context-Estimated-Tokens": String(budget.estimatedInputTokens),
    "X-Scout-Context-Files": String(budget.inspectedFiles),
    "X-Scout-Context-Cache-Hint": budget.cacheHint,
  };
  if (budget.promptCacheKey) headers["X-Scout-Prompt-Cache-Key"] = budget.promptCacheKey;
  return headers;
}

export function contextBudgetFromHeaders(headers: Headers): ContextBudget | undefined {
  const contextChars = readNumberHeader(headers, "X-Scout-Context-Chars");
  const estimatedInputTokens = readNumberHeader(headers, "X-Scout-Context-Estimated-Tokens");
  const inspectedFiles = readNumberHeader(headers, "X-Scout-Context-Files");
  if (contextChars === undefined || estimatedInputTokens === undefined || inspectedFiles === undefined) return undefined;

  return {
    contextChars,
    estimatedInputTokens,
    inspectedFiles,
    model: headers.get("X-Scout-Model") ?? undefined,
    modelProfile: headers.get("X-Scout-Model-Profile") ?? undefined,
    cacheHint: headers.get("X-Scout-Context-Cache-Hint") ?? "Static scout rules first, repo context last",
    promptCacheKey: headers.get("X-Scout-Prompt-Cache-Key") ?? undefined,
  };
}

export function buildPromptCacheKey(scope: "review" | "fix", id: string) {
  return `scout-${scope}-${id}-v1`;
}

export function encodeContextUsageTelemetry(usage: unknown): string | undefined {
  const telemetry = sanitizeContextUsageTelemetry(usage) ?? contextUsageTelemetryFromUsage(usage);
  if (!telemetry) return undefined;
  return `${USAGE_TELEMETRY_PREFIX}${JSON.stringify(telemetry)}`;
}

export function parseContextUsageTelemetryLine(line: string): ContextUsageTelemetry | undefined {
  if (!line.startsWith(USAGE_TELEMETRY_PREFIX)) return undefined;

  try {
    const parsed = JSON.parse(line.slice(USAGE_TELEMETRY_PREFIX.length));
    return sanitizeContextUsageTelemetry(parsed);
  } catch {
    return undefined;
  }
}

export function mergeContextUsageTelemetry(
  budget: ContextBudget | undefined,
  telemetry: ContextUsageTelemetry | undefined,
): ContextBudget | undefined {
  if (!budget || !telemetry) return budget;
  return { ...budget, ...telemetry };
}

export function contextUsageTelemetryFromUsage(usage: unknown): ContextUsageTelemetry | undefined {
  const record = asRecord(usage);
  if (!record) return undefined;

  const inputTokenDetails = asRecord(record.inputTokenDetails);
  const outputTokenDetails = asRecord(record.outputTokenDetails);
  const raw = asRecord(record.raw);
  const promptTokenDetails = asRecord(raw?.prompt_tokens_details);
  const completionTokenDetails = asRecord(raw?.completion_tokens_details);

  const measuredInputTokens = firstNumber(record.inputTokens, record.promptTokens, raw?.prompt_tokens);
  const measuredOutputTokens = firstNumber(record.outputTokens, record.completionTokens, raw?.completion_tokens);
  const measuredTotalTokens = firstNumber(record.totalTokens, raw?.total_tokens);
  const cachedInputTokens = firstNumber(
    inputTokenDetails?.cacheReadTokens,
    record.cachedInputTokens,
    promptTokenDetails?.cached_tokens,
  );
  const cacheWriteTokens = firstNumber(inputTokenDetails?.cacheWriteTokens);
  const noCacheTokens = firstNumber(inputTokenDetails?.noCacheTokens);
  const reasoningTokens = firstNumber(outputTokenDetails?.reasoningTokens, completionTokenDetails?.reasoning_tokens);

  const telemetry = sanitizeContextUsageTelemetry({
    measuredInputTokens,
    measuredOutputTokens,
    measuredTotalTokens,
    cachedInputTokens,
    cacheWriteTokens,
    noCacheTokens,
    reasoningTokens,
    usageSource: "openai-usage",
  });

  return telemetry && Object.keys(telemetry).length > 1 ? telemetry : undefined;
}

function readNumberHeader(headers: Headers, key: string): number | undefined {
  const raw = headers.get(key);
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function countContextFiles(context: string): number {
  const files = new Set<string>();
  for (const line of context.split("\n")) {
    const match = /^\/\/\s+(.+)$/.exec(line.trim());
    if (!match) continue;
    const value = match[1];
    if (isLikelyFilePath(value)) files.add(value);
  }
  return files.size;
}

function isLikelyFilePath(value: string): boolean {
  if (value.startsWith("Repo:")) return false;
  if (value.startsWith("Context mode:")) return false;
  if (value.startsWith("File cap:")) return false;
  if (value.startsWith("Could not")) return false;
  if (value.startsWith("GitHub API error")) return false;
  return /(^|\/)[^/]+\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|rb|json|md|toml|yaml|yml)$/.test(value);
}

function sanitizeContextUsageTelemetry(value: unknown): ContextUsageTelemetry | undefined {
  const record = asRecord(value);
  if (!record) return undefined;

  const telemetry: ContextUsageTelemetry = {};
  const measuredInputTokens = firstNumber(record.measuredInputTokens);
  const measuredOutputTokens = firstNumber(record.measuredOutputTokens);
  const measuredTotalTokens = firstNumber(record.measuredTotalTokens);
  const cachedInputTokens = firstNumber(record.cachedInputTokens);
  const cacheWriteTokens = firstNumber(record.cacheWriteTokens);
  const noCacheTokens = firstNumber(record.noCacheTokens);

  if (measuredInputTokens !== undefined) telemetry.measuredInputTokens = measuredInputTokens;
  if (measuredOutputTokens !== undefined) telemetry.measuredOutputTokens = measuredOutputTokens;
  if (measuredTotalTokens !== undefined) telemetry.measuredTotalTokens = measuredTotalTokens;
  if (cachedInputTokens !== undefined) telemetry.cachedInputTokens = cachedInputTokens;
  if (cacheWriteTokens !== undefined) telemetry.cacheWriteTokens = cacheWriteTokens;
  if (noCacheTokens !== undefined) telemetry.noCacheTokens = noCacheTokens;
  if (typeof record.usageSource === "string" && record.usageSource.length < 40) {
    telemetry.usageSource = record.usageSource;
  }

  return Object.keys(telemetry).length > 0 ? telemetry : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  }
  return undefined;
}
