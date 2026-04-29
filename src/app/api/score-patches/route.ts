import { fetchRepoFiles } from "@/lib/github";
import { executePatchTournament } from "@/lib/patch-executor";
import { scorePatchTournament } from "@/lib/tournament";
import type { Finding, FixerState, PatchCandidate, PatchExecutionSummary } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { repo, finding, fixers } = (await req.json()) as {
    repo: string;
    finding: Finding;
    fixers: FixerState[];
  };

  const completed = fixers.filter((fixer) => fixer.status === "done" && fixer.patch.trim().length > 0);
  const candidates: PatchCandidate[] = completed.map((fixer) => ({
    id: `${finding.id}-${fixer.strategy}`,
    findingId: finding.id,
    strategy: fixer.strategy,
    patch: fixer.patch,
  }));

  if (candidates.length === 0) {
    return Response.json({ scores: [], executions: [], mode: "no-completed-patches" });
  }

  const repoFiles = await fetchRepoFiles(repo);
  const executionResults = repoFiles.length > 0
    ? await executePatchTournament({
      candidates,
      repoFiles,
      checkCommands: [],
      timeoutMs: 8_000,
    })
    : undefined;

  const scores = scorePatchTournament(candidates, [finding], executionResults);
  const executions: PatchExecutionSummary[] = Object.values(executionResults ?? {}).map((result) => ({
    candidateId: result.candidateId,
    eligible: result.eligible,
    applySummary: result.apply.summary,
    checkSummaries: result.checks.map((check) => check.summary),
    disqualifiedReason: result.disqualifiedReason,
  }));

  return Response.json({
    scores,
    executions,
    mode: executionResults ? "apply-gated" : "score-only",
  });
}
