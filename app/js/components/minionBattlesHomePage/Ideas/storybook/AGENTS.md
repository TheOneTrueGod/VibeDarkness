# Ideas/storybook/

The Storybook view of the Ideas tab (`/campaign/ideas/storybook/:entryId`): a web-dev-style storybook for eyeballing real UI components in one place. Entries are listed on the left, the selected entry's examples render on the right, and a fixed-height control panel along the bottom changes its settings. Managers and admins can open it, including the local debugging accounts, so agents can use it to check a visual change in the browser without starting a battle.

| File / folder | Owns |
|---------------|------|
| `storybookTypes.ts` | The entry and control contracts (`select`, `range`, `toggle`, typeahead `search`) and helpers for reading control values. |
| `storybookEntries.ts` | The registry: entry order in the left list. |
| `entries/` | One file per entry. Each renders the real game components, never copies. |
| `StorybookView.tsx` | Entry list, preview area and per-entry control state. |
| `StorybookControlPanel.tsx` | The bottom control panel. |
| `storybookEntries.test.tsx` | Renders every entry with its default controls. |

Current entries: **Resources** (cost badges and in-game bars at several fills) and **Research Cards** (tree colours, Upgrades nameplates, node cards).

Good next entries: ability cards (`AbilitySlot` / hand cards, modes, costs), research-tree effects (`ResearchAbilityPreview`, node states), tooltips, and any new reusable component. Add a file under `entries/` and list it in `storybookEntries.ts`.
