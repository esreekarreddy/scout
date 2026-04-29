export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://scout.sreekarreddy.com";

export const siteName = "Scout";

export const siteTitle = "Scout - Eval-backed patch tournament for AI-written code";

export const siteDescription =
  "Scout verifies AI-written code with specialist review agents, seeded evals, evidence receipts, and a patch tournament that ranks competing repairs before a coding agent applies them.";

export const siteKeywords = [
  "Scout",
  "AI code review",
  "AI-written code",
  "patch tournament",
  "agentic coding",
  "coding agent evaluation",
  "MCP tool",
  "Model Context Protocol",
  "OpenAI Codex",
  "software evals",
  "AI developer tools",
  "test theater detection",
  "hallucinated API detection",
  "spec drift detection",
  "patch scoring",
  "code review automation",
  "Sreekar Reddy",
];

export const publicRoutes = [
  {
    path: "/",
    changeFrequency: "weekly" as const,
    priority: 1,
  },
  {
    path: "/docs",
    changeFrequency: "weekly" as const,
    priority: 0.82,
  },
  {
    path: "/strategy",
    changeFrequency: "monthly" as const,
    priority: 0.62,
  },
];
