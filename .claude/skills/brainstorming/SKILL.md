---
name: brainstorming
description: Guides a collaborative brainstorming workflow that turns an initial idea into concrete mechanics, aligned decisions, and a step-based implementation plan. Stops for user feedback after options, after progression layout, and while co-defining vocabulary.
---

# Brainstorming

Use this when the user wants to shape a new system, feature, class fantasy, ability set, or content direction before coding.

## Goal

Move from rough idea -> refined concept -> explicit decisions -> implementation-ready plan.

## Mandatory pauses (do not skip)

The agent must **stop and wait for the user’s reply** at these points unless the user has already given a clear “continue / you choose” instruction for that phase.

1. **After diverge, before converge** — Present the option set, walk through tradeoffs in short form, and invite discussion. **Do not** merge into a single direction until the user has picked, combined, or ruled out options (or explicitly delegates the choice).
2. **After progression structure, before baseline numbers** — Show the tree/table/layout and ask whether power escalation, lanes, and shared nodes look right. **Do not** nail down constants until the user confirms or revises the structure (or explicitly says to proceed).
3. **Shared vocabulary** — Treat the glossary as **co-authored**: propose a first pass, then iterate with the user on names and definitions until the wording is stable enough for implementation and UI.

## Workflow

### 1) Frame the objective

- Restate the user's target in plain terms.
- Capture non-negotiables first (must-have mechanics, constraints, exclusions).
- Define the intended player experience (what should feel good).

Deliverable:

- A short "locked constraints" list.

### 2) Diverge (generate options)

- Generate multiple candidate mechanics, themes, or structures.
- Keep options distinct (avoid minor variations of one idea).
- For each option, include:
  - why it fits the theme
  - where it overlaps with other options
  - what tradeoff it introduces

Deliverable:

- Option set with concise pros/tradeoffs.
- **Pause (Mandatory pause 1):** End the turn here; discuss options with the user and only then continue to step 3.

### 3) Converge (choose direction)

- **Only after** Mandatory pause 1 (unless the user already directed convergence).
- Merge the user’s chosen pieces into one coherent direction.
- Remove contradictory ideas and call out what was dropped.

Deliverable:

- Unified direction with explicit included/excluded elements.

### 4) Structure into progression

- Organize the direction into a progression model (tiers/depths/lanes).
- Ensure power escalation is readable and intentional.
- Add overlap points between paths if multi-build.

Deliverable:

- Tree or progression layout (table + optional mermaid).
- **Pause (Mandatory pause 2):** End the turn here; confirm with the user that the progression reads correctly before tuning numbers.

### 5) Specify mechanics with baseline numbers

- **Only after** Mandatory pause 2 (unless the user already approved the structure or asked to proceed).
- Add initial values for key constants (ranges, gains, durations, thresholds).
- Define event ownership and trigger timing in plain language.
- Write "usable but weaker off-condition" rules when relevant.

Deliverable:

- Initial mechanics spec with starter numbers.

### 6) Define shared vocabulary (collaborative)

- **Mandatory pause 3:** Work with the user, not at them: draft terms and definitions, then invite edits (rename, split, merge concepts) until both sides are happy.
- Introduce reusable keywords for recurring behavior and define important state terms clearly.
- Keep wording stable so implementation and UI match; record what was rejected as well as what stuck, if that avoids future confusion.

Deliverable:

- Keyword and state glossary **agreed through iteration** (may take more than one exchange).

### 7) Convert into a staged plan

- Break work into implementation slices.
- For each slice, include:
  - target systems/files
  - success criteria
  - test expectations
- Track status (completed vs remaining).

Deliverable:

- Step-based plan document ready for execution.

### 8) Capture open decisions

- List unresolved items as explicit checkboxes.
- Keep decisions actionable ("choose A vs B") rather than vague.
- Prioritize blockers to implementation first.

Deliverable:

- Open decisions checklist.

## Communication style

- Keep brainstorming iterative and collaborative.
- Use short cycles: propose → **wait for feedback** → refine. At mandatory pauses, ask a concrete question (e.g. “Which option should we build on, or how should we hybridize A and C?”).
- Prefer concrete examples over abstract language.
- Separate "decided" from "to decide" clearly.

## Output templates

Use these formats as needed:

- 3-column table for multi-lane systems (`left | shared | right`)
- Mermaid diagram for dependency/progression clarity
- "Status" section with completed/remaining steps
- "Open decisions" checklist for unresolved details

## Completion criteria

This process is complete when:

1. Core direction is agreed (after the post-diverge discussion).
2. Progression layout is confirmed (after the post-structure check).
3. Shared vocabulary is settled together.
4. Mechanics are specific enough to implement.
5. Plan is broken into execution slices.
6. Open decisions are tracked.
7. Next implementation step is unambiguous.
