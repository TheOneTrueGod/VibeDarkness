# Ideas/storybook/

The Storybook view of the Ideas tab (`/campaign/ideas/storybook/:entryId`): a web-dev-style storybook for eyeballing real UI components in one place. Entries are listed on the left, the selected entry's examples render on the right, and a fixed-height control panel along the bottom changes its settings. Managers and admins see it in the Ideas tab. Signed-out visitors get it too, with no login: `AuthGate` shows `PublicStorybookPage` for any `/campaign/ideas/storybook/...` URL (`storybookEntryIdFromPath`), so agents can open a link and check a visual change without an account or a battle. Entries must therefore render client-side data only, with no account or server calls.

| File / folder | Owns |
|---------------|------|
| `storybookTypes.ts` | The entry and control contracts (`select`, `range`, `toggle`, typeahead `search`, and `state`: a URL-only string the preview sets itself, not drawn in the panel), helpers for reading control values, and the URL mapping (`storybookValuesFromSearchParams` / `storybookSearchParams`). |
| `storybookEntries.ts` | The registry: entry order in the left list. |
| `entries/` | One file per entry. Each renders the real game components, never copies. |
| `StorybookView.tsx` | Entry list, preview area, and control values kept in the URL query (each entry's last query is remembered when switching away and back). |
| `PublicStorybookPage.tsx` | The standalone, no-login page (entry list + `StorybookView`) for signed-out visitors. |
| `StorybookControlPanel.tsx` | The bottom control panel. |
| `storybookEntries.test.tsx` | Renders every entry with its default controls. |

## URL parameters

Every control is a query parameter named after its `id`, so a link opens the page already set up. Only values that differ from the default are written, and bad values fall back to the default (a `select` must name an option, a `range` is clamped, a toggle is `1` or `0`). Give controls short, readable ids since they are the URL.

- `/campaign/ideas/storybook/research-cards?node=mighty&pin=1&level=2`: one node, its tooltip and reminder cards pinned open beside it, at level 2/5.
- `/campaign/ideas/storybook/research-cards?tree=training`: one tree, every visible node (with no `tree` set each tree shows a `count`-card sample). The target button at the right end of a tree's header sets or clears `tree`. The chevron left of the name collapses the tree to its header; collapsed tree ids are kept as `collapsed=training,gravity`.
- `/campaign/ideas/storybook/resources?resource=water&fill=25`: one resource row.

An entry's `render(values, setValue)` can change its own controls from the preview (e.g. that focus button); it goes through the URL like the panel.

Use a link like this to check a visual change, instead of a throwaway preview page. If no entry can show the case, add a control or an entry.

## Entries

Current entries: **Resources** (cost badges and in-game bars at several fills; `resource` search), **Research Cards** (tree colours, Upgrades nameplates, node cards; `node` search over title, id and description text, `pin` draws each card's tooltip open beside it via `ResearchNodeCard`'s `tooltipMode="pinned"`, `level`) **Terrain** (every terrain layer on the real renderers, in `LAYER_ORDER`; `layout`, `zoom` 0.5-3. Click or drag to paint with the palette: the grid is kept in `paint` as `<layout>~<rows>`, one base-36 `TerrainType` digit per cell, and the brush in `brush`. **Copy layout** copies a letter grid, legend and link to paste into a bug report) and **Garden Heart** (every look option from the garden boss artbook, with the selected palette and Heart style marked; the option lists live in `fxArt/gardenHeartArt.tsx`, so a plan can keep only the chosen option) and **Effects** (in-battle visual effects on the real renderers at zoom 2.0 and 0.5, one card per effect with that effect's controls on the card's title row; only `paused=1` is in the bottom panel, and it freezes world time while wall-time motion keeps playing. **Darkness damage** card: the corruption tick, needle ring, ground pool and rupture hit on a player in full darkness; `look` picks a `DARKNESS_CORRUPTION_LOOKS` preset and `fill` (0-100) is the ring held while paused. **Spell circles** card: a list (growing with the page, no inner scroll) of every registered style (`listSpellCircleStyles`), each a circle from `createSpellCircleEffect` on a casting player replayed as it ends; `windup` is the seconds to the cast. Card values are `state` controls, so links keep them). Add a new effect as another card in `entries/effectsStory.tsx` on the shared `EffectStage` (a scene with a hero, its effects and a tick), not a new entry.

Good next entries: ability cards (`AbilitySlot` / hand cards, modes, costs), research-tree effects (`ResearchAbilityPreview`, node states), tooltips, and any new reusable component. Add a file under `entries/` and list it in `storybookEntries.ts`.
