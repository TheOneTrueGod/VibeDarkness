---
name: campaign-home-tabs
description: How the Campaign Home tabbed UI works in VibeDarkness — tab IDs, routing, visibility rules, and where each tab renders. Use when adding, removing, or modifying tabs on the Campaign Home screen.
---

# Campaign Home Tabs

## When to use this skill

Use when:
- Adding or removing a tab from the Campaign Home screen
- Changing tab visibility (admin-only vs all-users)
- Working on the URL routing for `/campaign/:tabSlug`
- Wiring up a new top-level panel that appears inside `CampaignHomeScreen`

## Key files

| File | Purpose |
|------|---------|
| `app/js/components/CampaignHomeScreen/` | Shell, tab registry, and one `CampaignHome*Tab.tsx` per tab. See that folder's `AGENTS.md`. |
| `app/js/components/ability-tests/campaignTabPaths.ts` | Canonical `TabId` union, URL slugs, and path helpers. |
| `app/js/components/minionBattlesHomePage/` | Panel implementations composed by the tab wrappers (Campaign Summary, Terrain Editor, etc.). |

Tab ids, labels, and visibility live on each `CampaignHome*Tab.tsx` export (registered in `campaignHomeTabs.ts`). Do not list them here — open those files.

## How routing works

- URL pattern: `/campaign/:tabSlug/*`. The trailing splat lets a tab own sub-paths without remounting `CampaignHomeScreen`. Read them inside the tab with `useParams()['*']`.
- `tabFromCampaignSlug(slug)` maps a URL slug to a `TabId` (returns `null` for unknown slugs).
- `campaignPathForTab(tab)` returns the canonical path. Players and Characters override via `getPath` on their tab def (`/players` and `/players/:id/characters`).
- On mount, `CampaignHomeScreen` redirects if the URL tab is missing or not visible. Default tab is `characters`.
- **Ideas tab** sub-tabs are Plans | Ideas | Storybook (`IDEAS_VIEW_IDS`; default Plans). Sub-paths: `/campaign/ideas/plans/:planId`, `/campaign/ideas/ideas/:categoryId` (4-digit ids from the `docs/ideas` filenames) and `/campaign/ideas/storybook/:entryId` (ids from `Ideas/storybook/storybookEntries.ts`). Helpers `ideasPath` / `parseIdeasSubpath` are in `campaignTabPaths.ts`, and `Ideas/useIdeasRoute.ts` redirects a missing or unknown view or id to the first item.
- Character inner tabs live under `/players/:playerId/characters/:characterId/:characterTab`. Helpers and slugs are in `campaignTabPaths.ts`; chrome is `CampaignHomeScreen/CharactersTab/`. Visiting a character without a tab segment defaults to map.

## How to add a new tab

1. Add the `TabId` and URL slug to `campaignTabPaths.ts` (`TabId`, `CAMPAIGN_TAB_SLUG`, `CAMPAIGN_TAB_IDS` — last controls bar order).
2. Create `app/js/components/CampaignHomeScreen/CampaignHome<Name>Tab.tsx` exporting a `CampaignHomeTabDef` (`id`, `label`, `access`, optional `getPath` / `narrowContent`, and `render`).
3. Register that def in `campaignHomeTabs.ts` (`TAB_DEFS` must cover every `TabId`).
4. Put panel UI in `minionBattlesHomePage/` (or inline if it is a small placeholder). Wrap the card in `CampaignHomeTabFrame` so max-width and centering live on that parent, not on `CardWithTitle`. The tab file should stay a thin wrapper.
5. Set `access` (`campaignHomeTabDef.ts`): `'everyone'`; `'manager'` for managers and admins (light-red tab: Ability Test, Ideas, Bestiary, Lobby Archive); `'admin'` for admins only (dark-red tab).
6. Inside the panel, call `useCurrentUser()` for `isAdmin` / `canViewManagerScreens` — do **not** accept them as props.

## Roles

`AccountState.role` is `user` | `dm` | `manager` | `admin` (PHP `PlayerAccount::KNOWN_ROLES`). **Manager** sees the `'manager'` tabs read-only: `Permissions.VIEW_MANAGER_SCREENS` in `app/js/user/permissions.ts`, mirrored by `PlayerAccount::canViewManagerScreens()`, which also gates the read-only Lobby Archive endpoints (list, log, user-state index). Deletes stay admin-only. Grant a role by editing `role` in `storage/accounts/<id>.json` (ids in `accounts_index.json`).

## Testing with the staff tabs

The local debugging accounts (Lomith and LomithTwo, see **playwright-e2e** "Local login") are Managers. Log in through the browser pane and use these tabs while testing:

| Tab | URL | Use it for |
|-----|-----|------------|
| Ideas → Storybook | `/campaign/ideas/storybook/:entryId` | Eyeballing real UI components with live controls (resource cost badges and bars, research cards and tree colours). Good for checking a visual change without starting a battle. Extend it with new entries, e.g. ability cards or research-tree effects; see `minionBattlesHomePage/Ideas/storybook/AGENTS.md`. |
| Bestiary | `/campaign/bestiary` | Viewing every enemy and its abilities. |
| Mission Overview | `/campaign/mission-overview/:missionId` | A mission's real map at tick 0: drag to pan, scroll to zoom, a light-layer toggle to see what the players can see lit, overlay toggles (trigger zones, objective areas, enemy spawn areas, other triggered effects), and a **Spawns & triggers** popover with starting enemies, spawns per round, continuous and triggered spawns, +HP and +damage per round, and a player-count selector. Use it to judge mission layouts, spawns and boss encounters without playing. Data: `storylines/missionOverview/AGENTS.md`. |
| Ability Test | `/campaign/ability-test` | Running ability scenarios live (see **ability-tests**). |
| Lobby Archive | `/campaign/lobby-archive` | Read-only past lobbies: game state, lobby log, user states, performance. |
| Ideas → Plans / Ideas | `/campaign/ideas/plans`, `/campaign/ideas/ideas` | Browser plans and the ideas backlog. |

## Terrain Editor tab

The terrain-editor tab wraps `minionBattlesHomePage/TerrainEditor/TerrainEditorTab`. It depends on TypeScript-registered map segments at render time. Segments are registered synchronously at module load via `registerWorldOfDarknessSegments()` in `app/js/main.tsx` before `ReactDOM.createRoot(...)`.
