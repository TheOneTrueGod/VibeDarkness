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
| `app/js/components/minionBattlesHomePage/` | Panel implementations composed by the tab wrappers (Mission Select, Terrain Editor, etc.). |

Tab ids, labels, and visibility live on each `CampaignHome*Tab.tsx` export (registered in `campaignHomeTabs.ts`). Do not list them here — open those files.

## How routing works

- URL pattern: `/campaign/:tabSlug`
- `tabFromCampaignSlug(slug)` maps a URL slug to a `TabId` (returns `null` for unknown slugs).
- `campaignPathForTab(tab)` returns the canonical path. Players and Characters override via `getPath` on their tab def (`/players` and `/players/:id/characters`).
- On mount, `CampaignHomeScreen` redirects if the URL tab is missing or not visible. Default tab is `characters`.

## How to add a new tab

1. Add the `TabId` and URL slug to `campaignTabPaths.ts` (`TabId`, `CAMPAIGN_TAB_SLUG`, `CAMPAIGN_TAB_IDS` — last controls bar order).
2. Create `app/js/components/CampaignHomeScreen/CampaignHome<Name>Tab.tsx` exporting a `CampaignHomeTabDef` (`id`, `label`, `isVisible`, optional `adminTab` / `getPath` / `narrowContent`, and `render`).
3. Register that def in `campaignHomeTabs.ts` (`TAB_DEFS` must cover every `TabId`).
4. Put panel UI in `minionBattlesHomePage/` (or inline if it is a small placeholder). The tab file should stay a thin wrapper.
5. For admin-only tabs set `adminTab: true` (red-tinted tab bar) and `isVisible: (isAdmin) => isAdmin`.
6. Inside the panel, call `useCurrentUser()` for `isAdmin` — do **not** accept `isAdmin` as a prop.

## Terrain Editor tab

The terrain-editor tab wraps `minionBattlesHomePage/TerrainEditor/TerrainEditorTab`. It depends on TypeScript-registered map segments at render time. Segments are registered synchronously at module load via `registerWorldOfDarknessSegments()` in `app/js/main.tsx` before `ReactDOM.createRoot(...)`.
