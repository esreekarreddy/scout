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

export const liveFindingEnvelopeSchema = z.object({
  findings: z.array(liveFindingSchema).min(1).max(6),
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

export const liveFixerPatchSchema = z.object({
  findingId: z.string().min(1),
  strategy: z.enum(["conservative", "idiomatic", "robust"]),
  patch: z.string().min(1).refine((patch) => hasStrictUnifiedDiffShape(patch), {
    message: "patch must be a plain unified diff starting with --- a/<path>, +++ b/<path>, and at least one @@ hunk",
  }),
  metadata: livePatchMetadataSchema.optional(),
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
export type LiveFindingEnvelope = z.infer<typeof liveFindingEnvelopeSchema>;
export type LiveJudgeVerdict = z.infer<typeof liveJudgeVerdictSchema>;
export type LivePatchMetadata = z.infer<typeof livePatchMetadataSchema>;
export type LiveFixerPatch = z.infer<typeof liveFixerPatchSchema>;
export type LiveHandoff = z.infer<typeof liveHandoffSchema>;

export function validateLiveFinding(value: unknown): LiveFinding {
  return liveFindingSchema.parse(value);
}

export function validateLiveFindingEnvelope(value: unknown): LiveFindingEnvelope {
  return liveFindingEnvelopeSchema.parse(value);
}

export function validateLivePatchMetadata(value: unknown): LivePatchMetadata {
  return livePatchMetadataSchema.parse(value);
}

export function validateLiveFixerPatch(value: unknown): LiveFixerPatch {
  return liveFixerPatchSchema.parse(value);
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

function hasStrictUnifiedDiffShape(patch: string): boolean {
  if (/```|\*\*\* Begin Patch|\*\*\* End Patch|^diff --git\b/m.test(patch)) return false;
  const lines = patch.split("\n");
  const firstContent = lines.findIndex((line) => line.trim().length > 0);
  if (firstContent < 0 || !/^--- a\/.+/.test(lines[firstContent].trim())) return false;

  let index = firstContent;
  let sawHunk = false;
  while (index < lines.length) {
    while (index < lines.length && lines[index].trim().length === 0) index += 1;
    if (index >= lines.length) break;

    const oldMatch = /^--- a\/(.+)$/.exec(lines[index].trim());
    if (!oldMatch) return false;
    index += 1;
    if (index >= lines.length) return false;

    const newMatch = /^\+\+\+ b\/(.+)$/.exec(lines[index].trim());
    if (!newMatch || oldMatch[1] !== newMatch[1]) return false;
    index += 1;

    let fileHasHunk = false;
    while (index < lines.length) {
      const line = lines[index];
      if (/^--- a\/.+/.test(line.trim())) break;
      if (line.startsWith("@@")) {
        fileHasHunk = true;
        sawHunk = true;
      }
      if (
        line.trim().length > 0
        && !line.startsWith("@@")
        && !line.startsWith(" ")
        && !line.startsWith("+")
        && !line.startsWith("-")
        && !line.startsWith("\\ No newline")
      ) {
        return false;
      }
      index += 1;
    }

    if (!fileHasHunk) return false;
  }

  return sawHunk;
}

function riskNotes(patch: string) {
  const lower = patch.toLowerCase();
  return [
    lower.includes("process.env") ? "uses environment variables" : "",
    lower.includes(" as any") || lower.includes(": any") ? "uses any typing" : "",
    lower.includes("jwt.decode") ? "uses decode without verification" : "",
  ].filter(Boolean);
}
