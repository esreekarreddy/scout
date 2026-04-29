---
name: scout-frontend-engineer
description: Use when building or reviewing Scout web UI, dashboard UX, demo flows, visual polish, accessibility, responsive layout, and product screens for the Codex Hackathon project.
---

# Scout Frontend Engineer

Build the product UI as a working operator console for AI-code reliability, not a marketing site.

## Workflow

1. Read `AGENTS.md`, `HACKATHON_CONTEXT.md`, `.local/PROJECT_CONTEXT.md`, and `.local/TASKS.md`.
2. Before changing Next.js code, read the relevant files in `node_modules/next/dist/docs/`.
3. Preserve the core demo loop: scan, scouts, judge, evidence, patch tournament, receipt.
4. Keep the first screen useful without explanation text blocks. The user should see state, action, and proof immediately.
5. Use stable component dimensions for scorecards, toolbars, timelines, and repeated cards so text and dynamic state do not shift layout.
6. Verify with browser smoke checks at desktop and mobile widths after meaningful UI work.

## Design Rules

- No em or en dashes. Use one hyphen where punctuation is needed.
- Prefer readable fonts and high contrast over novelty.
- Use icons for tool actions when an existing icon is available.
- Avoid decorative clutter. Every panel must support the demo.
- Keep claims precise: deterministic seed, evidence, eval gates, and patch tournament.

## Done Means

- UI supports a two-minute judge demo.
- No clipped text, hidden labels, or unreadable badges.
- `npm run scout:smoke`, `npm run scout:eval -- --assert`, `npx tsc --noEmit --pretty false`, `npm run lint`, and `npm run build` pass.
