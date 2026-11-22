# Ideas/storybook/

The Storybook view of the Ideas tab (`/campaign/ideas/storybook/:entryId`): a web-dev-style storybook for eyeballing real UI components in one place. Entries are listed on the left, the selected entry's examples render on the right, and a fixed-height control panel along the bottom changes its settings. Managers and admins see it in the Ideas tab. Signed-out visitors get it too, with no login: `AuthGate` shows `PublicStorybookPage` for any `/campaign/ideas/storybook/...` URL (`storybookEntryIdFromPath`), so agents can open a link and check a visual change without an account or a battle. Entries must therefore render client-side data only, with no account or server calls.

| File / folder | Owns |
|---------------|------|
| `storybookTypes.ts` | The entry and control contracts (`select`, `range`, `toggle`, typeahead `search`), helpers for reading control values, and the URL mapping (`storybookValuesFromSearchParams` / `storybookSearchParams`). |
| `storybookEntries.ts` | The registry: entry order in the left list. |
| `entries/` | One file per entry. Each renders the real game components, never copies. |
| `StorybookView.tsx` | Entry list, preview area, and control values kept in the URL query (each entry's last query is remembered when switching away and back). |
| `PublicStorybookPage.tsx` | The standalone, no-login page (entry list + `StorybookView`) for signed-out visitors. |
| `StorybookControlPanel.tsx` | The bottom control panel. |
| `storybookEntries.test.tsx` | Renders every entry with its default controls. |

## URL parameters

Every control is a query parameter named after its `id`, so a link opens the page already set up. Only values that differ from the default are written, and bad values fall back to the default (a `select` must name an option, a `range` is clamped, a toggle is `1` or `0`). Give controls short, readable ids since they are the URL.

- `/campaign/ideas/storybook/research-cards?node=mighty&pin=1&level=2`: one node, its tooltip and reminder cards pinned open beside it, at level 2/5.
- `/campaign/ideas/storybook/research-cards?tree=training`: one tree.
- `/campaign/ideas/storybook/resources?resource=water&fill=25`: one resource row.

Use a link like this to check a visual change, instead of a throwaway preview page. If no entry can show the case, add a control or an entry.

## Entries

Current entries: **Resources** (cost badges and in-game bars at several fills; `resource` search), **Research Cards** (tree colours, Upgrades nameplates, node cards; `node` search over title, id and description text, `pin` draws each card's tooltip open beside it via `ResearchNodeCard`'s `tooltipMode="pinned"`, `level`) and **Garden Heart** (every look option from the garden boss artbook, with the selected palette and Heart style marked; the option lists live in `fxArt/gardenHeartArt.tsx`, so a plan can keep only the chosen option).

Good next entries: ability cards (`AbilitySlot` / hand cards, modes, costs), research-tree effects (`ResearchAbilityPreview`, node states), tooltips, and any new reusable component. Add a file under `entries/` and list it in `storybookEntries.ts`.
