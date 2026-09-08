# CampaignHomeScreen/

Tabbed campaign-home shell. The screen owns campaign bootstrap, URL routing, and the tab bar. Each tab is a sibling file that exports its chrome (`label`, visibility, path) plus a render function.

## Folder map

| Area | Purpose |
|------|---------|
| `CampaignHomeScreen.tsx` | Shell: load/create campaign, resolve `activeTab`, render the tab bar. |
| `campaignHomeTabs.ts` | Registry: every `TabId` maps to a tab def. Bar order follows `CAMPAIGN_TAB_IDS`. |
| `campaignHomeTabDef.ts` | Shared tab-def and render-props types. |
| `CampaignHome*Tab.tsx` | One file per tab. Each wraps its card in `CampaignHomeTabFrame` (centers + max width). |
| `CharactersTab/` | Character-sheet layers and inner-tab routes. See that folder's `AGENTS.md`. |
| `CampaignHomeTabFrame.tsx` | Parent box that centers the card and sets its max width. |
| `app/js/components/CardWithTitle.tsx` | Shared titled card chrome (Welcome uses it directly; other tabs go through `PanelLayout`). |

URL slugs and `TabId` live in `app/js/components/ability-tests/campaignTabPaths.ts`. Panel implementations stay under `minionBattlesHomePage/` — do not move Terrain Editor or Lobby Archive internals here.
