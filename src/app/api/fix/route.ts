import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { fetchRepoContext } from "@/lib/github";
import { FIX_STRATEGIES, buildFixMessage } from "@/lib/prompts";
import { getDemoFixPatch, isDemoRepo } from "@/lib/demo-fixtures";
import type { Finding, FixStrategy } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * BETA mechanism - parallel fix generation.
 * Client calls this 3x in parallel with different `strategy` values.
 * Each call streams a unified diff back as text.
 */
export async function POST(req: Request) {
  const { repo, finding, strategy } = (await req.json()) as {
    repo: string;
    finding: Finding;
    strategy: FixStrategy;
  };

  const cfg = FIX_STRATEGIES.find((s) => s.key === strategy);
  if (!cfg) return new Response("Unknown strategy", { status: 400 });

  if (isDemoRepo(repo)) {
    return streamPlainText(getDemoFixPatch(finding.title, strategy), 16);
  }

  let repoContext = "";
  try {
    repoContext = await fetchRepoContext(repo);
  } catch {
    repoContext = "// Could not fetch repo context.";
  }

  const result = streamText({
    model: openai(process.env.OPENAI_MODEL ?? "gpt-5.5"),
    system: cfg.system,
    messages: [{ role: "user", content: buildFixMessage(repoContext, finding) }],
  });

  return streamPlainText(result.textStream);
}

function streamPlainText(source: AsyncIterable<string> | string, delayMs = 0) {
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
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
