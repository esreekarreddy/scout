import type { ScoutModelProfile } from "./types";

export type ScoutModelTask = "review" | "fix" | "judge";

export const MODEL_PROFILES: Record<ScoutModelProfile, {
  label: string;
  description: string;
  review: string;
  fix: string;
  judge: string;
}> = {
  fast: {
    label: "Fast",
    description: "Quick live scan for demos and iteration.",
    review: "gpt-5.4-mini",
    fix: "gpt-5.4-mini",
    judge: "gpt-5.5",
  },
  balanced: {
    label: "Balanced",
    description: "Best default for live Scout runs.",
    review: "gpt-5.5",
    fix: "gpt-5.5",
    judge: "gpt-5.5",
  },
  deep: {
    label: "Deep",
    description: "Slower, higher quality run for final proof.",
    review: "gpt-5.5-pro",
    fix: "gpt-5.5-pro",
    judge: "gpt-5.5-pro",
  },
};

export function normalizeModelProfile(profile: unknown): ScoutModelProfile | undefined {
  return profile === "fast" || profile === "balanced" || profile === "deep" ? profile : undefined;
}

export function selectModel(input: {
  profile?: ScoutModelProfile;
  task: ScoutModelTask;
  fallback?: string;
}) {
  if (input.profile) return MODEL_PROFILES[input.profile][input.task];
  return input.fallback || MODEL_PROFILES.balanced[input.task];
}
