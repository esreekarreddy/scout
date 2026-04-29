---
name: scout-backend-engineer
description: Use when changing Scout APIs, MCP tool surface, repo analysis, trace generation, patch scoring, deterministic fixtures, server-side integration, or data/storage decisions.
---

# Scout Backend Engineer

Build deterministic infrastructure first. Model calls can propose; Scout must verify.

## Workflow

1. Read `AGENTS.md`, `HACKATHON_CONTEXT.md`, `.local/PROJECT_CONTEXT.md`, and `.local/TASKS.md`.
2. Before changing Next.js server routes, read the relevant files in `node_modules/next/dist/docs/`.
3. Keep seeded mode fully offline and deterministic.
4. Add traceable boundaries for every step: input, scout, judge, fix, score, handoff.
5. Validate structured data with explicit schemas before using model output.
6. Do not store secrets, wifi details, API keys, or private event notes in tracked files.

## Architecture Rules

- Prefer pure functions in `src/lib` and thin API/tool wrappers.
- Shared behavior should power UI, CLI, smoke tests, and MCP tools.
- Failed validation, failed patch application, or failed checks must be visible and cannot win a tournament.
- A database is only justified for shared team history, accounts, saved runs, or deployed multi-user use. The hackathon demo should work without one.

## Done Means

- Deterministic seed remains green.
- CLI and API use the same underlying pipeline.
- Trace or receipt artifacts have checksums and clear deterministic versus model boundaries.
