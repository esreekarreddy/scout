import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { AGENTS, buildReviewMessage } from "@/lib/prompts";
import { getDemoReviewStream, isDemoRepo } from "@/lib/demo-fixtures";
import { normalizeModelProfile, selectModel } from "@/lib/model-policy";
import { getVerifiedRepoContext } from "@/lib/live-runner";
import { buildContextBudget, buildPromptCacheKey, contextBudgetHeaders, encodeContextUsageTelemetry } from "@/lib/context-budget";
import {
  apiErrorResponse,
  apiHeaders,
  assertRateLimit,
  assertTrustedOrigin,
  parseReviewRequest,
  readJsonRequest,
  requireOpenAIKey,
} from "@/lib/api-security";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    assertRateLimit(req, "review", 18);
    const { repo, aspect, modelProfile } = parseReviewRequest(await readJsonRequest(req));

    const agent = AGENTS.find((a) => a.aspect === aspect);
    if (!agent) return new Response("Unknown aspect", { status: 400, headers: apiHeaders() });

    if (isDemoRepo(repo)) {
      const model = "deterministic-seed";
      const budget = buildContextBudget({
        repoContext: getDemoContextForBudget(),
        model,
        modelProfile: "env",
      });
      return streamPlainText(getDemoReviewStream(aspect), 28, {
        "X-Scout-Model": model,
        "X-Scout-Model-Profile": "demo",
        ...contextBudgetHeaders(budget),
      });
    }

    requireOpenAIKey();

    const repoContext = await getVerifiedRepoContext(repo);

    const profile = normalizeModelProfile(modelProfile);
    const model = selectModel({ profile, task: "review", fallback: process.env.OPENAI_MODEL });
    const promptCacheKey = buildPromptCacheKey("review", aspect);
    const budget = buildContextBudget({ repoContext, model, modelProfile: profile ?? "env", promptCacheKey });
    const result = streamText({
      model: openai(model),
      system: agent.system,
      messages: [{ role: "user", content: buildReviewMessage(repoContext) }],
      providerOptions: {
        openai: {
          promptCacheKey,
        },
      },
    });

    return streamPlainText(result.textStream, 0, {
      "X-Scout-Model": model,
      "X-Scout-Model-Profile": profile ?? "env",
      ...contextBudgetHeaders(budget),
    }, result.totalUsage);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

function getDemoContextForBudget() {
  return [
    "// src/auth.ts",
    "// src/audit.ts",
    "// src/routes.ts",
    "// test/auth.test.ts",
    "// README.md",
  ].join("\n");
}

function streamPlainText(
  source: AsyncIterable<string> | string,
  delayMs = 0,
  headers: Record<string, string> = {},
  usage?: PromiseLike<unknown>,
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      if (typeof source === "string") {
        const chunks = source.match(/.{1,96}(\s|$)/g) ?? [source];
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
          if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      } else {
        for await (const chunk of source) {
          controller.enqueue(encoder.encode(chunk));
        }
      }

      if (usage) {
        const telemetryLine = await usage.then(encodeContextUsageTelemetry, () => undefined);
        if (telemetryLine) controller.enqueue(encoder.encode(`\n${telemetryLine}\n`));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: apiHeaders({ "Content-Type": "text/plain; charset=utf-8", ...headers }),
  });
}
