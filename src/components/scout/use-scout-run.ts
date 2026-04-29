"use client";

import { useState, useCallback, useRef } from "react";
import type { AgentState, Aspect, ScoutModelProfile } from "@/lib/types";
import { streamAgent } from "@/lib/scout-stream";
import { DEMO_REPO_URL } from "@/lib/demo-fixtures";

const ASPECTS: Array<{ aspect: Aspect; label: string; description: string }> = [
  { aspect: "hallucination", label: "Hallucination Scout",  description: "Fake imports, impossible APIs, nonexistent helpers" },
  { aspect: "spec-drift", label: "Spec Drift Scout", description: "Comments, README claims, and names that lie" },
  { aspect: "test-theater",  label: "Test Theater Scout",  description: "Tests that pass without proving behavior" },
];

export function initAgents(): AgentState[] {
  return ASPECTS.map((a) => ({ ...a, status: "idle", raw: "", findings: [] }));
}

export type Stage = "input" | "scanning" | "results";

/**
 * Owns the scout-run state machine. Other features (orchestrator, judge,
 * etc.) should consume this hook and add their own state alongside, NOT
 * inline state into this hook.
 */
export function useScoutRun() {
  const [stage, setStage] = useState<Stage>("input");
  const [repo, setRepo] = useState("");
  const [modelProfile, setModelProfile] = useState<ScoutModelProfile>("fast");
  const [agents, setAgents] = useState<AgentState[]>(initAgents());
  const findingIdRef = useRef(0);

  const allFindings = agents.flatMap((a) => a.findings);
  const allDone = agents.every((a) => a.status === "done" || a.status === "error");

  const setAgentField = useCallback(
    <K extends keyof AgentState>(idx: number, key: K, val: AgentState[K]) => {
      setAgents((prev) => prev.map((a, i) => (i === idx ? { ...a, [key]: val } : a)));
    },
    [],
  );

  async function launch(repoOverride?: string) {
    const targetRepo = repoOverride ?? repo;
    if (!targetRepo.trim()) return;
    setRepo(targetRepo);
    setStage("scanning");
    setAgents(initAgents().map((a) => ({ ...a, status: "running" })));
    findingIdRef.current = 0;

    await Promise.allSettled(
      ASPECTS.map(async ({ aspect }, idx) => {
        try {
          const startedAt = Date.now();
          const result = await streamAgent(
            targetRepo,
            aspect,
            modelProfile,
            (chunk) =>
              setAgents((prev) =>
                prev.map((a, i) => (i === idx ? { ...a, raw: a.raw + chunk } : a)),
              ),
            (partial) => {
              const id = `${aspect}-${findingIdRef.current++}`;
              setAgents((prev) =>
                prev.map((a, i) =>
                  i === idx
                    ? { ...a, findings: [...a.findings, { ...partial, id, aspect }] }
                    : a,
                ),
              );
            },
          );
          setAgents((prev) =>
            prev.map((a, i) =>
              i === idx
                ? { ...a, status: "done", model: result.model, durationMs: Date.now() - startedAt }
                : a,
            ),
          );
        } catch {
          setAgentField(idx, "status", "error");
        }
      }),
    );
  }

  function reset() {
    setStage("input");
    setAgents(initAgents());
  }

  function launchDemo() {
    return launch(DEMO_REPO_URL);
  }

  return {
    stage,
    repo,
    setRepo,
    modelProfile,
    setModelProfile,
    agents,
    allFindings,
    allDone,
    launch,
    launchDemo,
    reset,
  };
}
