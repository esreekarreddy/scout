import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { fetchRepoContext } from "@/lib/github";
import { AGENTS, buildReviewMessage } from "@/lib/prompts";
import { getDemoReviewStream, isDemoRepo } from "@/lib/demo-fixtures";
import { normalizeModelProfile, selectModel } from "@/lib/model-policy";
import type { Aspect, ScoutModelProfile } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { repo, aspect, modelProfile } = (await req.json()) as {
    repo: string;
    aspect: Aspect;
    modelProfile?: ScoutModelProfile;
  };

  const agent = AGENTS.find((a) => a.aspect === aspect);
  if (!agent) return new Response("Unknown aspect", { status: 400 });

  if (isDemoRepo(repo)) {
    return streamPlainText(getDemoReviewStream(aspect), 28);
  }

  let repoContext = "";
  try {
    repoContext = await fetchRepoContext(repo);
  } catch {
    repoContext = `// Could not fetch ${repo}. Add GITHUB_TOKEN to .env.local for higher rate limits.`;
  }

  const profile = normalizeModelProfile(modelProfile);
  const model = selectModel({ profile, task: "review", fallback: process.env.OPENAI_MODEL });
  const result = streamText({
    model: openai(model),
    system: agent.system,
    messages: [{ role: "user", content: buildReviewMessage(repoContext) }],
  });

  return streamPlainText(result.textStream, 0, {
    "X-Scout-Model": model,
    "X-Scout-Model-Profile": profile ?? "env",
  });
}

function streamPlainText(source: AsyncIterable<string> | string, delayMs = 0, headers: Record<string, string> = {}) {
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
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", ...headers },
  });
}
