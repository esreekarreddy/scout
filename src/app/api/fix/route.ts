import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { FIX_STRATEGIES, buildFixMessage } from "@/lib/prompts";
import { getDemoFixPatch, isDemoRepo } from "@/lib/demo-fixtures";
import { normalizeModelProfile, selectModel } from "@/lib/model-policy";
import { getVerifiedRepoContext } from "@/lib/live-runner";
import {
  apiErrorResponse,
  apiHeaders,
  assertRateLimit,
  assertTrustedOrigin,
  parseFixRequest,
  readJsonRequest,
  requireOpenAIKey,
} from "@/lib/api-security";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * BETA mechanism - parallel fix generation.
 * Client calls this 3x in parallel with different `strategy` values.
 * Each call streams a unified diff back as text.
 */
export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    assertRateLimit(req, "fix", 24);
    const { repo, finding, strategy, modelProfile } = parseFixRequest(await readJsonRequest(req));

    const cfg = FIX_STRATEGIES.find((s) => s.key === strategy);
    if (!cfg) return new Response("Unknown strategy", { status: 400, headers: apiHeaders() });

    if (isDemoRepo(repo)) {
      return streamPlainText(getDemoFixPatch(finding.title, strategy), 16);
    }

    requireOpenAIKey();

    const repoContext = await getVerifiedRepoContext(repo);

    const profile = normalizeModelProfile(modelProfile);
    const model = selectModel({ profile, task: "fix", fallback: process.env.OPENAI_MODEL });
    const result = streamText({
      model: openai(model),
      system: cfg.system,
      messages: [{ role: "user", content: buildFixMessage(repoContext, finding) }],
    });

    return streamPlainText(result.textStream, 0, {
      "X-Scout-Model": model,
      "X-Scout-Model-Profile": profile ?? "env",
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

function streamPlainText(source: AsyncIterable<string> | string, delayMs = 0, headers: Record<string, string> = {}) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      if (typeof source === "string") {
        const chunks = source.match(/.{1,88}(\s|$)/g) ?? [source];
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
          if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      } else {
        for await (const chunk of source) {
          controller.enqueue(encoder.encode(chunk));
        }
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: apiHeaders({ "Content-Type": "text/plain; charset=utf-8", ...headers }),
  });
}
