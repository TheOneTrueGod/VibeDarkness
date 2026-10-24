---
name: jp-browser-plan
description: Creates a "browser plan" - a high-level, prioritized roadmap or investigation report (P0/P1/P2 items with complexity estimates) shown in the admin Ideas tab's Plans view on the Campaign Home screen. Use when the user says /jp-browser-plan or asks for a "browser plan". If the user asks for a "plan" without saying "browser", assume they want a /jp-plan (an executable step-by-step implementation plan in docs/plans/), not a browser plan.
---

# Browser Plans

A **browser plan** is a prioritized, human-readable report: an architecture pass, a roadmap, or a triage of work before a milestone. It is read in the app (Campaign Home → **Ideas** tab → **Plans**), not executed by agents.

**Browser plan vs `/jp-plan`:**

| Asked for | Make |
|-----------|------|
| "plan", "/jp-plan", "turn this into a plan" | A `/jp-plan`: executable steps and checklists in `docs/plans/`, run by `/jp-implement-plan`. |
| "browser plan", "/jp-browser-plan" | This skill: a prioritized report in `docs/ideas/plans/`. |

A browser plan item can later be turned into a `/jp-plan`. In that case, link the browser plan item from the jp-plan; don't copy it.

## Where it lives and how it loads

- **One file per plan:** `docs/ideas/plans/NNNN_YYYY-MM-DD_kebab-slug.md`.
  - `NNNN` is the plan's permanent 4-digit id. Use the next unused number. It appears in the URL (`/campaign/ideas/plans/NNNN`), so never renumber a plan.
  - The date is the day the plan was added. Use today's date and never change it later.
- **Loading:** `app/js/components/minionBattlesHomePage/Ideas/plansData.ts` loads every file with `import.meta.glob` (eager, `?raw`). There is no registry to update; adding the file is enough.
- **File names:** they must match `NNNN_YYYY-MM-DD_slug.md`. Other names are silently skipped. The list shows plans newest first, with ties ordered by slug.
- **Title:** the first `# Heading` is the plan title shown in the list and the detail header. It is removed from the body, so don't repeat it.
- **UI components:** `IdeasPanel.tsx` (tab and selection come from the URL via `useIdeasRoute.ts`; path helpers `ideasPath` / `parseIdeasSubpath` are in `components/ability-tests/campaignTabPaths.ts`), `PlanList.tsx` (left pane), `PlanDetail.tsx` (right pane: sticky header plus items), `PlanFilterBar.tsx` (filters) and `PlanSizeChip.tsx` (T-shirt badge). The Ideas categories (`docs/ideas/NNNN_*.md`) are a separate tab; see `docs/ideas/README.md`.

## Data structure

The Markdown file is the source of truth. `plansData.ts` parses it into a tree once at load time (`PlanDoc.sections`, built by `groupPlanSections`), and the UI and filters work on that tree, never on raw text:

- **Group** (`PlanGroup`): one per `##` heading (for example a priority). It holds that section's items and loose blocks up to the next `#`/`##` heading or `---`.
- **Item** (`PlanItem`): one per `###` heading, with `title`, `done` (from the `[x] ` prefix), `size` (from its `**Complexity:**` line, or `null` if it has none) and its body `blocks`.
- **Loose block:** anything outside an item, such as the intro, the legend, rules and "Suggested order" bullets.

Filtering is a pure function, `filterPlanSections(sections, filters)`, with tests in `plansData.test.ts`. If an item needs new metadata (for example an owner or a status), derive it in `groupPlanSections` from a convention in the Markdown, add it to `PlanItem`, and test it there. Don't make the renderer parse text.

## Supported Markdown (read `plansData.ts` for the exact rules)

The parser is deliberately small. Stick to:

- `#` title (once), `##` priority sections, `###` items. Deeper headings render but are rarely needed.
- **Collapsible items:** each `###` heading and everything under it (up to the next `#`/`##`/`###` heading or `---`) renders as a collapsible item. Click the header to expand or collapse it.
- **T-shirt size:** each item's `**Complexity:**` line sets the size badge at the right of its header, which stays visible while the item is collapsed: Low → **Sm** (green), Medium → **Md** (amber), Large → **Lg** (red). Only the first word after `**Complexity:**` counts. An item without the line gets no badge, and size filters never hide it.
- **Completed items:** prefix the item title with `[x] `, as in `### [x] P0.2 Remove …`. The item then shows a green check to the left of its name and starts collapsed. Open items have no prefix and start expanded.
- Paragraphs: consecutive lines join into one paragraph, and a blank line ends it.
- `-` bullets. Indent by two spaces to nest. An indented non-bullet line continues the bullet above it.
- Inline `**bold**` and `` `code` ``.
- `---` horizontal rules between priority sections.
- **Decision cards:** a line `> [!DECISION] <question>`, followed by `>` lines for the body (context, `-` options; use a bare `>` for a blank line). The body is parsed with the same rules. The card ends at the first line that doesn't start with `>`. It renders as a blue info card with a question-mark icon on the left and a "Decision needed" label.

Not supported (they render as plain text or break layout): tables, links, images, numbered lists, plain block quotes (only `[!DECISION]` cards), code fences, and italics. If a plan needs one of these, extend `parsePlanMarkdown` / `PlanDetail` and add a case to `plansData.test.ts`. Don't work around it in the content.

## Required structure

Follow the existing plans in `docs/ideas/plans/`. The first one, `0001_2026-10-24_chapter-3-preparations.md`, is the reference. In order:

1. **`# Title`**
2. **Intro paragraph:** what the plan is for and what milestone it serves.
3. **Complexity legend:** a bullet list defining Low / Medium / Large (below).
4. **Baseline (optional):** the state the plan was written against, for example whether `tsc` is clean or which infrastructure already exists.
5. **`---`**, then one `## P0: …`, `## P1: …` and `## P2: …` section each, separated by `---`. Leave out a priority section that would be empty.
6. **Items:** each one is `### P<n>.<m> Short imperative title`, numbered within its priority.
7. **`## Suggested order` (optional):** bullets grouping item ids by milestone or dependency.

### Priorities

- **P0: must do.** Anything the user explicitly asked for always goes here, plus blockers the investigation found.
- **P1: good to do.** Removes friction the upcoming work will hit repeatedly. Prerequisites for P0 items can also live here; mark them as such.
- **P2: nice to do.** Worthwhile hygiene and refactors, done opportunistically.

Within a priority, order items by dependency first, then by value.

### Complexity

Every item starts with a `**Complexity:** <level>` line, written exactly like that (bold label, then `Low`, `Medium` or `Large` as the first word), because the T-shirt badge and size filters read it. Add a short reason in parentheses when the level isn't obvious.

- **Low:** a few changes to a few files.
- **Medium:** overhauls a small subsystem.
- **Large:** touches many parts of the code and likely needs a data migration.

Optionally add `**Helps:** …` (which upcoming features benefit) or `**Prerequisite for P0.x**` on the same line, separated by `.` or `·`.

### Item body

- Lead with **findings** that change the picture, especially where the user's assumption doesn't hold, for example "not dead code: used by quest X". Confirm such claims in code before writing them.
- Then a **proposal**: generalize the fix in line with "Build the engine, not the feature" (`app/js/games/minion_battles/AGENTS.md`).
- Name concrete files, folders and symbols in backticks so a later `/jp-plan` can start from them. Describe the problem pattern; don't paste code.
- When the user asks for options (names, approaches), list each with a one-line trade-off and end with a **Recommendation:** line.
- **Required decisions always go in a decision card**, never in plain prose. A decision is required when work on the item can't start (or would likely be redone) until the user picks. Put the card at the end of the item it blocks. Make the question one short sentence, and put the options with their trade-offs (and any recommendation) in the card body. Items with no open question get no card.
- Call out anything that needs a migration. The backend runner is described in `backend/scripts/migrate.php`.

## Filtering (Plans page)

The sticky header over each plan holds the title, the date and the filters:

- **Hide done:** hides every `[x]` item.
- **Sizes (Sm / Md / Lg):** toggles which sizes are shown. A size that is turned off appears struck through.
- A `##` group whose items are all hidden disappears, heading included. Groups that have no items at all, such as "Suggested order", always stay.
- The header shows how many items are hidden.
- Filter state is local to the page and resets on refresh.

So filters work on a new plan without extra effort: give every item a `###` heading, a `**Complexity:**` line, and an `[x] ` prefix once it's done.

## Workflow

1. **Investigate before writing.** Grep and read the code behind each claim. Count references when sizing complexity. Check `docs/TODO.md` for existing todos to fold in, and cite them rather than duplicating.
2. **Write the file** with today's date in the name.
3. **Verify it loads:** run `npx vitest run app/js/components/minionBattlesHomePage/Ideas`. The `loads the docs/ideas/plans folder` case in `plansData.test.ts` checks that the folder parses. Add the new title to that assertion only if the plan is meant to stay as a fixture.
4. **Summarize in chat:** give the headline findings (especially surprises), list the open decision cards, and point the user to Ideas → Plans. Don't paste the whole plan into chat.

## Editing an existing browser plan

- Keep the file name, and therefore the date. Update items in place; don't renumber items that other plans or jp-plans might reference.
- When the user answers a decision, replace its card with the outcome in the item text (for example "Decided: keep X").
- When an item is done, mark it with `[x] ` (see Supported Markdown) rather than deleting it, so the plan keeps a record. Before adding the marker, check that the change actually landed (diff, tests). Keep the item number unchanged.
