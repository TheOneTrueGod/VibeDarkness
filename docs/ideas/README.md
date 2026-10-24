# Ideas

Brainstorming backlog shown on the admin-only **Ideas** tab of the Campaign Home screen.

- One file per category, named `NNNN_slug.md`. The 4-digit prefix is the category's permanent id (it appears in the URL, `/campaign/ideas/ideas/NNNN`) and sets the order in the left panel. Give a new category the next unused number, and never renumber existing files, since that breaks saved links.
- The first `# Heading` is the category name.
- Each `-` bullet is one idea. Indent sub-bullets by two spaces to nest them.
- This README is not loaded (only files starting with a digit are).

## Browser plans

The tab's **Plans** view lists **browser plans** from `docs/ideas/plans/*.md`.

- Name each file `NNNN_YYYY-MM-DD_slug.md`. `NNNN` is the plan's permanent id (URL `/campaign/ideas/plans/NNNN`; use the next unused number and never renumber). The date is shown in the list; newest plans come first.
- The first `# Heading` is the plan title. The rest of the file is rendered as Markdown (headings, paragraphs, nested `-` bullets, `**bold**`, `` `code` ``, `---` rules, and `> [!DECISION]` cards for decisions you need to make).
- How to write one (priorities, complexity, structure): the **jp-browser-plan** skill.
