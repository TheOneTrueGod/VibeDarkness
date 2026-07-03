---
name: jp-implement-plan
description: "Executes a jp-plan plan file automatically: the invoking agent acts as an orchestrator, spawning one fresh subagent per step (via the Agent/Task tool) until every checklist item is done — no manual handoff. Each worker implements exactly one step, verifies with lint then targeted tests, and checks items off with one-line summaries. Use when the user says /jp-implement-plan <path-to-plan>."
---

# jp-implement-plan

You are executing a plan file. The plan was passed as an argument — treat that value as the path to the plan file.

The plan file is the **only shared memory** between agents. Everything the next agent needs to know must be written into it.

There are two roles. The agent that receives `/jp-implement-plan` is the **Orchestrator**. Agents spawned with "Step N only" in their prompt are **Workers**.

## What counts as a checklist item

Only **top-level `- [ ]` items directly under a `### Step N` heading** are tracked checklist items. Nested bullets, tables, and code blocks beneath an item are instructions for that item, not separate items.

## Orchestrator role (default)

Do not implement steps yourself — fresh context per step is the point. Coordinate:

1. **Read the plan file** and parse all steps. If the plan has its own **Agent Instructions** section, it takes precedence over generic habits, but not over the rules below. If no unchecked items remain → go to **Completion**.

2. **Cheap baseline.** Run `npm run lint`, then `npx vitest run --changed`. Note any pre-existing failures to pass to every worker. Do **not** run the full suite here unless the user asks for a full baseline.

3. **Loop over steps in document order.** For each step that still has unchecked items, spawn a subagent **synchronously** (wait for it to finish before spawning the next) with exactly this prompt:

   > Read `.claude/skills/jp-implement-plan/SKILL.md` and follow the **Worker role** for the plan at `<plan path>`. You are handling **Step N only**. After completing Step N and checking off all its items, do NOT hand off or spawn agents — stop and report what you did. Pre-existing test failures you are not responsible for: `<list or "none">`.

4. **Verify between spawns.** After each worker returns, re-read the plan file: confirm the step's items are `[x]` with summaries. If the worker returned a **question**, surface it to the user **verbatim** and stop. If a step looks wrong or incomplete, investigate before continuing; stop and report rather than piling steps onto a broken base.

5. When all steps are complete → **Completion**.

**Fallback:** if no subagent/Task tool is available in your environment, implement the current step yourself following the Worker role, then end your turn and give the user this prompt to paste into a new chat: *"Read `.claude/skills/jp-implement-plan/SKILL.md` and follow it for the plan at `<plan path>`."*

## Worker role

You handle exactly the step named in your prompt. Never start another step, and never spawn agents.

1. **Read the plan file** — the Context, Agent Instructions, and your step in full.

2. **Verify the state of the world.** Spot-check that files named in earlier (checked) steps' "Touches"/"Files" lines exist and skim their completion summaries. If something a checked step claims is missing, or verification is already red on arrival beyond the pre-existing failures you were given, **stop and report** instead of building on top of it.

3. **Implement the unchecked items in order.**
   - Read the files listed for the step (and any referenced skills) before coding — do not guess at types or signatures.
   - Apply relevant project skills as needed (e.g. `creating-an-ability`, `missions`, `ability-tests`).
   - After finishing each item, edit the plan file: change `- [ ]` to `- [x]`, write a **one-line summary of what you actually changed** beneath it, and note any files touched outside the step's file list. Save after every item so progress is never lost.

4. **Verify once per step, not per item.** After all items: run `npm run lint`, then `npx vitest run --changed` (or the narrower commands the plan's Agent Instructions specify). Fix what you broke; pre-existing failures from your prompt are not yours. Run mid-step verification only when an item explicitly asks for it. Everything (except listed pre-existing failures) must be green before you finish.

5. **Pause on ambiguity.** If you hit something the plan did not account for — a naming conflict, a missing file, an unclear instruction, an architectural decision — do not guess. Return the question as your final output so the orchestrator can surface it to the user and stop the chain.

6. **Commit only if asked.** If the user requested per-step commits or the plan's frontmatter sets `commitPerStep: true`, run step verification first (so changes are still visible to `--changed`), then commit using the step title as the message.

7. **Stop and report** what you did, including anything surprising you recorded in the plan file.

## Completion

When no unchecked items remain across all steps (orchestrator):

1. Run the full verification sequence one final time: `npm run lint`, then `npm run test`.
2. Write a short completion note at the top of the plan file (date + one-paragraph summary, including any follow-ups noted during implementation).
3. Ask the user whether to archive the plan (e.g. move it to a `done/` folder next to it) — do not delete or move it unprompted.

## Rules

- **Never skip a step** — items in document order within a step; steps in document order across the plan. Steps are sequential dependencies.
- **One step per worker** — fresh context per step; the orchestrator only coordinates.
- **Never modify checked items** — only unchecked → checked transitions (adding a summary line beneath is fine).
- **Lint before tests** — always `npm run lint` before any Vitest run.
- **Targeted tests during steps, full suite only at Completion** — per-step verification is `npx vitest run --changed` or narrower; expensive suites (full run, AbilityTest scenarios) run once at the end unless the plan's final step says otherwise.
- **Always update the plan file** before finishing a step — record anything surprising (workarounds, extra touches, deferred issues) in it, not just in your reply.
