# Castle missions

The building blocks every chapter 3 castle mission is made from, so a mission file is a config (rooms, entry, exit, spawn preset, boss) rather than a hand-written mission class. Mission files themselves stay one level up in `missions/` (this folder is not scanned for missions).

| File | Owns |
|------|------|
| `castleMission.ts` | `defineCastleMission` / `CastleMission`: derives the layout, party spawn, objectives, victory check, spawn events, opening enemies and Mission Map node from the config. Also the POI helpers (`castlePoi`, `castlePoiMapPosition` for placing a map node on a POI, room address parsing). |
| `castleSpawnPresets.ts` | The spawn presets (waves per round interval, opening enemies at `enemySpawn` POIs) and the shared spawn helpers first written for The Lonely Castle (`011` re-exports them). |
| `castleBosses.ts` | Boss setups (units around a centre cell plus their objective): the placeholder Alpha Wolf and the Court Magician (also used by the Chapter 0 test bed, `013`). |

Mission POIs (`entry` / `exit` / `boss` / `explore` tags, `enemySpawn`) live in the castle segments under `MapSegments/castle/`. Map positions come from `chapter3Map.ts`.

Quest missions use the same preset from `questMissions/` (e.g. `quest_castle_*` for Raid the Larder and Forage the Garden): their own `missionId`, `mapNode: null` (no campaign map node; the quest bank is the node), copy and `postMissionStory` from `quests.script.ts`. A room list must fill its bounding box: an empty layout slot composes as open Grass.
