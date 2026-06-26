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
| `app/js/components/CampaignHomeScreen.tsx` | Top-level component: renders the tab bar, routes `activeTab` to the correct panel. |
| `app/js/components/ability-tests/campaignTabPaths.ts` | Canonical list of `TabId` values, URL slugs (`CAMPAIGN_TAB_SLUG`), and helpers `tabFromCampaignSlug` / `campaignPathForTab`. |
| `app/js/components/TerrainEditor/TerrainEditorTab.tsx` | Panel rendered when `activeTab === 'terrain_editor'`. |
| `app/js/components/TerrainEditor/AGENTS.md` | Full agent guide for the Terrain Editor tab. |

## Tab inventory

| `TabId` | URL slug | Visible to | Notes |
|---------|----------|-----------|-------|
| `welcome` | `welcome` | everyone | Placeholder panel. |
| `mission_select` | `mission-select` | admin | Admin-only storyline/mission list. |
| `join_mission` | `join-mission` | everyone | Lobby-code entry + recent lobbies. |
| `players` | `players` | admin | Admin players panel (`AdminPlayersHomePanel`). |
| `ability_test` | `ability-test` | admin | Headless ability-test runner (`AbilityTestPage`). |
| `terrain_editor` | `terrain-editor` | admin | Canvas-based map segment editor (`TerrainEditorTab`). |

## How routing works

- URL pattern: `/campaign/:tabSlug`
- `tabFromCampaignSlug(slug)` maps a URL slug to a `TabId` (returns `null` for unknown slugs).
- `campaignPathForTab(tab)` returns the canonical path for navigation.
- On mount, `CampaignHomeScreen` redirects to the default tab if the URL tab is missing or not visible to the current user. Admins default to `mission_select`; non-admins default to `join_mission`.

## How to add a new tab

1. Add the new `TabId` string literal to the `TabId` union in `campaignTabPaths.ts`.
2. Add its URL slug to `CAMPAIGN_TAB_SLUG` in the same file.
3. Add an entry to `CAMPAIGN_TAB_IDS` (controls render order in the tab bar).
4. Add an entry to `TAB_SETTINGS` in `CampaignHomeScreen.tsx` with a `label` and `isVisible` predicate. The predicate receives `isAdmin: boolean`, sourced from `useCurrentUser()` at the top of the component.
5. Add a conditional render block in `CampaignHomeScreen.tsx` (inside the `hasCampaign && !campaignLoading && campaign` block).
6. If the tab is admin-only, set `adminTab: true` in `TAB_SETTINGS` — this gives it the red-tinted tab-bar style.
7. Inside the new panel component, call `const { isAdmin } = useCurrentUser()` (from `app/js/user/useCurrentUser.ts`) directly — do **not** accept `isAdmin` as a prop.

## Terrain Editor tab

The `terrain_editor` tab renders `<TerrainEditorTab />` (admin-only). It depends on TypeScript-registered map segments being available at render time. Segments are registered synchronously at module load via `registerWorldOfDarknessSegments()` called in `app/js/main.tsx` before `ReactDOM.createRoot(...)`.

For the full Terrain Editor agent guide, see `app/js/components/TerrainEditor/AGENTS.md`.
