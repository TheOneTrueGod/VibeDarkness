# storylines/missionOverview/

Read-only planning data for the Mission Overview tab (`/campaign/mission-overview/:missionId`, Managers and admins). It reads mission definitions and a tick-0 preview engine and never changes battle state. The UI lives in `app/js/components/minionBattlesHomePage/MissionOverview/`.

| File | Owns |
|------|------|
| `buildMissionPreviewEngine.ts` | Builds a mission's engine at tick 0 with one placeholder player, mirroring the setup in `game/sessionLoad.ts` (`loadSession`) without the network. Keep the two in step when mission setup changes. |
| `missionSpawnSummary.ts` | Groups a mission's spawns into starting enemies, waves by round, continuous spawns and triggered / gated spawns, with HP (player-count scaled, as `LevelEventManager` does) and estimated damage per round. Also lists non-spawn triggered effects. |
| `missionOverlayShapes.ts` | World-space shapes for the map overlays (trigger zones, objective areas, enemy spawn areas, other triggered effects), each on a toggleable layer. |
| `missionChapterGroups.ts` | Groups missions by storyline chapter for the mission list: a chapter owns its `missionIds` plus the fixed missions of quests its quest banks accept. Player chapters first, then admin-only chapters, then "Not in a chapter". Each entry is tagged `boss` (`missionType: 'boss'`), `sideQuest` (side mission, or from a bank drawn as a side quest) or `main`; the list draws a red / purple left border for the first two. |
| `missionOverview.test.ts` | Unit tests for the summary, overlay shapes, chapter grouping and damage estimate. |

Damage per round comes from `abilities/abilityDamagePerRound.ts`: each ability's `getDamage()` times casts per round (its full timing cycle, cooldown included). An enemy ability without `getDamage()` counts as unknown, so new enemy abilities should implement it.

A new level-event or trigger type should get a case in `missionSpawnSummary.ts` (and `missionOverlayShapes.ts` if it has an area) so the overview keeps showing everything a mission does.
