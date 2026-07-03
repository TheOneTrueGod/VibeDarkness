---
name: jp-plan
description: Creates an implementation plan file that breaks work into numbered steps with checklist items, per-step file lists, agent instructions, and high-level AbilityTest coverage, formatted for /jp-implement-plan to execute automatically one step at a time. Use when the user says /jp-plan or asks to turn a design or discussion into a plan file.
---
Save the plan file to `docs/plans/<kebab-name>.md` (not `app/js/games/minion_battles/PLANS/`, which is legacy).

Create a plan file and break the work down into individual changes. Keep changes to a minimal number of files. Use a checklist item for each change so it can be checked off after verification. Only top-level `- [ ]` items directly under a `### Step N` heading count as checklist items; nested bullets are instructions for the item above.

## Agent Instructions section

Include an **Agent Instructions** section that says the plan is executed by `/jp-implement-plan`: the **invoking agent is the sole orchestrator** — it spawns one worker per step **synchronously** (never background), waits for each to finish, then reports plan completion to the user. Each worker implements exactly one step, checks items off with a one-line summary, and **stops without spawning the next agent**. Reference `.claude/skills/jp-implement-plan/SKILL.md` rather than restating its workflow, and list the project skills relevant to this plan.

## Verification cadence — keep steps cheap

Plans were taking too long because every step re-ran broad test suites. Follow this split:

- **Per step:** at most `npm run lint` (and `npx tsc --noEmit` when the step crosses interface boundaries) plus **only the specific test files the step touches or creates**. Never instruct a full-suite, whole-directory, or AbilityTest/E2E run inside a regular step.
- **Final step:** one dedicated verification step at the end of the plan runs the expensive things exactly once — the relevant AbilityTest scenarios, the broad vitest run, and any manual browser checklist.

## AbilityTest coverage

Consider what AbilityTests need to exist to cover the work. Keep them high level: they must run deterministically and quickly, and cover high-level features and systems, not low-level number checks. Think of them like E2E tests — powerful, but expensive, which is why they run once in the final verification step, not per step.
