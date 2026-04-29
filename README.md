# Scout

**The MCP-native patch tournament for AI-written code.**

Scout evaluates code produced by coding agents for the failure modes normal PR review is not designed around: hallucinated APIs, fake imports, comments that lie, weak tests, and plausible-looking logic that fails the actual contract.

The product loop is simple: specialist scouts prove the bug, repair agents compete on patches, deterministic gates score the candidates, and Scout returns the winning PR-ready handoff.

Built for the **OpenAI Codex Hackathon - Sydney - 29 April 2026**.

```text
GitHub repo or seeded demo
        |
        v
Hallucination Scout   Spec Drift Scout   Test Theater Scout
        \                  |                  /
         \                 v                 /
          +---------- Judge layer ----------+
                         |
                         v
              proof ledger + ranked findings
                         |
                         v
        Conservative fix | Idiomatic fix | Robust fix
                         |
                         v
              patch score + receipt + handoff
```

## Chosen Hackathon Pathway

Primary lane: **Agentic Coding + Building Evals**.

We are not competing as a generic AI code reviewer. That space is crowded. Scout is positioned as review infrastructure for the Codex era: a system that measures and repairs AI-generated code failures before a human trusts the patch.

Stretch lanes stay optional:

- **UX for Agentic Applications:** visible pipeline, judge verdicts, patch comparator.
- **Multimodal Intelligence:** voice bug intake after the core eval loop works.
- **Domain Agents:** the domain is agentic engineering itself.

## Quickstart

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

For the safest demo path, click **Run seeded AI-code demo**. It uses a deterministic benchmark repo fixture with planted AI-code mistakes, so it works without GitHub rate limits or OpenAI latency for the review pass.

For live repos, set these in `.env.local`:

```bash
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4o-mini
GITHUB_TOKEN=your_optional_github_token
```

No key is needed for the deterministic seeded review, MCP smoke test, or UI walkthrough.

## Local Verification

```bash
npm run scout:smoke
npx tsc --noEmit --pretty false
npm run lint
npm run build
```

To start the local tool server in a separate terminal:

```bash
npm run scout:mcp
```

## What Is Wired

| surface | what it does |
| --- | --- |
| `/` | product UI with live repo input, seeded demo mode, pipeline, eval scorecard, judge panel, Evidence Pack, patch tournament, receipt, and fix modal |
| `/docs` | in-app explanation of the product, agents, benchmark, and build map |
| `/strategy` | internal hackathon pathway rationale and stretch feature plan |
| `POST /api/review` | streams one specialist review agent; seeded demo returns deterministic streams |
| `POST /api/fix` | streams one fixer agent; seeded demo returns deterministic PR-shaped patches |
| `npm run scout:smoke` | runs the local Scout tool surface against the seeded benchmark |
| `npm run scout:mcp` | starts the local stdio JSON-RPC tool surface for `scout_review`, `scout_fix`, `scout_score_patch`, and `scout_handoff` |

## Specialist Agents

- **Hallucination Scout:** missing packages, fake imports, nonexistent helpers, impossible framework APIs.
- **Spec Drift Scout:** README/comment/function-name claims contradicted by implementation.
- **Test Theater Scout:** tests that pass without proving the contract.
- **Judge layer:** deterministic dedupe/ranking pass that marks findings as `confirmed`, `likely`, or `speculative`.
- **Repair agents:** conservative, idiomatic, and robust patch strategies compete against the same finding.
- **Patch scorer:** deterministic gates check whether the patch addresses the evidence, avoids new hallucinated APIs, and adds proof where needed.

## Seeded Benchmark

The built-in demo fixture uses `demo://ai-written-code-seed` and plants seven realistic AI-code mistakes:

- package imported but absent from `package.json`
- helper called but not defined by any real dependency
- comment says email is redacted, but raw email is logged
- auth parser accepts malformed tokens
- README claims rate limiting exists, but the route has no limiter
- test uses `toBeTruthy()` instead of asserting exact behavior
- telemetry test checks that logging happened but not that PII was removed

The UI reports caught/confirmed/speculative counts so the demo is an eval, not just a vague review.

## Winner Pattern Checklist

| pattern | Scout answer |
| --- | --- |
| Real domain problem | Agentic software engineering: AI-written code can look correct while hiding fake dependencies, spec drift, weak tests, and security gaps. |
| Domain credibility | The hackathon workflow is the domain. Scout checks the kind of code Codex-style agents write under time pressure. |
| Tools, not chat | The tool surface exposes `scout_review`, `scout_fix`, `scout_score_patch`, and `scout_handoff`. |
| Real artifact | Each run produces an Evidence Pack, ranked findings, competing diffs, a Tournament Receipt, and a Codex handoff. |
| Anti-hallucination discipline | Seeded known-answer benchmark, proof labels, deterministic judge fallback, and patch gates separate evidence from speculation. |
| Crisp demo moment | The privacy finding proves a contradiction: code logs raw email while the comment says the email is redacted. Robust wins because it fixes code and adds a privacy test. |
| Deterministic vs model boundary | Seeded benchmark, fixture patches, patch scoring, and MCP smoke tests are deterministic. Live repo review and live fix generation use the OpenAI API. |

## Demo Artifact

The end state of the demo is a copyable Tournament Receipt:

```text
Scout Tournament Receipt

Repo: demo://ai-written-code-seed
Scenario: AI-written auth API
Known planted failures: 7

Before:
- audit.ts says email is redacted.
- auth.ts accepts malformed bearer tokens.
- README claims rate limiting exists.
- tests pass without proving privacy or auth behavior.

Scout Evidence:
- raw email logging is confirmed by code evidence
- malformed bearer handling is confirmed
- rate limiting is claimed but missing
- weak tests are separated from production bugs

Patch Tournament:
- Conservative: partial fix, loses
- Idiomatic: useful fix, maybe
- Robust: fixes the behavior and adds a privacy test, wins

After:
- winning diff removes raw email logging
- test asserts the raw email is absent
- handoff is ready for a coding agent or PR workflow
```

## Repo Layout

```text
src/
  app/
    page.tsx                 top-level state machine
    layout.tsx               metadata and app shell
    globals.css              design tokens and shared styles
    docs/page.tsx            in-app docs
    api/
      review/route.ts        review stream endpoint
      fix/route.ts           fix stream endpoint
  lib/
    demo-fixtures.ts         seeded benchmark and deterministic patches
    github.ts                GitHub Contents API helpers
    health.ts                trust-score calculation
    judge.ts                 dedupe, verdicts, eval score
    prompts.ts               review and fix prompts
    scout-runner.ts          shared local runner for Scout tools
    scout-stream.ts          client stream helpers
    tournament.ts            proof ledger, patch scoring, receipt helpers
    types.ts                 shared types
  mcp/
    server.ts                local stdio JSON-RPC tool server
  components/scout/
    input-view.tsx           product entry screen
    dashboard-view.tsx       composed evaluation dashboard
    pipeline-timeline.tsx    agentic pipeline
    eval-scorecard.tsx       benchmark score cards
    evidence-pack.tsx        finding proof and tool trace
    judge-panel.tsx          ranked judge verdicts
    patch-tournament.tsx     scored repair competition
    tournament-receipt.tsx   copyable demo artifact
    fix-modal.tsx            three repair strategies and tournament result
```

## Demo Script

1. Open the app and click **Run seeded AI-code demo**.
2. Show the three specialist scouts streaming findings in parallel.
3. Show the judge grouping the seven planted failures into confirmed, likely, and speculative verdicts.
4. Open the privacy finding: the comment says redacted, but code logs raw email.
5. Spawn conservative, idiomatic, and robust repair agents.
6. Show the patch tournament table and why robust wins.
7. End on the Tournament Receipt and the `scout_handoff` style artifact.

One-line pitch:

> Codex can ship code fast; Scout proves which AI-code finding is real and which repair should win.

Two-minute script:

```text
0:00-0:10
AI coding changed the failure modes. Scout reviews code written by agents.

0:10-0:30
Run the seeded demo. Three scouts inspect hallucinations, spec drift, and test theater.

0:30-0:45
The judge dedupes findings and marks them confirmed, likely, or speculative.

0:45-1:05
Open the privacy Evidence Pack. The code logs raw email even though the comment says redacted.

1:05-1:30
Spawn three repair agents. Scout scores each patch against the same evidence.

1:30-1:45
Robust wins because it fixes the code and adds the privacy test.

1:45-2:00
Show the Tournament Receipt. Scout is the eval layer for the codebase you and your AI write together.
```

## Hackathon Boundary

This repo began as a pre-event blueprint. For any final submission, the README, write-up, and video must clearly identify what existed before the hackathon and what was built on-site.
