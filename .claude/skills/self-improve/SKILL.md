---
name: self-improve
description: Retrospective on the current session to speed up similar work next time. Use when the user invokes /self-improve or asks to capture lessons, fix stale docs/skills, or reduce repeated confusion.
---

# Self-Improve

## Goal

Make the **next time we try a similar command faster and more efficient** by learning from this session.

Review what just happened — not generic advice. Tie every finding to something concrete from the conversation (a wrong path, a stale skill line, a term mix-up, a dead-end search).

## Workflow

### 1) Reconstruct the session

Briefly summarize:

- What the user asked for
- What actually worked (final approach, key files)
- Where time was lost (wrong assumptions, repeated searches, backtracking)

Use the conversation, tool calls, and any files touched — not memory alone.

### 2) Audit for improvement targets

Look for these categories. Skip any that genuinely did not apply; say so briefly rather than inventing issues.

| Category | What to look for |
|----------|------------------|
| **Documentation / skills** | Incorrect, missing, or out-of-date content in skills (`.cursor/skills/`, `.claude/skills/`), `AGENTS.md`, `CLAUDE.md`, rules, plans, or inline docs that misled the agent |
| **Mistakes / confusions** | Wrong mental models, false assumptions, or bugs we had to debug that future readers should not repeat |
| **Comments** | Misleading, stale, or absent comments on code we touched or relied on |
| **Missing direction** | No skill, rule, or doc pointed to the right folder/API/pattern, so the agent searched unnecessarily |

For each finding, note **evidence** (what happened) and **fix** (what to add, change, or remove).

### 3) Terminology check

If the user used **wrong, ambiguous, or project-nonstandard terms**, call that out in a dedicated subsection.

For **each** term issue, start the line or paragraph with the exclamation mark emoji:

❗ *[correct term or clarification]* — explain what they said, what the codebase/project actually uses, and why the distinction matters.

Do not scold; be precise and helpful. Skip this subsection if terminology was fine.

### 4) Propose updates

Prioritize fixes by impact on future similar tasks:

1. **Skills / rules / AGENTS** — highest leverage for agent workflows
2. **Short comments** at non-obvious decision points in code we touched
3. **Docs / plans** — only when skills are the wrong home

For each proposed change, give:

- **Target** — file path (and section if applicable)
- **Change** — concrete wording or bullet to add/replace (keep it minimal)
- **Why** — one sentence tied to this session

Ask the user whether to **apply edits now**, **apply a subset**, or **stop at the report**. Do not silently rewrite large docs; confirm scope first unless the user already said to apply fixes.

### 5) Close with a short “next time” checklist

3–5 bullets: what an agent (or the user) should do first on a similar task so it finishes faster.

## Output format

Use this structure in the reply:

```markdown
## Session summary
[2–4 sentences]

## Findings

### Documentation & skills
- …

### Confusions resolved
- …

### Comments
- …

### Missing direction
- …

### Terminology
❗ …
(or “None noted.”)

## Proposed updates
1. **[path]** — …

## Next time
- …
```

Keep the report scannable. Prefer fewer, high-quality findings over a long laundry list.

## Constraints

- **Minimize scope** when applying fixes: one accurate paragraph beats rewriting an entire skill.
- **Do not paste volatile details** (enum values, long file lists) into skills — point to source files per **working-with-skills**.
- **Do not run tests or lint** unless you actually edit application code; skill/doc-only edits do not need the post-change test hook.
- If the session was too thin to learn from (e.g. a one-line question with no exploration), say so and suggest running `/self-improve` after a substantive task instead.
