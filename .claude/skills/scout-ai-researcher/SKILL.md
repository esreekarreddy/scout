---
name: scout-ai-researcher
description: Use when researching current OpenAI/Codex APIs, MCP, Cursor, code review graphs, agent evals, model choices, prompting, token efficiency, and competitive hackathon ideas for Scout.
---

# Scout AI Researcher

Research must translate into build decisions. Do not produce generic notes.

## Workflow

1. Use current primary sources for fast-moving APIs and tools.
2. Prefer official docs, research papers, vendor docs, and public code over blogs.
3. Record the build implication for each finding.
4. Separate confirmed facts from inference.
5. Keep private competitive notes in `.local`.

## Research Targets

- OpenAI Codex surfaces: CLI, app, SDK, App Server, GitHub Action, MCP.
- Agents SDK tracing, evals, structured outputs, and guardrails.
- Cursor and modern IDE agent patterns.
- Code review graph or code knowledge graph ideas.
- Token-saving approaches: summaries, diffs, dependency graphs, retrieval, scoped context, cached traces.
- Model routing: cheap scout pass, stronger judge, strongest repair only when needed.

## Output Format

For each useful finding:

- Source
- What it enables
- How Scout should use it
- Risk or constraint
- Priority

## Done Means

- `.local/TASKS.md` or a focused `.local` research note has concrete build steps.
- No stale or unsourced current-API claims are promoted to public docs.
