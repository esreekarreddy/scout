import { z } from "zod";
import { isDemoRepo } from "./demo-fixtures";
import type { Aspect, Finding, FixStrategy, ScoutModelProfile } from "./types";

const JSON_LIMIT_BYTES = 120_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

const aspectSchema = z.enum(["hallucination", "spec-drift", "test-theater"]);
const strategySchema = z.enum(["conservative", "idiomatic", "robust"]);
const modelProfileSchema = z.enum(["fast", "balanced", "deep"]).optional();

const textField = z.string().trim().min(1).max(1000);
const pathField = z.string().trim().min(1).max(300).refine((path) => !path.includes("\0"), {
  message: "path must not contain null bytes",
});

export const apiFindingSchema = z.object({
  id: z.string().trim().min(1).max(120),
  aspect: aspectSchema,
  severity: z.enum(["critical", "warning", "info"]),
  file: pathField,
  line: z.number().int().positive().max(1_000_000).optional(),
  title: textField.max(220),
  description: textField.max(1800),
  confidence: z.number().int().min(0).max(100),
  evidence: z.string().trim().max(1800).optional(),
  verdict: z.enum(["confirmed", "likely", "speculative"]).optional(),
  matchedAgents: z.array(aspectSchema).max(3).optional(),
});

const reviewRequestSchema = z.object({
  repo: z.string().trim().min(1).max(240),
  aspect: aspectSchema,
  modelProfile: modelProfileSchema,
}).strict();

const fixRequestSchema = z.object({
  repo: z.string().trim().min(1).max(240),
  finding: apiFindingSchema,
  strategy: strategySchema,
  modelProfile: modelProfileSchema,
}).strict();

const fixerStateSchema = z.object({
  strategy: strategySchema,
  label: z.string().trim().max(80).default(""),
  description: z.string().trim().max(240).default(""),
  status: z.enum(["idle", "running", "done", "error"]),
  patch: z.string().max(40_000),
  errorMessage: z.string().trim().max(600).optional(),
}).strict();

const scorePatchesRequestSchema = z.object({
  repo: z.string().trim().min(1).max(240),
  finding: apiFindingSchema,
  fixers: z.array(fixerStateSchema).min(1).max(5),
}).strict();

export type ReviewApiRequest = {
  repo: string;
  aspect: Aspect;
  modelProfile?: ScoutModelProfile;
};

export type FixApiRequest = {
  repo: string;
  finding: Finding;
  strategy: FixStrategy;
  modelProfile?: ScoutModelProfile;
};

export type ScorePatchesApiRequest = {
  repo: string;
  finding: Finding;
  fixers: Array<z.infer<typeof fixerStateSchema>>;
};

export function parseReviewRequest(value: unknown): ReviewApiRequest {
  const parsed = reviewRequestSchema.parse(value);
  assertAllowedRepo(parsed.repo);
  return parsed;
}

export function parseFixRequest(value: unknown): FixApiRequest {
  const parsed = fixRequestSchema.parse(value);
  assertAllowedRepo(parsed.repo);
  return parsed;
}

export function parseScorePatchesRequest(value: unknown): ScorePatchesApiRequest {
  const parsed = scorePatchesRequestSchema.parse(value);
  assertAllowedRepo(parsed.repo);
  return parsed;
}

export async function readJsonRequest(req: Request, limitBytes = JSON_LIMIT_BYTES): Promise<unknown> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new ApiError(415, "content-type must be application/json");
  }

  const length = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > limitBytes) {
    throw new ApiError(413, "request body too large");
  }

  const body = await readRequestText(req, limitBytes);
  try {
    return JSON.parse(body);
  } catch {
    throw new ApiError(400, "invalid json");
  }
}

export function assertTrustedOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return;

  const requestHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!requestHost) throw new ApiError(403, "origin not allowed");

  const originHost = safeUrl(origin)?.host;
  const allowedHosts = new Set<string>([
    requestHost,
    safeUrl(process.env.NEXT_PUBLIC_SITE_URL)?.host ?? "",
    process.env.VERCEL_URL ?? "",
  ].filter(Boolean));

  if (!originHost || !allowedHosts.has(originHost)) {
    throw new ApiError(403, "origin not allowed");
  }
}

export function assertRateLimit(req: Request, route: string, limit: number) {
  const now = Date.now();
  pruneExpiredRateBuckets(now);
  const ip = clientIp(req);
  const key = `${route}:${ip}`;
  const existing = rateBuckets.get(key);
  const bucket = existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  bucket.count += 1;
  rateBuckets.set(key, bucket);

  if (bucket.count > limit) {
    throw new ApiError(429, "rate limit exceeded", {
      "Retry-After": `${Math.ceil((bucket.resetAt - now) / 1000)}`,
    });
  }
}

function pruneExpiredRateBuckets(now: number) {
  if (rateBuckets.size < 1000) return;
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
}

export function requireOpenAIKey() {
  if (!process.env.OPENAI_API_KEY) {
    throw new ApiError(503, "live model calls are not configured");
  }
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, {
      status: error.status,
      headers: apiHeaders(error.headers),
    });
  }

  if (error instanceof z.ZodError) {
    return Response.json({ error: "invalid request", issues: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })) }, {
      status: 400,
      headers: apiHeaders(),
    });
  }

  return Response.json({ error: "request failed" }, {
    status: 500,
    headers: apiHeaders(),
  });
}

export function apiHeaders(extra: Record<string, string> = {}) {
  return {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex",
    ...extra,
  };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

async function readRequestText(req: Request, limitBytes: number) {
  const reader = req.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let total = 0;
  let body = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limitBytes) throw new ApiError(413, "request body too large");
    body += decoder.decode(value, { stream: true });
  }

  return body + decoder.decode();
}

function assertAllowedRepo(repo: string) {
  if (isDemoRepo(repo)) return;
  if (!parseStrictGitHubUrl(repo)) {
    throw new ApiError(400, "repo must be a public https://github.com/owner/repo URL or demo://ai-written-code-seed");
  }
}

export function parseStrictGitHubUrl(repoUrl: string): { owner: string; repo: string } | null {
  const parsed = safeUrl(repoUrl);
  if (!parsed) return null;
  if (parsed.protocol !== "https:" || parsed.hostname !== "github.com" || parsed.username || parsed.password) return null;
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length !== 2) return null;
  const [owner, rawRepo] = parts;
  const repo = rawRepo.replace(/\.git$/, "");
  if (!/^[A-Za-z0-9_.-]{1,39}$/.test(owner)) return null;
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(repo)) return null;
  return { owner, repo };
}

function safeUrl(value: string | undefined) {
  if (!value) return null;
  try {
    return new URL(value.startsWith("http") ? value : `https://${value}`);
  } catch {
    return null;
  }
}

function clientIp(req: Request) {
  return (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown")
    .split(",")[0]
    .trim()
    .slice(0, 80) || "unknown";
}
