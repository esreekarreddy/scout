"use client";

import { useState } from "react";
import type { AgentState, Finding, ScoutModelProfile } from "@/lib/types";
import { calcHealth } from "@/lib/health";
import { calcEvalScore, judgeFindings } from "@/lib/judge";
import { calcLiveTargetStats } from "@/lib/live-target";
import { isDemoRepo } from "@/lib/demo-fixtures";
import { TopBar } from "./top-bar";
import { HealthGauge } from "./health-gauge";
import { Stat } from "./stat";
import { AgentCard } from "./agent-card";
import { FindingFeed } from "./finding-feed";
import { EvalScorecard } from "./eval-scorecard";
import { JudgePanel } from "./judge-panel";
import { PipelineTimeline } from "./pipeline-timeline";
import { EvidencePack } from "./evidence-pack";
import { EvidenceMap } from "./evidence-map";
import { TraceReceipt } from "./trace-receipt";
import { ContextBudgetCard } from "./context-budget-card";

/**
 * The post-launch view: top bar, health summary, 3 agent columns,
 * findings feed.
 *
 * INTEGRATION SLOTS (numbered for parallel-task ownership):
 *   [SLOT-1A] before <SummaryRow/> - Orchestrator timeline (Task 1A)
 *   [SLOT-1B] right of FindingFeed - Judge results panel (Task 1B)
 *   [SLOT-2A] right of agents grid - Knowledge graph (Task 2A)
 *   [SLOT-2C] above SummaryRow - Trend sparkline (Task 2C)
 *
 * Tasks should ADD components in their slot, not modify existing ones.
 */
export function DashboardView({
  repo,
  modelProfile,
  agents,
  allDone,
  onReset,
  onRunSeededDemo,
  onFix,
}: {
  repo: string;
  modelProfile: ScoutModelProfile;
  agents: AgentState[];
  allDone: boolean;
  onReset: () => void;
  onRunSeededDemo: () => void;
  onFix: (f: Finding) => void;
}) {
  const [openPromptIdx, setOpenPromptIdx] = useState<number | null>(null);
  const [dismissedLiveNotice, setDismissedLiveNotice] = useState(false);
  const allFindings = agents.flatMap((a) => a.findings);
  const judgedFindings = judgeFindings(allFindings);
  const score = calcHealth(judgedFindings);
  const evalScore = calcEvalScore(allFindings);
  const liveTargetStats = calcLiveTargetStats(repo, judgedFindings);
  const isDemo = isDemoRepo(repo);
  const runningCount = agents.filter((a) => a.status === "running").length;
  const doneCount = agents.filter((a) => a.status === "done").length;
  const erroredAgents = agents.filter((a) => a.status === "error");
  const showLiveConfigNotice = !isDemo && allDone && erroredAgents.length === agents.length && !dismissedLiveNotice;
  const scorecardTitle = liveTargetStats.enabled
    ? "Live target answer key"
    : isDemo
      ? "Seeded proof benchmark"
      : "Live review summary";
  const scorecardSubtitle = liveTargetStats.enabled
    ? "This public target repo has planted mistakes, so live model findings can be measured instead of just admired."
    : isDemo
      ? "Demo mode is measured against known AI-code mistakes, so recall and noise stay visible."
      : "No answer key is claimed for this repo. Scout shows model findings separated by deterministic judge labels.";
  const scorecardScores = liveTargetStats.enabled
    ? [
      {
        id: "caught",
        label: "Caught",
        value: liveTargetStats.caught,
        max: liveTargetStats.total,
        note: "matched planted target issues",
        tone: "green" as const,
      },
      {
        id: "confirmed",
        label: "Confirmed",
        value: liveTargetStats.confirmed,
        max: Math.max(1, judgedFindings.length),
        note: "deduped judge groups with evidence",
        tone: "blue" as const,
      },
      {
        id: "missed",
        label: "Missed",
        value: liveTargetStats.missed,
        max: liveTargetStats.total,
        note: "answer-key issues not found yet",
        tone: liveTargetStats.missed > 2 ? "red" as const : "amber" as const,
      },
    ]
    : isDemo
      ? [
        {
          id: "caught",
          label: "Caught",
          value: evalScore.caught,
          max: evalScore.seededMistakes,
          note: "raw seeded findings surfaced",
          tone: "green" as const,
        },
        {
          id: "confirmed",
          label: "Confirmed",
          value: evalScore.confirmed,
          max: evalScore.seededMistakes,
          note: "deduped judge groups with evidence",
          tone: "blue" as const,
        },
        {
          id: "speculative",
          label: "Speculative",
          value: evalScore.speculative,
          max: Math.max(1, judgedFindings.length),
          note: "kept separate from demo claims",
          tone: evalScore.speculative > 2 ? "red" as const : "amber" as const,
        },
      ]
      : [
        {
          id: "confirmed",
          label: "Confirmed",
          value: judgedFindings.filter((finding) => finding.verdict === "confirmed").length,
          max: Math.max(1, judgedFindings.length),
          note: "high-confidence or cross-agent groups",
          tone: "blue" as const,
        },
        {
          id: "likely",
          label: "Likely",
          value: judgedFindings.filter((finding) => finding.verdict === "likely").length,
          max: Math.max(1, judgedFindings.length),
          note: "evidence-backed but not proven by answer key",
          tone: "amber" as const,
        },
        {
          id: "speculative",
          label: "Speculative",
          value: judgedFindings.filter((finding) => finding.verdict === "speculative").length,
          max: Math.max(1, judgedFindings.length),
          note: "visible, but blocked from proof claims",
          tone: "red" as const,
        },
      ];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <TopBar repo={repo} modelProfile={modelProfile} onReset={onReset} />
      {showLiveConfigNotice && (
        <LiveConfigNotice
          message={summarizeLiveError(erroredAgents)}
          onClose={() => setDismissedLiveNotice(true)}
          onRunSeededDemo={() => {
            setDismissedLiveNotice(true);
            onRunSeededDemo();
          }}
        />
      )}

      <main style={{ flex: 1, maxWidth: 1320, margin: "0 auto", width: "100%", padding: "28px 24px" }}>
        {/* [SLOT-2C] · Tier-2 Task 2C: Trend sparkline goes here */}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 24 }}>
          <div
            className="card anim-fade-in"
            style={{
              padding: "22px 24px",
              display: "flex",
              alignItems: "center",
              gap: 22,
              background: "linear-gradient(135deg, #101711, #183023)",
              color: "#f8fff8",
              borderColor: "#254234",
            }}
          >
            <HealthGauge score={score} done={allDone} />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, color: "rgba(248,255,248,0.94)", marginBottom: 10, fontWeight: 750 }}>
                {allDone ? "Heuristic risk judge complete" : "Evaluating AI-code failures"}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Stat label="Confirmed" value={judgedFindings.filter((f) => f.verdict === "confirmed").length} color="#45e08d" labelColor="rgba(248,255,248,0.8)" />
                <Stat label="Likely" value={judgedFindings.filter((f) => f.verdict === "likely").length} color="#ffb233" labelColor="rgba(248,255,248,0.8)" />
                <Stat label="Raw" value={allFindings.length} color="#60cce7" labelColor="rgba(248,255,248,0.8)" />
                <Stat label="Agents" value={`${doneCount}/3`} color="#f5fff0" labelColor="rgba(248,255,248,0.8)" />
              </div>
            </div>
          </div>

          <EvalScorecard
            title={scorecardTitle}
            subtitle={scorecardSubtitle}
            scores={scorecardScores}
          />

          <ContextBudgetCard agents={agents} />
        </div>

        {/* [SLOT-1A] · Tier-1 Task 1A: Orchestrator timeline goes here */}
        <PipelineTimeline
          title="MCP-native repair loop"
          subtitle="Tool call, specialist scouts, judge, patch tournament, then a receipt. The proof stays visible before the code fix."
          steps={[
            {
              id: "source",
              label: "Tool intake",
              description: "Load a repo or deterministic benchmark through the Scout tool surface.",
              status: "done",
              detail: repo,
            },
            {
              id: "scouts",
              label: "Specialist scouts",
              description: "Hallucination, spec drift, and test theater agents inspect in parallel.",
              status: allDone ? "done" : "running",
              count: allDone ? doneCount : runningCount,
            },
            {
              id: "judge",
              label: "Judge layer",
              description: "Dedupes, ranks, and labels each finding as confirmed, likely, or speculative.",
              status: allFindings.length === 0 ? "queued" : allDone ? "done" : "running",
              count: judgedFindings.length,
            },
            {
              id: "repair",
              label: "Patch tournament",
              description: "Pick a finding to spawn Conservative, Idiomatic, and Robust repair strategies.",
              status: "queued",
              detail: "on demand",
            },
          ]}
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16, alignItems: "start" }}>
          <FindingFeed findings={judgedFindings} onFix={onFix} />

          {/* [SLOT-1B] · Tier-1 Task 1B: Judge results panel goes here */}
          <JudgePanel
            findings={judgedFindings}
            title="Judge verdicts"
            subtitle="Findings are grouped by evidence and ranked before a fix agent is allowed to act."
            onSelectFinding={onFix}
          />
        </div>

        <details className="card" style={{ marginTop: 24, padding: 0, overflow: "hidden" }}>
          <summary
            style={{
              padding: "16px 20px",
              cursor: "pointer",
              fontWeight: 850,
              fontSize: 16,
              borderBottom: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            Evidence, traces, and scout streams
          </summary>

          <div style={{ padding: 16 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(430px, 100%), 1fr))",
                gap: 16,
                alignItems: "start",
                marginBottom: 20,
              }}
            >
              <EvidenceMap repo={repo} findings={judgedFindings} agents={agents} />
              <TraceReceipt repo={repo} findings={judgedFindings} agents={agents} allDone={allDone} />
            </div>

            <EvidencePack repo={repo} findings={judgedFindings} agents={agents} />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16, marginTop: 20 }}>
              {agents.map((agent, idx) => (
                <AgentCard
                  key={agent.aspect}
                  agent={agent}
                  promptOpen={openPromptIdx === idx}
                  onTogglePrompt={() => setOpenPromptIdx(openPromptIdx === idx ? null : idx)}
                  onFindingClick={onFix}
                />
              ))}

              {/* [SLOT-2A] · Tier-2 Task 2A: Knowledge graph card goes here */}
            </div>
          </div>
        </details>
      </main>
    </div>
  );
}

function summarizeLiveError(agents: AgentState[]) {
  const message = agents.map((agent) => agent.errorMessage).find(Boolean) ?? "";
  if (message.includes("503") || message.includes("live model calls are not configured")) {
    return "The live OpenAI key is not configured for this deployment. The seeded demo still works without any API keys.";
  }
  if (message.includes("502") || message.includes("repository context unavailable")) {
    return "Scout could not read the public GitHub repo context. The GitHub token may be missing, rotated, or rate limited.";
  }
  return "Live review is unavailable right now. The OpenAI or GitHub key may have been rotated or taken down.";
}

function LiveConfigNotice({
  message,
  onClose,
  onRunSeededDemo,
}: {
  message: string;
  onClose: () => void;
  onRunSeededDemo: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="live-config-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "grid",
        placeItems: "center",
        padding: 20,
        background: "rgba(16, 24, 40, 0.28)",
      }}
    >
      <div
        className="card"
        style={{
          width: "min(460px, 100%)",
          padding: 22,
          borderColor: "var(--amber)",
          boxShadow: "0 18px 70px rgba(16, 24, 40, 0.22)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
          <div>
            <p id="live-config-title" style={{ fontSize: 16, fontWeight: 850, marginBottom: 7 }}>
              Live review is offline
            </p>
            <p style={{ color: "var(--ink-2)", fontSize: 14, lineHeight: 1.55 }}>
              {message}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close live review notice"
            onClick={onClose}
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--ink-2)",
              borderRadius: 6,
              width: 30,
              height: 30,
              cursor: "pointer",
              fontWeight: 850,
              flexShrink: 0,
            }}
          >
            x
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
          <button type="button" className="btn-primary" onClick={onRunSeededDemo}>
            Run seeded demo
          </button>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
