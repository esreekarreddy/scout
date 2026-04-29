# Scout

**Scout is a verification layer for AI-written code.**

Codex, Claude Code, Cursor, and other coding agents can move fast, but they can also create fake imports, weak tests, spec drift, privacy mistakes, and patches that look convincing but fail when applied. Scout sits after the coding agent and before trust.

The core loop is:

```text
repo or seeded demo -> specialist scouts -> judge -> patch tournament -> execution gate -> agent handoff
```

Read the full design: [SCOUT_SYSTEM_DESIGN.md](./SCOUT_SYSTEM_DESIGN.md)

Built for the **OpenAI Codex Hackathon - Sydney - 29 April 2026**.

## What Is Real Now

- Web app with seeded demo, live GitHub input, model profiles, scout cards, judge panel, evidence pack, evidence graph, context budget, trace receipt, patch tournament, execution gate, and agent handoff.
- Next.js API routes for review, fix generation, and patch scoring.
- Deterministic seeded benchmark with seven planted AI-code failures.
- Public live target repo designed for real OpenAI/GitHub testing.
- Official TypeScript SDK MCP server with tools, resources, prompts, seeded offline mode, and live public-repo review when `OPENAI_API_KEY` is configured.
- Copyable handoffs for Codex and Claude Code.
- Eval and QA suite covering core logic, patch execution, evidence graph, MCP client smoke, config templates, and hygiene.
- Token-aware context path with inspected-file count, estimated tokens, prompt cache key, and OpenAI cached-token telemetry when the API returns it.

## Demo Flow

1. Open the app.
2. Run the seeded AI-code demo or enter a public GitHub repo.
3. Watch specialist scouts find AI-code failure modes.
4. Let the judge dedupe and label findings as confirmed, likely, or speculative.
5. Generate conservative, idiomatic, and robust patches.
6. Let Scout score and disqualify bad patches.
7. Copy the handoff to Codex or Claude Code.

The strongest demo moment is the patch tournament: a patch can look good but still be disqualified if it cannot apply or does not satisfy the gates.

## Run Locally

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

No key is required for the seeded demo, local MCP smoke test, eval harness, or UI walkthrough.

Production URL:

[https://scout.sreekarreddy.com](https://scout.sreekarreddy.com)

For live repo review, set:

```bash
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-5.5
NEXT_PUBLIC_SITE_URL=https://scout.sreekarreddy.com
GITHUB_TOKEN=your_optional_github_token
```

The current live target repo is:

[https://github.com/esreekarreddy/scout-target-repo](https://github.com/esreekarreddy/scout-target-repo)

## Official MCP

Scout includes a local stdio MCP server built with the official TypeScript MCP SDK. Seeded eval runs offline. Live `scout_review` and `scout_fix` can review public GitHub repos through the same bounded context and OpenAI model path used by the web app when `OPENAI_API_KEY` is configured.

Run the server:

```bash
npm run scout:mcp
```

That command waits for a client over stdio, so it will not print much by itself. To test the MCP surface end to end:

```bash
npm run scout:qa:mcp
```

To test the live MCP path against the public target repo, with real GitHub and OpenAI calls:

```bash
npm run scout:mcp -- --smoke-live
```

Scout exposes:

- tools: `scout_review`, `scout_fix`, `scout_score_patch`, `scout_handoff`, `scout_eval`
- resources: `scout://demo/manifest`, `scout://eval/seeded`, `scout://handoff/demo`
- prompts: `scout-review-this-change`, `scout-run-patch-tournament`, `scout-handoff-to-codex`

Example local client config templates live in:

- [mcp/codex.local.example.json](./mcp/codex.local.example.json)
- [mcp/claude-code.local.example.json](./mcp/claude-code.local.example.json)

The MCP server is SDK-backed and runs over local stdio. `npm run scout:qa:mcp` verifies it through an official MCP SDK client. Remote MCP hosting and packaged plugin distribution are roadmap items.

## Verification

```bash
npm run scout:smoke
npm run scout:qa
npm run scout:eval -- --assert
npx tsc --noEmit --pretty false
npm run lint
npm run build
```

`npm run scout:qa` checks unit behavior, eval JSON shape, official MCP client calls, seeded gates, trace stages, and hygiene rules for dashes, secrets, and wifi details.
