import { z } from "zod";
import type { Finding, FixStrategy } from "./types";

export const liveFindingSchema = z.object({
  severity: z.enum(["critical", "warning", "info"]),
  file: z.string().min(1),
  line: z.number().int().positive().optional(),
  title: z.string().min(1),
  description: z.string().min(1),
  confidence: z.number().int().min(0).max(100),
  evidence: z.string().optional(),
});

export const liveJudgeVerdictSchema = z.object({
  findingId: z.string().min(1),
  verdict: z.enum(["confirmed", "likely", "speculative"]),
  rationale: z.string().min(1),
  evidenceIds: z.array(z.string()).default([]),
});

export const livePatchMetadataSchema = z.object({
  findingId: z.string().min(1),
  strategy: z.enum(["conservative", "idiomatic", "robust"]),
  touchedFiles: z.array(z.string()).default([]),
  testFiles: z.array(z.string()).default([]),
  expectedCommands: z.array(z.string()).default([]),
  riskNotes: z.array(z.string()).default([]),
});

export const liveHandoffSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  findingId: z.string().min(1),
  receiptId: z.string().min(1),
  commands: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  doNotClaim: z.array(z.string()).default([]),
});

export type LiveFinding = z.infer<typeof liveFindingSchema>;
export type LiveJudgeVerdict = z.infer<typeof liveJudgeVerdictSchema>;
export type LivePatchMetadata = z.infer<typeof livePatchMetadataSchema>;
export type LiveHandoff = z.infer<typeof liveHandoffSchema>;

export function validateLiveFinding(value: unknown): LiveFinding {
  return liveFindingSchema.parse(value);
}

export function validateLivePatchMetadata(value: unknown): LivePatchMetadata {
  return livePatchMetadataSchema.parse(value);
}

export function validateLiveHandoff(value: unknown): LiveHandoff {
  return liveHandoffSchema.parse(value);
}

export function findingToLiveSchema(finding: Omit<Finding, "id" | "aspect">): LiveFinding {
  return liveFindingSchema.parse({
    severity: finding.severity,
    file: finding.file,
    line: finding.line,
    title: finding.title,
    description: finding.description,
    confidence: finding.confidence,
    evidence: finding.evidence,
  });
}

export function patchMetadataFromDiff(input: {
  findingId: string;
  strategy: FixStrategy;
  patch: string;
}): LivePatchMetadata {
  const touchedFiles = extractTouchedFiles(input.patch);
  return livePatchMetadataSchema.parse({
    findingId: input.findingId,
    strategy: input.strategy,
    touchedFiles,
    testFiles: touchedFiles.filter((file) => /(^|\/)(test|tests|__tests__)\/|(\.|-)(test|spec)\.[cm]?[tj]sx?$/.test(file)),
    expectedCommands: [],
    riskNotes: riskNotes(input.patch),
  });
}

function extractTouchedFiles(patch: string): string[] {
  const files = new Set<string>();
  for (const line of patch.split("\n")) {
    const match = /^(?:---|\+\+\+) [ab]\/(.+)$/.exec(line.trim());
    if (!match || match[1] === "/dev/null") continue;
    files.add(match[1].replace(/\\/g, "/"));
  }
  return [...files].sort();
}

function riskNotes(patch: string) {
  const lower = patch.toLowerCase();
  return [
    lower.includes("process.env") ? "uses environment variables" : "",
    lower.includes(" as any") || lower.includes(": any") ? "uses any typing" : "",
    lower.includes("jwt.decode") ? "uses decode without verification" : "",
  ].filter(Boolean);
}
