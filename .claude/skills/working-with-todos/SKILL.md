---
name: working-with-todos
description: Instructions for creating, categorizing, and completing project todos in docs/TODO.md. Invoke whenever the user says "add a todo", "add this to the todo list", "note this for later", "remember to …", "we should …" (about future work), or asks to complete/remove a todo. Also invoke when a code comment says "TODO" and the user asks to track it.
---

# Working with Todos

All todos live in [docs/TODO.md](../../../docs/TODO.md).
Completed todos move to [docs/todo-verify.md](../../../docs/todo-verify.md).

## Adding a Todo

1. Search no more than 5 code files to understand the scope of the work.
2. Write a description of at most 3 sentences.
3. Assign a difficulty category (see below) based on your findings.
4. Add a row to the correct table in `docs/TODO.md`.

## Difficulty Categories

| Category | When to use |
|----------|-------------|
| **Trivial** | Small numerical tweaks or wiring in a predefined structure. The relevant code is easy to locate. No tests required. |
| **Easy** | Targeted change to a few files with a clear path to success. |
| **Medium** | Requires back-and-forth with the user to define the right solution, or a refactor that touches more than one file. |
| **Hard** | Large scope that must be broken into smaller todos first. Discuss and plan only — do not implement directly. |

## Table Format

Each section uses a markdown table:

```markdown
## Trivial

| Todo | Notes |
|------|-------|
| Short title | Up to 3 sentences describing what and why. |
```

## Completing a Todo

1. Remove the row from `docs/TODO.md`.
2. Append a row to the matching table in `docs/todo-verify.md`, adding a **Date** column with today's date (YYYY-MM-DD).
