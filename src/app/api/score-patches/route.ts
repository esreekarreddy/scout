import { fetchRepoFiles } from "@/lib/github";
import { validateLiveFixerPatch } from "@/lib/live-schemas";
import { executePatchTournament } from "@/lib/patch-executor";
import { scorePatchTournament } from "@/lib/tournament";
import { isDemoRepo } from "@/lib/demo-fixtures";
import type { Finding, FixerState, PatchCandidate, PatchExecutionSummary } from "@/lib/types";
import type { CommandSummary, PatchExecutionResult } from "@/lib/patch-executor";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { repo, finding, fixers } = (await req.json()) as {
    repo: string;
    finding: Finding;
    fixers: FixerState[];
  };

  const completed = fixers.filter((fixer) => fixer.status === "done" && fixer.patch.trim().length > 0);
  const rejectedExecutions: PatchExecutionSummary[] = [];
  const candidates: PatchCandidate[] = completed.flatMap((fixer) => {
    try {
      const parsed = validateLiveFixerPatch({
        findingId: finding.id,
        strategy: fixer.strategy,
        patch: fixer.patch,
      });
      return [{
        id: `${finding.id}-${parsed.strategy}`,
        findingId: parsed.findingId,
        strategy: parsed.strategy,
        patch: parsed.patch,
      }];
    } catch (error) {
      rejectedExecutions.push({
        candidateId: `${finding.id}-${fixer.strategy}`,
        eligible: false,
        applySummary: error instanceof Error ? error.message : "patch validation failed",
        checkSummaries: [],
        disqualifiedReason: "invalid-patch-schema",
      });
      return [];
    }
  });

  if (candidates.length === 0) {
    return Response.json({ scores: [], executions: rejectedExecutions, mode: "no-valid-patches" });
  }

  const repoFiles = await fetchRepoFiles(repo);
  const repoFilesUnavailable = repoFiles.length === 0 && !isDemoRepo(repo);
  const executionResults = repoFiles.length > 0
    ? await executePatchTournament({
      candidates,
      repoFiles,
      checkCommands: [],
      timeoutMs: 8_000,
    })
    : isDemoRepo(repo)
      ? undefined
      : repoContextUnavailableExecutions(candidates);

  const scores = scorePatchTournament(candidates, [finding], executionResults);
  const executions: PatchExecutionSummary[] = [
    ...rejectedExecutions,
    ...Object.values(executionResults ?? {}).map((result) => ({
      candidateId: result.candidateId,
      eligible: result.eligible,
      applySummary: result.apply.summary,
      checkSummaries: result.checks.map((check) => check.summary),
      disqualifiedReason: result.disqualifiedReason,
    })),
  ];

  return Response.json({
    scores,
    executions,
    mode: repoFilesUnavailable ? "repo-context-unavailable" : executionResults ? "apply-gated" : "score-only",
  });
}

function repoContextUnavailableExecutions(candidates: PatchCandidate[]): Record<string, PatchExecutionResult> {
  return Object.fromEntries(candidates.map((candidate) => {
    const apply = commandSummary("Scout could not fetch repository files, so this patch was not applied.");
    return [candidate.id, {
      candidateId: candidate.id,
      eligible: false,
      disqualifiedReason: "repo-context-unavailable",
      apply,
      checks: [],
    } satisfies PatchExecutionResult];
  }));
}

function commandSummary(summary: string): CommandSummary {
  return {
    command: "fetch repo files",
    exitCode: 1,
    signal: null,
    durationMs: 0,
    summary,
    stdout: "",
    stderr: summary,
    truncated: false,
  };
}
