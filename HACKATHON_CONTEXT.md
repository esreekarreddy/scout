# OpenAI Codex Hackathon - Sydney Context

This repository is the pre-event blueprint and starting point for the OpenAI Codex Hackathon - Sydney. Future agents should use this file to understand the event constraints before making planning, README, demo, or submission changes.

## Event

- Event: OpenAI Codex Hackathon - Sydney
- Date: Wednesday, 29 April 2026
- Time: 9:00 AM - 8:00 PM
- Venue: UTS Startups
- Address: 3 Broadway, Ultimo NSW 2007, Australia
- Registration and breakfast start at 9:00 AM.
- Doors close at 9:50 AM sharp. No late admissions.
- Only approved participants with a valid ticket are allowed entry.
- All team members must register and be approved individually.
- Teams can be formed on the day.
- Attendance is capped at 100 builders, with a maximum of 4 members per team.
- Watch the Stay Safe UTS video before arrival.

## Event Positioning

This is not an introductory workshop. The event is intended for developers who already use AI coding tools daily and are comfortable shipping production-grade code.

The expected mode is to move fast, build from scratch or extend eligible open-source work, publish the result, and use Codex heavily:

- Spin up subagents and parallel tasks.
- Use plugins.
- Use worktrees where useful for parallel development.
- Build with Codex or on top of Codex, including App Server, SDKs, or custom abstractions.
- Focus on ideas that would not be possible without Codex.
- Submit via a public post to `/r/codex`.

Event-provided resources include unlimited Codex access, OpenAI API credits, and 1 month of ChatGPT Pro. Further credit instructions will be sent by email before the hackathon. The prize pool is over approximately 200k USD in credits and subscriptions.

## Build Direction

The exact theme, build direction, and further details will be shared during the morning briefing. Expect about 6+ hours of build time.

Suggested directions from the event page:

- Agentic Coding: developer tools that maximize leverage from Codex as an AI coding agent.
- UX for Agentic Applications: AI-native interaction patterns and product flows.
- Multimodal Intelligence: systems that reason across text, voice, and vision.
- Domain Agents: vertical agents with real-world constraints.
- Building Evals: tooling to measure, debug, and improve agent performance.

## Rules

- All judged work must be done on-site during the hackathon.
- The build direction will be shared on the day itself.
- Participants may start from scratch.
- Participants may fork and extend an existing open-source project using GitHub's fork feature, clearly labelled.
- Extending a personal project is allowed only if the extension is significant and substantial.
- If extending a personal project, the hackathon submission must be in a new repository.
- If extending a personal project, link to the original repository in the README.
- The README and demo video must clearly explain what was built during the hackathon.

For this repository specifically: treat it as a blueprint and starting point. If it becomes part of the hackathon submission, future agents must clearly separate pre-event scaffold work from on-site hackathon work in the README, write-up, and demo narrative.

## Submission Requirements

By 5:00 PM on Wednesday, 29 April 2026, the submission must include:

- A public GitHub repository link. If judges cannot access it, it cannot be assessed.
- A short write-up.
- A 2-minute demo video. The 2-minute limit is strictly enforced.
- Optional: a deployed demo link.

Submission and Reddit participation rules from the day-of email:

- Each participant must comment their Reddit username on the registration Reddit post before 11:00 AM.
- This must be one comment per team member.
- If the username is not registered before 11:00 AM, the participant may not be able to submit later.
- From 11:00 AM, an online discussion megathread will run for questions and `/r/codex` community interaction.
- At 4:00 PM, the organizers will create and email the submission megathread.
- The final entry must be posted in that submission thread before 5:00 PM.
- Late entries or entries in the wrong format will not be considered.
- The submission must come from a Reddit username registered earlier in the day.

Use this post format:

```text
!ENTRY

Team Name: Wild Turnips
Project Title: Four-Stage Crop Rotation System for Continuous Farm Output
GitHub Repo: https://github.com/example/project
Video: [YouTube url]
Write-up: https://github.com/wildturnips/rotation#readme
```

## Local Prep Docs

The `.local/` folder contains private prep notes and required supporting docs for this project. It is excluded through `.git/info/exclude`, not `.gitignore`, so it is local to this clone and should not be assumed to exist for teammates or judges.

Current private docs include:

- `.local/00_START_HERE.md`
- `.local/01_DAY_OF_RUNBOOK.md`
- `.local/02_WINNING_STRATEGY.md`
- `.local/03_SCOUT_SCAFFOLD_GUIDE.md`
- `.local/04_NEXT_STEPS.md`
- `.local/archive/2026-04-28-pre-event-research/`

When working locally, future agents should consult `.local/` for private planning context when needed. Do not copy private-only notes, credentials, hidden venue details, or non-public prep material into public files unless explicitly requested.

## Practical Guardrails For Agents

- Before changing Next.js app code, follow the repo `AGENTS.md` rule and read the relevant Next.js docs under `node_modules/next/dist/docs/`.
- Keep the public README honest about what already existed before the hackathon and what was built on-site.
- Keep the demo path focused on a working product, not just architecture.
- Avoid adding secrets or private event details to tracked files.
- Preserve `.local/` as the local-only planning area.
