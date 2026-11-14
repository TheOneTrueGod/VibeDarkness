# components/

## CampaignHomeScreen/

Tabbed campaign-home shell and one file per tab. See `CampaignHomeScreen/AGENTS.md`. Shared card chrome is `CardWithTitle.tsx`.

## minionBattlesHomePage/

Full-page panel implementations composed by `CampaignHomeScreen/*Tab` files: `BestiaryPanel`, `AdminPlayersHomePanel`, `CampaignSummary/CampaignSummaryPanel`, `JoinMissionPanel`, `AbilityTestPanel`, `LobbyArchive/LobbyArchiveTab`, `Ideas/IdeasPanel` (Plans | Ideas | Storybook; see `Ideas/storybook/AGENTS.md`), `MissionOverview/MissionOverviewPanel` (read-only mission map and spawns; data in `games/minion_battles/storylines/missionOverview/`), and `TerrainEditor/TerrainEditorTab`. All use `PanelLayout` — the shared viewport-height-bounded card with optional left/center/right columns — which also lives here.
