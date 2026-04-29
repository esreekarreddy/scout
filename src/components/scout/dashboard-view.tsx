"use client";

import { useState } from "react";
import type { AgentState, Finding } from "@/lib/types";
import { calcHealth } from "@/lib/health";
import { calcEvalScore, judgeFindings } from "@/lib/judge";
import { TopBar } from "./top-bar";
import { HealthGauge } from "./health-gauge";
import { Stat } from "./stat";
import { AgentCard } from "./agent-card";
import { FindingFeed } from "./finding-feed";
import { EvalScorecard } from "./eval-scorecard";
import { JudgePanel } from "./judge-panel";
import { PipelineTimeline } from "./pipeline-timeline";
import { EvidencePack } from "./evidence-pack";

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
  agents,
  allDone,
  onReset,
  onFix,
}: {
  repo: string;
  agents: AgentState[];
  allDone: boolean;
  onReset: () => void;
  onFix: (f: Finding) => void;
}) {
  const [openPromptIdx, setOpenPromptIdx] = useState<number | null>(null);
  const allFindings = agents.flatMap((a) => a.findings);
  const judgedFindings = judgeFindings(allFindings);
  const score = calcHealth(judgedFindings);
  const evalScore = calcEvalScore(allFindings);
  const runningCount = agents.filter((a) => a.status === "running").length;
  const doneCount = agents.filter((a) => a.status === "done").length;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <TopBar repo={repo} onReset={onReset} />

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
                {allDone ? "Deterministic judge complete" : "Evaluating AI-code failures"}
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
            title="Seeded proof benchmark"
            subtitle="Demo mode is measured against known AI-code mistakes, so recall and noise stay visible."
            scores={[
              { id: "caught", label: "Caught", value: evalScore.caught, max: evalScore.seededMistakes, note: "raw seeded findings surfaced", tone: "green" },
              { id: "confirmed", label: "Confirmed", value: evalScore.confirmed, max: evalScore.seededMistakes, note: "deduped judge groups with evidence", tone: "blue" },
              { id: "noise", label: "Speculative", value: evalScore.speculative, max: Math.max(1, judgedFindings.length), note: "kept separate from demo claims", tone: evalScore.speculative > 2 ? "red" : "amber" },
            ]}
          />
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

        <EvidencePack repo={repo} findings={judgedFindings} agents={agents} />

        {/* agents grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16, marginBottom: 24 }}>
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
      </main>
    </div>
  );
}
