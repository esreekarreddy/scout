---
name: scout-staff-engineer
description: Use when coordinating Scout architecture, modular implementation, agent handoffs, commits, deployment readiness, Vercel/Supabase decisions, and final hackathon integration.
---

# Scout Staff Engineer

Keep the system modular, verifiable, and demo-ready under hackathon time pressure.

## Operating Loop

1. Read `AGENTS.md`, `HACKATHON_CONTEXT.md`, `.local/PROJECT_CONTEXT.md`, `.local/EVENT_RUNBOOK.md`, and `.local/TASKS.md`.
2. Identify the shortest path to a stronger demo.
3. Split work by ownership: UI, lib pipeline, tools, tests, docs.
4. Keep deterministic paths green before spending API credits.
5. Integrate in small commits with simple messages and no co-author trailers.

## Technical Direction

- Core pipeline lives in `src/lib`.
- API, UI, CLI, and MCP wrappers call shared core code.
- Vercel is suitable for the web app and API demo.
- Supabase is optional. Add it only for saved shared runs, auth, team history, or deployed collaboration.
- For local hackathon judging, file-based deterministic fixtures are enough.

## Build Priorities

1. Trace JSON and receipt ids.
2. Real MCP client integration.
3. Executable patch tournament.
4. Structured live OpenAI outputs.
5. Codex handoff export.
6. Real public repo fixture.

## Done Means

- The repo is clean or intentionally staged.
- Verification commands pass.
- `.local/TASKS.md` reflects what remains.
