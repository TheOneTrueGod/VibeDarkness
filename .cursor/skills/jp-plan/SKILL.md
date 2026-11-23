---
name: jp-plan
description: Creates an implementation plan file that breaks work into numbered steps with checklist items, per-step file lists, agent instructions, and high-level AbilityTest coverage, formatted for /jp-implement-plan to execute automatically one step at a time. Use when the user says /jp-plan or asks to turn a design or discussion into a plan file. If the user asks for a "plan", assume they mean a /jp-plan. If they ask for a "browser plan", use /jp-browser-plan instead (a prioritized report shown in the Ideas tab).
---
> **Plan vs browser plan:** "plan" means this skill (an executable plan in `docs/plans/`). A "browser plan" is a different thing: a prioritized P0/P1/P2 report shown in the Ideas tab. See the **jp-browser-plan** skill.

Save the plan file to `docs/plans/<kebab-name>.md` (not `app/js/games/minion_battles/PLANS/`, a legacy folder that no longer exists; all plans live under `docs/plans/`, finished ones in `docs/plans/done/`).

Create a plan file and break the work down into individual changes. Keep changes to a minimal number of files. Use a checklist item for each change so it can be checked off after verification. Only top-level `- [ ]` items directly under a `### Step N` heading count as checklist items; nested bullets are instructions for the item above.

## Agent Instructions section

Include an **Agent Instructions** section that says the plan is executed by `/jp-implement-plan`: the **invoking agent is the sole orchestrator** — it spawns one worker per step **synchronously** (never background), waits for each to finish, then reports plan completion to the user. Each worker implements exactly one step, checks items off with a one-line summary, and **stops without spawning the next agent**. Reference `.cursor/skills/jp-implement-plan/SKILL.md` rather than restating its workflow, and list the project skills relevant to this plan.

## Verification cadence — tests run once, at the end

Plans were taking too long because every step re-ran test suites. Follow this split:

- **Per step:** write the step's test files, but **do not run Vitest**. Run only `npm run lint:changed`, plus `npx tsc --noEmit` when the step crosses interface boundaries. Each step still ends with a `Verify:` line naming its test files; those are what the final step runs.
- **Final step:** one dedicated verification step at the end runs every test file the steps listed, once, then `npm run test:sim` when the plan needs a scenario run, and fixes failures (in the files of the step that owns them). Never `npm run test:all`. Include any manual browser checklist when needed.
- Say this in the plan's **Agent Instructions** so workers follow it.

## AbilityTest coverage

Consider what AbilityTests need to exist to cover the work. Keep them high level: they must run deterministically and quickly, and cover high-level features and systems, not low-level number checks. Think of them like E2E tests — powerful, but expensive, which is why they run once in the final verification step (via `npm run test:sim` when the plan says so), not per step.
