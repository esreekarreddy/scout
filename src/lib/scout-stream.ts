import type { Aspect, Finding, FixStrategy, ScoutModelProfile } from "./types";
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
): Promise<{ model?: string }> {
  const res = await fetch("/api/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo, aspect, modelProfile }),
  });
  if (!res.ok || !res.body) throw new Error(`API error ${res.status}`);
  const model = res.headers.get("X-Scout-Model") ?? undefined;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    buffer += chunk;
    onChunk(chunk);

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const f = parseFindingLine(line.trim());
      if (f) onFinding(f);
    }
  }
  if (buffer.trim()) {
    const f = parseFindingLine(buffer.trim());
    if (f) onFinding(f);
  }
  return { model };
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
  if (!res.ok || !res.body) throw new Error(`API error ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
}
