---
name: writing-nested-agents-files
description: Conventions for writing AGENTS.md files inside the VibeDarkness project (not top-level or system AGENTS). Use when creating or editing an AGENTS.md for a subfolder of the codebase.
---

# Writing Nested AGENTS Files

AGENTS.md files inside the project give future agents a fast orientation for a specific area of the codebase. They are **not** comprehensive API docs — they are a map that tells an agent where ownership lives and which files to open next.

## What to write

- **One or two sentences** on what the folder/subsystem exists to do and why.
- A **folder-level table** summarising what each subdirectory owns. Prefer folder rows over file rows — only break out individual files when they are large or unusual enough to warrant a sentence on their own.
- **Class-level summaries** are appropriate when a file contains a non-obvious or load-bearing class: one sentence on what it owns, two if the class is large or complex. Do not list methods, fields, constants, or enums — point to the file instead.
- Mention **subsystem AGENTS files** when a subfolder has its own AGENTS.md, so agents know to go there for deeper context.

## What to leave out

- Specific function signatures, constant values, or variable names. These belong in the code; AGENTS files that echo them go stale.
- Step-by-step how-to instructions (those belong in SKILL.md files).
- Diagrams or data-flow sections unless the flow is genuinely non-obvious from reading the files.
- Anything the agent could derive by opening the files directly.

## Format

Use a single `# Title` heading matching the folder or subsystem name. Use a Markdown table for the folder/file map. Keep the whole file short enough to scan in under a minute.

## When to create one

Create an AGENTS.md in a folder when:
- The folder owns a distinct subsystem or concept.
- An agent arriving cold would not immediately know what the folder is for or which files to read first.

Reference it from the nearest parent AGENTS.md so it is discoverable.
