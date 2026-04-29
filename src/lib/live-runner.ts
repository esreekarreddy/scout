import { createHash } from "node:crypto";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { fetchRepoContext } from "./github";
import { buildContextBudget, buildPromptCacheKey, contextUsageTelemetryFromUsage, mergeContextUsageTelemetry } from "./context-budget";
import { normalizeModelProfile, selectModel } from "./model-policy";
import { AGENTS, FIX_STRATEGIES, buildFixMessage, buildReviewMessage, parseFindingLine } from "./prompts";
import { ApiError, requireOpenAIKey } from "./api-security";
import type { Aspect, Finding, FixStrategy, PatchCandidate, ScoutModelProfile } from "./types";

export interface LiveReviewAgentResult {
  repo: string;
  aspect: Aspect;
  model: string;
  raw: string;
  findings: Finding[];
  contextBudget: ReturnType<typeof buildContextBudget>;
}

export interface LiveFixResult {
  repo: string;
  findingId: string;
  model: string;
  candidates: PatchCandidate[];
}

function checksum(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function findingId(aspect: Aspect, finding: Omit<Finding, "id" | "aspect">, index: number) {
  return checksum([aspect, finding.file, finding.line ?? 0, finding.title, index]);
}

function patchId(repo: string, findingIdValue: string, strategy: FixStrategy, patch: string) {
  return checksum([repo, findingIdValue, strategy, patch]);
}

export async function getVerifiedRepoContext(repo: string) {
  const repoContext = await fetchRepoContext(repo);
  if (!repoContext.trim() || /^\/\/\s+(Could not|Empty repo|GitHub API error)/.test(repoContext.trim())) {
    throw new ApiError(502, "repository context unavailable; Scout will not ask a model to review an empty placeholder");
  }
  return repoContext;
}

export async function runLiveReviewAgent(input: {
  repo: string;
  aspect: Aspect;
  modelProfile?: ScoutModelProfile;
}): Promise<LiveReviewAgentResult> {
  requireOpenAIKey();
  const agent = AGENTS.find((item) => item.aspect === input.aspect);
  if (!agent) throw new ApiError(400, "unknown Scout aspect");

  const repoContext = await getVerifiedRepoContext(input.repo);
  const profile = normalizeModelProfile(input.modelProfile);
  const model = selectModel({ profile, task: "review", fallback: process.env.OPENAI_MODEL });
  const promptCacheKey = buildPromptCacheKey("review", input.aspect);
  const baseBudget = buildContextBudget({ repoContext, model, modelProfile: profile ?? "env", promptCacheKey });
  const result = await generateText({
    model: openai(model),
    system: agent.system,
    messages: [{ role: "user", content: buildReviewMessage(repoContext) }],
    providerOptions: {
      openai: {
        promptCacheKey,
      },
    },
  });
  const telemetry = contextUsageTelemetryFromUsage(result.totalUsage);
  const findings = result.text
    .split("\n")
    .map((line) => parseFindingLine(line.trim()))
    .filter((finding): finding is Omit<Finding, "id" | "aspect"> => Boolean(finding))
    .map((finding, index) => ({
      ...finding,
      id: findingId(input.aspect, finding, index),
      aspect: input.aspect,
    }));

  return {
    repo: input.repo,
    aspect: input.aspect,
    model,
    raw: result.text,
    findings,
    contextBudget: mergeContextUsageTelemetry(baseBudget, telemetry) ?? baseBudget,
  };
}

export async function runLiveReview(input: {
  repo: string;
  modelProfile?: ScoutModelProfile;
}) {
  const results = await Promise.all(AGENTS.map((agent) =>
    runLiveReviewAgent({ repo: input.repo, aspect: agent.aspect, modelProfile: input.modelProfile })
  ));
  return {
    repo: input.repo,
    mode: "live" as const,
    results,
    findings: results.flatMap((result) => result.findings),
    evidence: results.map((result) =>
      `${result.aspect}: model ${result.model}, ${result.findings.length} schema-valid finding${result.findings.length === 1 ? "" : "s"}`
    ),
  };
}

export async function runLiveFix(input: {
  repo: string;
  finding: Finding;
  strategy?: FixStrategy;
  modelProfile?: ScoutModelProfile;
}): Promise<LiveFixResult> {
  requireOpenAIKey();
  const repoContext = await getVerifiedRepoContext(input.repo);
  const profile = normalizeModelProfile(input.modelProfile);
  const strategies = input.strategy ? [input.strategy] : FIX_STRATEGIES.map((strategy) => strategy.key);
  const candidates = await Promise.all(strategies.map(async (strategy) => {
    const cfg = FIX_STRATEGIES.find((item) => item.key === strategy);
    if (!cfg) throw new ApiError(400, "unknown fix strategy");
    const model = selectModel({ profile, task: "fix", fallback: process.env.OPENAI_MODEL });
    const result = await generateText({
      model: openai(model),
      system: cfg.system,
      messages: [{ role: "user", content: buildFixMessage(repoContext, input.finding) }],
    });
    return {
      model,
      candidate: {
        id: patchId(input.repo, input.finding.id, strategy, result.text),
        findingId: input.finding.id,
        strategy,
        patch: result.text,
      },
    };
  }));

  return {
    repo: input.repo,
    findingId: input.finding.id,
    model: candidates[0]?.model ?? selectModel({ profile, task: "fix", fallback: process.env.OPENAI_MODEL }),
    candidates: candidates.map((item) => item.candidate),
  };
}
