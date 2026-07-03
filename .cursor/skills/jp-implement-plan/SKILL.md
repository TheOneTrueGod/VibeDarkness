---
name: jp-implement-plan
description: "Executes a jp-plan plan file: the invoking agent is the sole orchestrator, spawning one worker per step synchronously until every checklist item is done, then reporting completion to the user. Workers implement exactly one step and never spawn agents. Use when the user says /jp-implement-plan <path-to-plan>."
---

# jp-implement-plan

You are executing a plan file. The plan path was passed as an argument.

The plan file is the **only shared memory** between agents. Everything the next worker needs must be written into it.

There are two roles. The agent that receives `/jp-implement-plan` is the **Orchestrator**. Agents spawned with "Step N only" in their prompt are **Workers**.

## What counts as a checklist item

Only **top-level `- [ ]` items directly under a `### Step N` heading** are tracked. Nested bullets, tables, and code blocks are instructions for that item, not separate items.

## Orchestrator role (default)

**You own the full chain and the final user-facing report.** Do not implement steps yourself when a Task/subagent tool is available — fresh context per step is the point. Coordinate:

1. **Read the plan file** and parse all steps. If the plan has an **Agent Instructions** section, it takes precedence over generic habits, but not over the rules below. If no unchecked items remain → **Completion**.

2. **Find the next step:** the **lowest-numbered** step that still has at least one unchecked item (`- [ ]`). Steps run in document order (1, then 2, …). Never pick the highest-numbered incomplete step.

3. **Cheap baseline (once, at start).** Run `npm run lint`, then `npx vitest run --changed`. Note pre-existing failures to pass to every worker. Do not run the full suite here unless the user asks.

4. **Loop:** for each incomplete step in order, spawn **one** worker and **wait for it to finish** before spawning the next:
   - Use the Task tool with `subagent_type: "generalPurpose"`.
   - **Do not** set `run_in_background: true`. Background spawn + ending your turn drops the chain: notifications only reach the direct parent, and only while that parent is still active.
   - Prompt exactly:

   > Read `.cursor/skills/jp-implement-plan/SKILL.md` and follow the **Worker role** for the plan at `<plan path>`. You are handling **Step N only**. After completing Step N and checking off all its items, do NOT hand off or spawn agents — stop and report what you did. Pre-existing test failures you are not responsible for: `<list or "none">`.

5. **Verify between workers.** After each worker returns, re-read the plan: confirm that step's items are `[x]` with one-line summaries. If the worker returned a **question**, surface it to the user **verbatim** and stop. If a step looks wrong or incomplete, investigate before continuing.

6. When all steps are complete → **Completion** (you report to the user; workers never do).

**Fallback:** if no Task/subagent tool is available, implement the current step yourself (Worker role), then continue the loop in the same turn. Do not ask the user to paste prompts between steps unless you are blocked.

## Worker role

You handle **exactly** the step named in your prompt. Never start another step. **Never spawn agents** (no Task/Agent handoff).

1. **Read the plan file** — Context, Agent Instructions, and your step in full.

2. **Spot-check prior steps.** If a checked step's claimed work is missing, or verification is already red beyond the pre-existing failures you were given, **stop and report** instead of building on it.

3. **Implement unchecked items in order.**
   - Read every file in the step's "Touches" list before coding.
   - Apply relevant project skills as needed.
   - After each item: `- [ ]` → `- [x]`, add a **one-line summary** of what actually changed, save the plan.

4. **Verify once per step** (unless the plan's Agent Instructions specify narrower commands): `npm run lint`, then the step's listed tests (or `npx vitest run --changed`). Fix what you broke; listed pre-existing failures are not yours. Everything else must be green before you finish.

5. **Pause on ambiguity.** Return the question as your final output so the orchestrator can surface it and stop.

6. **Commit only if asked** (user or plan `commitPerStep: true`).

7. **Stop and report** to the orchestrator only — do not message the user about plan completion, and do not spawn the next step.

## Completion (orchestrator only)

When no unchecked items remain:

1. Run final verification: `npm run lint`, then `npm run test` (or the plan's final-step verify list if it is more specific).
2. Write a short completion note at the top of the plan (date + one-paragraph summary, including follow-ups).
3. **Report plan complete to the user** in this chat — automated results, anything still needing a human (e.g. browser checklist), and open questions.
4. Ask whether to archive the plan (e.g. `done/` next to it) — do not move or delete it unprompted.

## Rules

- **Root orchestrator only spawns** — workers never spawn workers. Nested handoffs break notification delivery.
- **Synchronous workers** — wait for each worker; never background a plan step and end the turn.
- **Lowest-numbered incomplete step** — document order; never "highest-numbered."
- **Never skip a step** — items and steps in document order.
- **One step per worker** — fresh context; orchestrator only coordinates and reports.
- **Never modify checked items** — only unchecked → checked (summary line beneath is fine).
- **Lint before tests** — always `npm run lint` before any Vitest run.
- **Targeted tests per step; full suite at Completion** — unless the plan's final step says otherwise.
- **Always update the plan file** before a worker finishes — surprises go in the plan, not only in chat.
