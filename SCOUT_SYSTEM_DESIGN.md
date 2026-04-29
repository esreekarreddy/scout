# Scout System Design

Scout is a post-agent verification system for AI-written code. It is built for the moment after a developer asks Codex, Claude Code, Cursor, or another coding agent to change a repo, but before that change is trusted, merged, or handed to a human reviewer.

The product is not "chat with a code reviewer." The product is a repeatable safety gate:

```text
agent writes code -> Scout verifies failure modes -> patches compete -> bad patches are disqualified -> agent receives a repair handoff
```

## Problem

AI coding agents often fail in ways normal PR review does not catch quickly:

- invented packages or helpers
- README or comment claims that do not match code
- tests that pass without proving behavior
- security and privacy drift
- patches that look right but do not apply
- confident explanations without evidence

Scout focuses on those agentic coding failure modes. The goal is not to replace Codex. The goal is to make Codex safer and more useful by giving it a verification layer.

## Design Pattern

Scout uses a verified agent loop.

1. Intake a repo or seeded benchmark.
2. Run specialist scouts in parallel.
3. Judge and dedupe findings.
4. Build an evidence graph and proof ledger.
5. Spawn competing repair strategies.
6. Score patches with deterministic gates.
7. Apply execution results when repo files are available.
8. Produce a receipt and handoff for Codex or Claude Code.

The important product idea is the separation between model judgment and deterministic verification. Models propose findings and patches. Scout records evidence, validates shapes, scores patches, marks ineligible repairs, and produces receipts.

## What Is Built

Scout has three surfaces:

- web app for the full visual workflow
- API routes for live model and patch scoring flows
- official local MCP server for agent clients

Production URL:

- `https://scout.sreekarreddy.com` on Vercel

### Web App

The web app is the visual demo surface.

It supports:

- seeded AI-code demo
- public GitHub repo input
- model path selector: Fast, Balanced, Deep
- specialist scout cards
- judge verdict panel
- benchmark scorecard
- context budget card
- evidence pack
- evidence graph view
- patch tournament
- patch execution gate
- tournament receipt
- "Send this to Codex" handoff
- "Send this to Claude Code" handoff

The web app is designed to show the proof loop, not just the final answer. A judge can see where each finding came from, which patch won, and why weaker patches did not win.

### API Surface

The API routes are:

- `POST /api/review`: runs one scout lane for a repo and streams findings
- `POST /api/fix`: runs one repair strategy and streams a unified diff
- `POST /api/score-patches`: validates, applies when possible, and scores completed patch candidates

The API layer includes:

- strict JSON body parsing
- request size limits
- trusted-origin checks
- simple per-route rate limits
- GitHub URL validation
- no-store and noindex response headers
- explicit error responses for missing live model configuration

This matters for judging because Scout is not only a static UI. It has real server-side boundaries around the places where model output and external repos enter the system.

### Seeded Benchmark

The deterministic demo uses `demo://ai-written-code-seed`.

It contains seven planted AI-code mistakes:

- fake auth package import
- nonexistent token verifier
- missing rate limiting despite README claims
- raw email logging despite a redaction comment
- malformed bearer token acceptance
- weak truthy auth test
- telemetry test that misses the privacy contract

Seeded mode is reliable for demos because it does not call OpenAI or GitHub. It gives Scout a known answer key, so the app can report caught, missed, confirmed, likely, and speculative results instead of vague review vibes.

The seeded eval currently expects:

- 7 planted mistakes
- 7 caught mistakes in the passing path
- 100 percent critical recall in the passing path
- 100 percent precision in the passing path
- passing gates for seeded recall, critical recall, extra findings, and patch tournament

### Live Repo Review

For public GitHub URLs, the app can fetch a bounded file tree and call OpenAI models when `OPENAI_API_KEY` is configured.

The GitHub ingestion intentionally does not dump the whole repo into the prompt. It prioritizes:

- README and agent instruction files
- package and config files
- source files
- test files
- auth, audit, security, rate limit, and privacy-related files

This keeps the demo fast and token-aware while still giving the scouts enough context to catch contradictions.

The prepared live fixture is:

[https://github.com/esreekarreddy/scout-target-repo](https://github.com/esreekarreddy/scout-target-repo)

It is intentionally small and flawed so the app can show real live model behavior while still comparing against a known answer key.

### Model Profiles

Scout has three model profiles:

- Fast: quick scan with `gpt-5.4-mini`
- Balanced: default live run with `gpt-5.5`
- Deep: slower final proof with `gpt-5.5-pro`

The profile controls review, fix, and judge model selection. Seeded mode bypasses model calls.

### Specialist Scouts

Scout runs three specialist review lanes:

- Hallucination Scout: fake imports, nonexistent helpers, impossible APIs
- Spec Drift Scout: README, comments, and function names that contradict implementation
- Test Theater Scout: tests that pass without proving the contract

This matters because a single generic reviewer often blends these categories together. Scout keeps them separate, then lets the judge dedupe and rank the results.

### Judge Layer

The judge layer groups repeated findings and labels each result:

- confirmed
- likely
- speculative

The UI keeps speculative findings separate so the demo does not pretend every model claim is proven. In seeded mode, the judge can also be evaluated against the planted answer key.

### Evidence Graph

Scout builds a compact graph linking:

- repo
- findings
- files
- tests
- patches
- gates
- trace entries
- receipts

The graph gives Scout a focused context object instead of repeatedly sending whole repo text. It also helps explain why a finding or patch is connected to a specific file, test, or receipt.

### Context And Token Budgeting

Scout tracks:

- inspected files
- context characters
- estimated input tokens
- model profile
- prompt cache key
- cache strategy hint
- OpenAI usage metadata when a live stream returns it

The token-saving strategy is simple: keep static Scout rules first, dynamic repo context last, and expose cache-related usage when the provider reports it.

This is a real user problem for coding agents. Teams waste tokens when agents repeatedly reread the same repo rules, README claims, package files, and tests. Scout makes that cost visible and ties context back to evidence.

### Patch Tournament

For a selected finding, Scout creates three competing repair strategies:

- conservative
- idiomatic
- robust

Each patch is scored for:

- whether it targets the finding
- whether it removes the risk
- whether it adds proof
- whether the scope is controlled
- whether regression risk is low

The winner is not chosen by vibe. It is chosen by a score that can be displayed and checked.

### Execution Gate

When repo files are available, Scout applies candidate patches in a temporary workspace. A patch can be disqualified if:

- the patch format is invalid
- it cannot apply
- required checks fail
- a requested check command is outside Scout's safe allowlist
- repo context is unavailable for a live run that needs execution

This is the main trust feature. A model-generated patch can look polished and still lose.

Patch checks run with a stripped environment so API keys and repository credentials are not inherited by candidate execution.

The UI also includes a deterministic disqualification proof path. If a live run happens to produce three eligible patches, the demo can still show the execution gate rejecting a deliberately malformed patch without spending model tokens or faking a model failure.

### Structured Validation

Scout validates important live and tool-facing shapes with schemas:

- API request bodies
- findings
- fixer state
- patch diff shape
- patch metadata
- handoff shape

The patch scoring path requires a plain unified diff. Markdown fences, `*** Begin Patch`, JSON wrappers, and malformed file headers are rejected.

This is important because coding agents often emit a patch wrapped in markdown, tool syntax, or a format that a human can read but an executor cannot apply. Scout treats that as an ineligible repair, not a low-scoring valid patch.

### Trace Receipts

Scout emits trace and receipt IDs for the review, judge, fix, score, and handoff stages.

These are not Git commits. They are checksummed receipts for a Scout run. They help answer:

- what input was reviewed
- what findings were produced
- which patch won
- which steps were deterministic
- which steps depended on model output

### Agent Handoff

Scout produces copyable handoffs for:

- Codex
- Claude Code

The handoff includes:

- receipt id
- finding
- file and line evidence
- verdict
- winning patch strategy
- score
- touched files
- test proof
- verification commands
- "do not claim" guardrails
- optional patch text

The handoff is designed so a coding agent can continue from verified evidence instead of reinterpreting the whole repo from scratch.

The handoff is also a product artifact. It is the thing a developer can paste back into Codex or Claude Code to say: "apply this verified repair, keep this receipt, and do not invent claims beyond the evidence."

## Official MCP Support

Scout includes a local stdio MCP server built with the official TypeScript MCP SDK.

It exposes tools:

- `scout_review`: run review and return judged findings, eval score, manifest, proof ledger, and evidence
- `scout_fix`: generate patch candidates for a finding
- `scout_score_patch`: score a patch candidate with deterministic Scout gates
- `scout_handoff`: produce a coding-agent handoff artifact
- `scout_eval`: run the deterministic seeded eval suite

It exposes resources:

- `scout://demo/manifest`: known planted mistakes for the seeded benchmark
- `scout://eval/seeded`: deterministic eval report
- `scout://handoff/demo`: reusable Codex-ready handoff prompt

It exposes prompts:

- `scout-review-this-change`
- `scout-run-patch-tournament`
- `scout-handoff-to-codex`

This means Scout is usable from MCP-capable clients as a tool layer, not only as a web app. The current MCP path is local stdio. Seeded eval is offline and deterministic; live `scout_review` and `scout_fix` use public GitHub context plus configured OpenAI model calls. Scout is not yet packaged as a hosted remote MCP server or marketplace plugin.

The current release gate starts Scout through an official MCP SDK client, lists tools/resources/prompts, reads the manifest resource, gets a prompt, calls review/fix/score/handoff/eval tools, and verifies the seeded eval path.

The live MCP smoke command is:

```bash
npm run scout:mcp -- --smoke-live
```

It calls `scout_review` and `scout_fix` against the public target repo using the Fast model profile. It requires configured GitHub network access and `OPENAI_API_KEY`.

Scout can also be registered with Codex CLI as:

```bash
codex mcp add scout -- npm --silent run scout:mcp
codex mcp get scout
```

For reliable local use, launch Codex from this repo root or configure an absolute working directory in the client config. The checked-in files under `mcp/` are templates, not proof that every named client has been tested in this environment.

## How Developers Use It

### Web Workflow

1. Paste a repo URL or run the seeded demo.
2. Review Scout findings.
3. Pick a confirmed issue.
4. Run the patch tournament.
5. Copy the handoff to Codex or Claude Code.
6. Ask the coding agent to apply only the verified repair.

### MCP Workflow

1. Register Scout as a local MCP server.
2. Ask the MCP client to call `scout_review`.
3. Choose a confirmed finding.
4. Call `scout_fix` for competing strategies.
5. Call `scout_score_patch`.
6. Call `scout_handoff`.
7. Give the handoff back to the coding agent.

Manual local checks:

```bash
npm run scout:mcp
npm run scout:qa:mcp
codex mcp get scout
```

`npm run scout:mcp` starts the server and waits for a client. `npm run scout:qa:mcp` starts the server through an official MCP SDK client, lists tools/resources/prompts, calls the core tools, and exits.

### Agent Workflow

The intended real-world loop is:

1. A developer asks Codex or Claude Code to change a repo.
2. The agent or developer calls Scout before trusting the change.
3. Scout focuses on AI-code failure modes, not broad style review.
4. Scout produces confirmed findings and a patch tournament.
5. Scout gives the winning repair back as a constrained handoff.
6. The coding agent applies the verified repair and runs the requested checks.

MCP alone does not automatically run after every agent edit. A client, CLI command, Git hook, or CI integration has to invoke Scout. That is a distribution problem, not a core verification problem.

## Deterministic Versus Model Boundary

Scout is explicit about what is deterministic and what is model-driven.

Deterministic:

- seeded benchmark
- known answer key
- finding dedupe fallback
- proof ledger
- eval metrics
- patch diff shape validation
- touched file extraction
- patch scoring gates
- execution eligibility
- evidence graph construction
- trace receipt checksums
- MCP smoke test
- hygiene checks

Model-driven:

- live repo findings
- live patch text
- live explanations
- model-selected repair language

Mixed:

- live review uses model output but is constrained by bounded repo context and parsing rules
- live patch tournament uses model-generated diffs but deterministic validation and execution decide eligibility
- token telemetry depends on provider usage metadata when available

This boundary is the core trust story.

## Why This Is Not Just Code Review

Traditional code review asks, "Is this PR good?"

Scout asks a narrower question:

```text
Did an AI coding agent introduce a failure mode that looks plausible but breaks the contract?
```

That narrower question makes Scout useful beside Codex rather than competitive with Codex. Scout is the safety gate that creates a better next prompt, a better repair, and a better receipt.

## Evaluation

Scout has a deterministic eval harness for the seeded benchmark.

It reports:

- seeded recall
- precision
- F1
- critical recall
- extra findings
- patch diagnostics
- execution summaries
- trace entries
- receipt checksums
- pass/warn/fail gates

The key local commands are:

```bash
npm run scout:smoke
npm run scout:qa
npm run scout:eval -- --assert
npm run build
```

`npm run scout:qa` includes an official MCP SDK client smoke test, so MCP is checked as part of the release gate.

## Verification Status

Current local gates used for this build:

- `npm run scout:qa`
- `npm run scout:qa:mcp`
- `npm run scout:smoke`
- `npm run scout:eval -- --assert`
- `npx tsc --noEmit --pretty false`
- `npm run lint`
- `npm run build`
- `git diff --check`

The verified MCP smoke reports:

- server: `scout-local`
- tools: 5
- resources: 3
- prompts: 3
- seeded mistakes caught: 7
- execution gate: at least one patch applies in the temporary workspace

## What To Claim In A Demo

Strong and accurate claims:

- Scout is an eval-backed verification layer for AI-written code.
- Scout has a deterministic seeded benchmark with seven planted mistakes.
- Scout has a public live target repo for real model testing.
- Scout runs specialist review lanes for hallucination, spec drift, and test theater.
- Scout produces evidence, receipts, patch outcomes, and coding-agent handoffs.
- Scout can disqualify invalid or non-applying patches.
- Scout exposes an official TypeScript SDK MCP server with tools, resources, and prompts.
- Scout includes a QA gate that tests MCP through an official SDK client.
- Scout shows context budget and cached-token telemetry when available.

Do not claim:

- every live repo gets 100 percent recall
- Scout replaces all human code review
- Scout automatically runs after every Codex or Claude Code edit without integration
- remote hosted MCP is live
- database-backed run history exists
- Claude Code or opencode client integration passed unless those clients are tested in the current environment

## Hackathon Scoring Fit

Scout is designed around the pattern that strong hackathon winners tend to share.

Real domain problem:

- The domain is agentic software engineering.
- AI-written code now enters real repos before humans fully understand it.
- Scout catches the specific failures that happen when coding agents move faster than verification.

Domain credibility:

- The product is built for the exact workflow of this hackathon: Codex writes, subagents inspect, evals verify, and a receipt is handed back.
- It does not pretend to be a generic static analyzer. It focuses on Codex-era failure modes.

Tools, not chat:

- The web app is a visual control surface.
- The MCP server gives agent clients real tools.
- The eval CLI gives deterministic proof.
- The patch executor turns patch quality into an observable gate.

Real artifacts:

- Evidence Pack
- Evidence Graph
- Proof ledger
- Patch tournament
- Execution eligibility result
- Trace receipt
- Tournament receipt
- Codex handoff
- Claude Code handoff

Anti-hallucination discipline:

- known-answer seeded benchmark
- live target answer key
- strict GitHub URL parsing
- bounded repo ingestion
- structured request validation
- strict unified diff validation
- deterministic scoring gates
- temp-workspace patch application
- explicit do-not-claim guardrails
- hygiene checks for secrets, wifi details, and forbidden dashes

Crisp demo moment:

- Show a privacy/spec-drift bug where code logs raw email while comments claim redaction.
- Show three competing patches.
- Show Scout selecting the stronger repair.
- Show a bad patch being disqualified instead of accepted with a low score.
- End by copying the verified handoff back to Codex.

Positive impact:

- Scout reduces unsafe AI-code adoption.
- It helps developers spend fewer review cycles on plausible but broken code.
- It makes security, privacy, and test evidence visible before a patch is trusted.
- It helps teams use agentic coding without silently lowering engineering standards.

## Current Tradeoffs

The web app is the strongest visual demo surface today. The MCP server is real and SDK-backed, with offline seeded eval plus live review/fix tools when credentials are configured. It is local stdio rather than hosted remote MCP.

The public web app deploys on Vercel at `https://scout.sreekarreddy.com`. The local MCP server still runs on the developer machine because stdio MCP is a client-local tool integration.

The seeded benchmark is intentionally small. That makes it reliable for a 2-minute demo, but it is not a broad benchmark across many languages and frameworks yet.

Live repo review is bounded for speed and cost. Scout fetches a selected file tree instead of indexing the entire repository.

The local MCP runner supports the deterministic seeded path without credentials, which is why it is the default release gate. The live MCP path uses the same bounded GitHub and OpenAI review/fix code as the web/API routes, but it requires network access and `OPENAI_API_KEY`.

There is no database yet. That is the right choice for the hackathon demo because receipts, traces, and evals are generated on demand. A database becomes useful later for saved runs, teams, auth, historical comparison, and deployed collaboration.

Patch execution currently applies candidate diffs against fetched repo files and can disqualify invalid or non-applying patches. It does not yet run full project installs in arbitrary repos because that would add sandbox, time, and security complexity.

ZIP upload is postponed. GitHub URL input is better for the demo because it is inspectable, reproducible, and easier for judges to verify.

Voice or multimodal bug intake is postponed. The core differentiator is the verified coding-agent loop, not another intake channel.

Hosted plugin packaging is next. The product already has the official local MCP surface; the next distribution step is a cleaner install wrapper, stable client config, and eventually a remote MCP or plugin package.
