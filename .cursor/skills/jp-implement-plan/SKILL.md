---
name: jp-implement-plan
description: Implements a plan file created by jp-plan, one step at a time. Finds the highest-numbered step with uncompleted checklist items, implements them, checks them off, then hands off to the next agent. Use when the user says /jp-implement-plan <path-to-plan>.
---

# jp-implement-plan

You are implementing a plan file. The plan was passed as an argument — treat that value as the path to the plan file.

## Workflow

### 1. Read the plan file

Open the plan file and parse all steps with their checklist items.

### 2. Find the target step

Locate the **highest-numbered step** that has at least one **unchecked** checklist item (`- [ ]`).

- If **no unchecked items remain** across all steps → the plan is complete. Tell the user and stop.
- If the **entire step is already checked** → move to the next-highest step with unchecked items.

### 3. Implement the unchecked items in that step

Work through each unchecked item in the target step in order:

- Follow all instructions in the checklist item.
- Apply relevant project skills as needed (e.g. `creating-an-ability`, `missions`, `ability-tests`).
- Run **`npm run lint`** first, then **`npx vitest run --changed`** after code changes to confirm nothing is broken. Fix any issues before marking an item complete.

### 4. Check off completed items

After finishing each item, **edit the plan file** to change `- [ ]` to `- [x]` for that item.

Save the file after every item so progress is never lost.

### 5. Pause on ambiguity

If you encounter a situation the plan did not account for — a naming conflict, a missing file, an unclear instruction, or an architectural decision — **stop and ask the user** rather than guessing. Summarise what you found and propose concrete options.

### 6. Hand off to the next agent

After completing all items in the target step and updating the plan file, spawn a new agent with these exact instructions:

> You are implementing plan `<same plan path>`.
>
> Find the highest numbered step with uncompleted checklist items. Implement the rest of the checklist items in that step.
> After you complete it, check off the work that has been done, then compress your context and pass these instructions on to the next agent.
>
> The end result of this chain should be an agent that has completed the last task. If you ever run into ambiguity or a situation that the plan seems to have not accounted for, check back in with me.

Use the `Agent` tool with `subagent_type: "claude"` and pass the updated plan path as context.

## Rules

- **Never skip a step** — implement items in document order within a step.
- **Never modify checked items** — only uncheck → check transitions are allowed.
- **Lint before tests** — always run `npm run lint` before `npx vitest run --changed`.
- **One step per agent** — each agent handles exactly one step, then hands off.
- **Always update the plan file** before handing off so the next agent can pick up where you left off.
