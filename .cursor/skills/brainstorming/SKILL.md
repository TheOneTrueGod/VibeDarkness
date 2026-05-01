---
name: brainstorming
description: Guides a collaborative brainstorming workflow that turns an initial idea into concrete mechanics, aligned decisions, and a step-based implementation plan.
---

# Brainstorming

Use this when the user wants to shape a new system, feature, class fantasy, ability set, or content direction before coding.

## Goal

Move from rough idea -> refined concept -> explicit decisions -> implementation-ready plan.

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

### 3) Converge (choose direction)

- Ask which options resonate most.
- Merge selected pieces into one coherent direction.
- Remove contradictory ideas and call out what was dropped.

Deliverable:

- Unified direction with explicit included/excluded elements.

### 4) Structure into progression

- Organize the direction into a progression model (tiers/depths/lanes).
- Ensure power escalation is readable and intentional.
- Add overlap points between paths if multi-build.

Deliverable:

- Tree or progression layout (table + optional mermaid).

### 5) Specify mechanics with baseline numbers

- Add initial values for key constants (ranges, gains, durations, thresholds).
- Define event ownership and trigger timing in plain language.
- Write "usable but weaker off-condition" rules when relevant.

Deliverable:

- Initial mechanics spec with starter numbers.

### 6) Define shared vocabulary

- Introduce reusable keywords for recurring behavior.
- Add clear definitions for important state terms.
- Keep wording stable so implementation and UI match.

Deliverable:

- Keyword and state glossary.

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
- Use short cycles: propose -> get feedback -> refine.
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

1. Core direction is agreed.
2. Mechanics are specific enough to implement.
3. Plan is broken into execution slices.
4. Open decisions are tracked.
5. Next implementation step is unambiguous.
