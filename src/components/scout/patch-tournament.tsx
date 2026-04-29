import { scorePatchTournament } from "@/lib/tournament";
import type {
  Finding,
  FixerState,
  FixStrategy,
  PatchExecutionSummary,
  PatchScore,
  PatchScoreBreakdown,
} from "@/lib/types";

interface LocalPatchScore {
  id: string;
  strategy: FixStrategy;
  label: string;
  status: FixerState["status"];
  statusLabel: string;
  detail?: string;
  score: number;
  rank: number;
  winner: boolean;
  touchedFiles: string[];
  testFiles: string[];
  breakdown: PatchScoreBreakdown;
  checksum: string;
}

function simpleChecksum(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function emptyBreakdown(): PatchScoreBreakdown {
  return {
    targetsFinding: 0,
    removesRisk: 0,
    addsProof: 0,
    scopeControl: 0,
    regressionRisk: 0,
  };
}

function strategyFromCandidateId(candidateId: string): FixStrategy | undefined {
  if (candidateId.endsWith("-conservative")) return "conservative";
  if (candidateId.endsWith("-idiomatic")) return "idiomatic";
  if (candidateId.endsWith("-robust")) return "robust";
  return undefined;
}

function scorePatch(finding: Finding, fixer: FixerState): Omit<LocalPatchScore, "rank" | "winner"> {
  const [score] = scorePatchTournament([
    {
      id: `${finding.id}-${fixer.strategy}`,
      findingId: finding.id,
      strategy: fixer.strategy,
      patch: fixer.patch,
    },
  ], [finding]);

  return {
    id: `${finding.id}-${fixer.strategy}`,
    strategy: fixer.strategy,
    label: fixer.label,
    status: fixer.status,
    statusLabel: fixer.errorMessage ? "generation failed" : fixer.status,
    detail: fixer.errorMessage,
    score: fixer.status === "done" ? score.score : 0,
    touchedFiles: score.touchedFiles,
    testFiles: score.testFiles,
    breakdown: score.breakdown,
    checksum: fixer.status === "done" ? score.checksum : simpleChecksum(`${finding.id}:${fixer.strategy}:pending`),
  };
}

export function buildLocalPatchTournament(finding: Finding, fixers: FixerState[]) {
  const scored = fixers
    .map((fixer) => scorePatch(finding, fixer))
    .sort((a, b) => b.score - a.score || a.strategy.localeCompare(b.strategy));

  return scored.map((score, index) => ({
    ...score,
    rank: score.status === "done" && score.score > 0 ? index + 1 : 0,
    winner: index === 0 && score.status === "done" && score.score > 0,
  }));
}

export function buildServerPatchTournament(
  fixers: FixerState[],
  serverScores: PatchScore[],
  executions: PatchExecutionSummary[] = [],
) {
  const executionByCandidate = new Map(executions.map((execution) => [execution.candidateId, execution]));
  const rows: LocalPatchScore[] = serverScores.map((score) => {
    const fixer = fixers.find((candidate) => candidate.strategy === score.strategy);
    const execution = executionByCandidate.get(score.candidateId);
    const disqualified = execution?.eligible === false;
    return {
      id: score.candidateId,
      strategy: score.strategy,
      label: fixer?.label ?? score.strategy,
      status: disqualified ? "error" : fixer?.status ?? "done",
      statusLabel: disqualified
        ? `disqualified: ${execution.disqualifiedReason ?? "apply/check failed"}`
        : fixer?.errorMessage
          ? "generation failed"
          : fixer?.status ?? "done",
      detail: disqualified ? execution.applySummary : fixer?.errorMessage,
      score: score.score,
      rank: disqualified ? 0 : score.rank,
      winner: score.winner,
      touchedFiles: score.touchedFiles,
      testFiles: score.testFiles,
      breakdown: score.breakdown,
      checksum: score.checksum,
    };
  });
  const scoredIds = new Set(rows.map((row) => row.id));

  for (const execution of executions) {
    if (scoredIds.has(execution.candidateId)) continue;
    const strategy = strategyFromCandidateId(execution.candidateId);
    const fixer = strategy ? fixers.find((candidate) => candidate.strategy === strategy) : undefined;
    rows.push({
      id: execution.candidateId,
      strategy: strategy ?? "conservative",
      label: fixer?.label ?? strategy ?? "Rejected patch",
      status: "error",
      statusLabel: `disqualified: ${execution.disqualifiedReason ?? "invalid patch"}`,
      detail: execution.applySummary,
      score: 0,
      rank: 0,
      winner: false,
      touchedFiles: [],
      testFiles: [],
      breakdown: emptyBreakdown(),
      checksum: simpleChecksum(`${execution.candidateId}:${execution.disqualifiedReason ?? "rejected"}`),
    });
  }

  return rows.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.rank !== b.rank) return (a.rank || Number.MAX_SAFE_INTEGER) - (b.rank || Number.MAX_SAFE_INTEGER);
    return a.strategy.localeCompare(b.strategy);
  });
}

export function PatchTournament({
  finding,
  fixers,
  serverScores,
  executions,
  executionMode,
  serverScoringSettled,
}: {
  finding: Finding;
  fixers: FixerState[];
  serverScores?: PatchScore[];
  executions?: PatchExecutionSummary[];
  executionMode?: string;
  serverScoringSettled?: boolean;
}) {
  const useServerScores = Boolean(serverScoringSettled || serverScores?.length);
  const scores = useServerScores
    ? buildServerPatchTournament(fixers, serverScores ?? [], executions)
    : buildLocalPatchTournament(finding, fixers);
  const winner = scores.find((score) => score.winner);
  const noEligiblePatch = Boolean(serverScoringSettled && scores.length > 0 && !scores.some((score) => score.status === "done" && score.score > 0));
  const modeLabel = executionMode === "apply-gated"
    ? "apply gated"
    : executionMode === "repo-context-unavailable"
      ? "repo unavailable"
      : "deterministic scorer";

  return (
    <section className="card" style={{ padding: 0, overflow: "hidden", borderRadius: 10 }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <p style={{ fontWeight: 800, fontSize: 14 }}>Patch tournament</p>
              <span
                style={{
                  border: "1px solid var(--green-border)",
                  background: "var(--green-surface)",
                  color: "var(--green)",
                  borderRadius: 999,
                  padding: "2px 8px",
                  fontSize: 10,
                  fontWeight: 900,
                  textTransform: "uppercase",
                }}
              >
                {modeLabel}
              </span>
            </div>
            <p style={{ color: "var(--ink-2)", fontSize: 12, marginTop: 3 }}>
              Three repair agents compete. The model writes patches, then Scout ranks target fit, risk removal, proof, scope, and patch apply eligibility.
            </p>
          </div>
          <p style={{ color: winner ? "var(--green)" : noEligiblePatch ? "var(--red)" : "var(--ink-3)", fontWeight: 900, fontSize: 12, textAlign: "right", minWidth: 150 }}>
            {winner ? `Winner: ${winner.label}` : noEligiblePatch ? "No eligible patch" : "Awaiting completed patches"}
          </p>
        </div>
      </div>

      <div className="scroll-thin" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
          <thead>
            <tr style={{ background: "var(--canvas)", color: "var(--ink-2)", fontSize: 11, textTransform: "uppercase" }}>
              {["Rank", "Strategy", "Score", "Targets", "Risk", "Proof", "Scope", "Regress", "Touched files", "Checksum"].map((header) => (
                <th key={header} style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid var(--border)", fontWeight: 800 }}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scores.map((score) => (
              <tr key={score.id} style={{ background: score.winner ? "var(--green-surface)" : "var(--surface)" }}>
                <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--border)", fontWeight: 800 }}>
                  {score.rank || "-"}
                </td>
                <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--border)" }}>
                  <p style={{ fontWeight: 700, fontSize: 12 }}>{score.label}</p>
                  <p
                    style={{
                      color: score.status === "error" ? "var(--red)" : "var(--ink-3)",
                      fontSize: 11,
                      overflowWrap: "anywhere",
                    }}
                    title={score.detail}
                  >
                    {score.statusLabel}
                  </p>
                </td>
                <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--border)", color: score.winner ? "var(--green)" : "var(--ink)", fontWeight: 900 }}>
                  {score.score}
                </td>
                <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--border)" }}>{score.breakdown.targetsFinding}</td>
                <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--border)" }}>{score.breakdown.removesRisk}</td>
                <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--border)" }}>{score.breakdown.addsProof}</td>
                <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--border)" }}>{score.breakdown.scopeControl}</td>
                <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--border)" }}>{score.breakdown.regressionRisk}</td>
                <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--border)", color: "var(--ink-2)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
                  {score.touchedFiles.length > 0 ? score.touchedFiles.join(", ") : "pending"}
                </td>
                <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--border)", color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
                  {score.checksum}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
