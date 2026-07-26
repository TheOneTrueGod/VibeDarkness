# quests/

World of Darkness **QuestDef** content: mini-run definitions (slots, tags, completion Campaign Rewards) registered into `QUEST_MAP` via `storylines/questRegistry.ts`. Hierarchy is Campaign → Quest → Missions.

## Folder map

| Path | Owns |
|------|------|
| `*.ts` (this folder) | One file per quest: exported `QuestDef` + quest id constant. |
| `../questMissions/` | Missions used only by quests (copies / random-story bag). Keep separate `missionId`s from main-path missions so `missionResults` do not collide. |
| `../WorldOfDarkness.ts` | Storyline edges + `questSlotBanks` (map banks / unlock gates). |

## System code (not in this folder)

Runtime types, run state, slot resolve, lobby advance/retry/abandon, and Campaign Rewards apply-on-clear live under `storylines/` (`questTypes.ts`, `questRun.ts`, `questSlotResolve.ts`, `questLobby.ts`, `questCampaignRewards.ts`, `questRegistry.ts`). Design notes: `docs/plans/quest-system.md`. Mission Map / Quest Prep UI: `ui/components/CharacterEditor/` (`MissionMapTab`, `QuestBanksPanel`).
