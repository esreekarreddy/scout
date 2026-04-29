"use client";

import { useScoutRun } from "@/components/scout/use-scout-run";
import { useFixerRun } from "@/components/scout/use-fixer-run";
import { InputView } from "@/components/scout/input-view";
import { DashboardView } from "@/components/scout/dashboard-view";
import { FixModal } from "@/components/scout/fix-modal";

/**
 * Top-level state machine. Stays SHORT on purpose so parallel tasks don't
 * collide here. Add new state via dedicated hooks (see use-scout-run.ts
 * and use-fixer-run.ts), not by inlining state into this file.
 */
export default function Home() {
  const { stage, repo, setRepo, modelProfile, setModelProfile, agents, allDone, launch, launchDemo, reset } = useScoutRun();
  const { fixingFinding, fixers, launchFixers, closeFixers } = useFixerRun(repo, modelProfile);

  if (stage === "input") {
    return (
      <InputView
        repo={repo}
        setRepo={setRepo}
        modelProfile={modelProfile}
        setModelProfile={setModelProfile}
        onLaunch={launch}
        onLaunchDemo={launchDemo}
      />
    );
  }

  return (
    <>
      <DashboardView
        repo={repo}
        modelProfile={modelProfile}
        agents={agents}
        allDone={allDone}
        onReset={() => {
          reset();
          closeFixers();
        }}
        onFix={launchFixers}
      />

      {fixingFinding && (
        <FixModal repo={repo} finding={fixingFinding} fixers={fixers} modelProfile={modelProfile} onClose={closeFixers} />
      )}
    </>
  );
}
