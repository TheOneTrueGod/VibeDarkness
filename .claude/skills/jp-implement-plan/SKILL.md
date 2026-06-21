---
name: jp-implement-plan
description: "Implements a jp-plan plan file one step at a time: finds the first step (in document order) with unchecked checklist items, implements it, verifies with lint then tests, checks items off with one-line summaries, then hands off to the next agent. Use when the user says /jp-implement-plan <path-to-plan>."
---

# jp-implement-plan

You are implementing a plan file. The plan was passed as an argument — treat that value as the path to the plan file.

The plan file is the **only shared memory** between agents in the chain. Everything the next agent needs to know must be written into it before you hand off.

## What counts as a checklist item

Only **top-level `- [ ]` items directly under a `### Step N` heading** are tracked checklist items. Nested bullets, tables, and code blocks beneath an item are instructions for that item, not separate items.

## Workflow

### 1. Read the plan file

Open the plan file and parse all steps with their checklist items. If the plan has its own **Agent Instructions** section, follow it — it takes precedence over generic habits, but not over the rules below.

### 2. Find the target step

Locate the **first step in document order** (lowest-numbered) that has at least one **unchecked** checklist item (`- [ ]`).

- If **no unchecked items remain** across all steps → go to **Completion** below.
- Steps are sequential dependencies — never start a later step while an earlier one has unchecked items.

### 3. Verify the state of the world

Before writing code, confirm the previous steps actually landed: spot-check that files named in earlier (checked) steps' "Touches" lines exist, and skim their completion summaries. If something a checked step claims to have done is missing, or the test suite is already red on arrival, **stop and report** instead of building on top of it.

### 4. Implement the unchecked items in that step

Work through each unchecked item in the target step in order:

- Read the files listed in the step's "Touches" line (and any referenced skills) before coding — do not guess at types or signatures.
- Follow all instructions in the checklist item.
- Apply relevant project skills as needed (e.g. `creating-an-ability`, `missions`, `ability-tests`).
- Per item: run **`npm run lint`** first, then **`npx vitest run --changed`**. Fix any issues before marking the item complete.

### 5. Check off completed items

After finishing each item, **edit the plan file**:

- Change `- [ ]` to `- [x]`.
- Write a **one-line summary of what you actually changed** beneath the checkbox.
- If you touched files outside the step's "Touches" line, note them explicitly under the item.

Save the file after every item so progress is never lost.

### 6. End-of-step verification

After all items in the step are done, run the full sequence per the post-change hook: **`npm run lint`**, then **`npx vitest run --changed`**, then the **full suite** (`npm run test`). Everything must be green before you hand off — the next agent cannot tell inherited failures from their own.

### 7. Pause on ambiguity

If you encounter a situation the plan did not account for — a naming conflict, a missing file, an unclear instruction, or an architectural decision — **stop and ask the user** rather than guessing. Summarise what you found and propose concrete options.

If you are running as a **subagent**, do not guess and do not ask the void: return the question as your final output so the parent agent can surface it to the user **verbatim** and stop the chain.

### 8. Commit (only if asked)

Do not commit by default. If the user requested per-step commits, or the plan's frontmatter sets `commitPerStep: true`, commit after the step passes verification, using the step title as the commit message.

### 9. Hand off to the next agent

After completing the step, updating the plan file, and passing verification, spawn a **fresh agent** with this prompt (do not paraphrase the skill into the prompt — reference it, so instructions cannot drift):

> Read `.claude/skills/jp-implement-plan/SKILL.md` and follow it for the plan at `<same plan path>`.

Use whatever subagent/task tool is available in your environment. If no such tool is available, end your turn and give the user that exact prompt to paste into a new chat.

## Orchestrator mode

When the user says **"orchestrate the plan"** or **"kick off a subagent for each step"**, the invoking agent acts as a coordinator rather than an implementer:

1. **Establish a baseline.** Before spawning any subagent, run `npx vitest run` and note any pre-existing failures. Pass this list in every subagent prompt so they aren't blocked by inherited red tests.

2. **Spawn one subagent per step** with this prompt structure:
   > Read `.claude/skills/jp-implement-plan/SKILL.md` and follow it for the plan at `<path>`. You are handling **Step N only**. Steps 1–(N-1) are already complete (all items checked). After completing Step N and checking off all its items, do NOT hand off to another agent — stop and report what you did. [Include pre-existing failure list if any.]

3. **Verify after each step.** Read the plan file and confirm the checklist items are marked `[x]` before spawning the next subagent. If a step's changes look wrong, investigate before proceeding.

4. **Report to the user** once all steps are complete (or immediately if a step fails).

The "one step per agent" rule still applies — each subagent implements exactly one step. The orchestrator just manages the chain instead of the plan handing off automatically.

## Completion

When no unchecked items remain across all steps:

1. Run the full verification sequence one final time (`npm run lint`, `npm run test`).
2. Write a short completion note at the top of the plan file (date + one-paragraph summary, including any follow-ups noted during implementation).
3. Ask the user whether to archive the plan (e.g. move it to a `done/` folder next to it) — do not delete or move it unprompted.

## Rules

- **Never skip a step** — implement items in document order within a step, and steps in document order across the plan.
- **Never modify checked items** — only uncheck → check transitions are allowed (adding a summary line beneath is fine).
- **Lint before tests** — always run `npm run lint` before any Vitest run.
- **One step per agent** — each agent handles exactly one step, then hands off.
- **Always update the plan file** before handing off so the next agent can pick up where you left off.
- **The plan file is the chain's memory** — record anything surprising (workarounds, extra touches, deferred issues) in it, not just in your reply.
