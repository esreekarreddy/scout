"use client";

import { useState } from "react";
import type { Finding, FixerState, ScoutModelProfile } from "@/lib/types";
import { FIX_STRATEGIES } from "@/lib/prompts";
import { streamFixer } from "@/lib/scout-stream";

export function initFixers(): FixerState[] {
  return FIX_STRATEGIES.map((s) => ({
    strategy: s.key,
    label: s.label,
    description: s.description,
    status: "idle",
    patch: "",
  }));
}

/**
 * Owns the parallel-fixer state. Fixers run when launchFixers(finding) is
 * called. closeFixers() resets and dismisses the modal.
 */
export function useFixerRun(repo: string, modelProfile: ScoutModelProfile) {
  const [fixingFinding, setFixingFinding] = useState<Finding | null>(null);
  const [fixers, setFixers] = useState<FixerState[]>(initFixers());

  async function launchFixers(f: Finding) {
    setFixingFinding(f);
    setFixers(initFixers().map((x) => ({ ...x, status: "running" })));

    await Promise.allSettled(
      FIX_STRATEGIES.map(async ({ key }, idx) => {
        try {
          await streamFixer(repo, f, key, modelProfile, (chunk) =>
            setFixers((prev) =>
              prev.map((x, i) => (i === idx ? { ...x, patch: x.patch + chunk } : x)),
            ),
          );
          setFixers((prev) =>
            prev.map((x, i) => (i === idx ? { ...x, status: "done" } : x)),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setFixers((prev) =>
            prev.map((x, i) => (i === idx ? { ...x, status: "error", errorMessage: message } : x)),
          );
        }
      }),
    );
  }

  function closeFixers() {
    setFixingFinding(null);
  }

  return { fixingFinding, fixers, launchFixers, closeFixers };
}
