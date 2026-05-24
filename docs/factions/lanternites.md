# Faction: The Lanternites

---

## Thematic Primer [Draft]

Lanternites are small bioluminescent creatures that live in and around organic nests deep in fungal dark places. They are **allied** to the players — not enemies — functioning as a form of wild, semi-tamed light-ecology.

They are not intelligent allies. They do not follow orders or make decisions. They wander patrol routes near their nest, emit a soft green glow, and are described as "fearless" once nearby threats are cleared. The narrative frames them as wild things drawn to movement: *"restless green lanterns drifting like wild things."*

The nests are living nurseries — organic, protective structures that birth scouts at a steady rhythm. They need protection; stirring one brings nearby scouts rushing back.

The creatures sustain their light through **Soul Sap** — a self-destructive pulse that drains their own HP twice per round. They are fragile, persistent, and somewhat tragic light sources: alive because they keep burning themselves.

Their first story appearance ("Ember at the Threshold") frames them as a transition point — the player moves from pure survival into something that resembles stewardship.

---

## Mechanical Primer [Draft]

### Soul Sap Pulse

Twice per round (at `round_start` and `round_half`), every living Lanternite loses **7% of its max HP**. This is unconditional — there is no way to turn it off for a living Lanternite. It is both their power source and their mortality.

If `lightLevelEnabled` is active on the mission, the pulse also refreshes their torch light contribution (light amount: `12`, radius: `4.5` tiles).

### Nest Ecology

- Nests are stationary (speed 0) and use a passive AI — they simply wait each turn.
- Each nest spawns child Lanternites on a configurable interval up to a configurable cap.
- Each spawned child is tagged with the nest's unit ID (`lanterniteNestOwnerUnitId`) and given a patrol endpoint (`lanternPatrolFarWorld`).
- Nest-owned Lanternites do **not** globally respawn when killed — the nest re-spawns them on its own schedule.

### Patrol AI

Lanternites walk a two-leg loop:
1. `toFar` — move toward the patrol endpoint (set by the nest's mission config)
2. `toNest` — return to the nest's position

They swap legs when within **36 px** of the arrival point. If the parent nest is dead, the Lanternite waits out its turn.

### Free Lanternite Respawn

A Lanternite with **no** nest owner (spawned directly into a mission, not via nest ecology) respawns **3 seconds** after death at the position it died. This is tracked in GameEngine as a scheduled respawn queue.

### Unit Stats

| Unit | HP | Speed | Perception | Size | Team |
|------|----|-------|------------|------|------|
| `lanternite` | 20 | 70 | 260 | Small | allied |
| `lanternite_nest` | 120 | 0 (stationary) | 0 | Large | allied |

Neither unit has active combat abilities (empty ability list). Lanternites fight only incidentally.

---

## Code Map [Draft]

### Core Lanternite systems
- `app/js/games/minion_battles/game/lanternite/lanternitePulse.ts` — Soul Sap pulse logic, torch light source management, free-Lanternite respawn scheduling, mission start init
- `app/js/games/minion_battles/game/lanternite/lanterniteNestTick.ts` — per-tick nest spawn pacing; reads nest config, checks alive count and timer, spawns patrol children

### AI trees
- `app/js/games/minion_battles/game/units/unitAI/lanternitePatrol/` — two-leg patrol AI (`lantern_patrol.ts`, `context.ts`, `index.ts`)
- `app/js/games/minion_battles/game/units/unitAI/lanterniteNestIdle/` — passive nest AI (waits each turn)

### Unit definitions & serialization
- `app/js/games/minion_battles/game/units/unit_defs/unitDef.ts` — `lanternite` and `lanternite_nest` stat blocks (hp, speed, size, perception, `creatureType: 'beast'`)
- `app/js/games/minion_battles/game/units/Unit.ts` — Lanternite-specific fields: `lanterniteNestOwnerUnitId`, `lanternPatrolFarWorld`, `lanternPatrolLeg`, `lanterniteNestConfig`, `lanterniteNestSpawnState`; all serialized in `toJSON` / `fromJSON`

### Spawn definitions & mission config
- `app/js/games/minion_battles/constants/enemyConstants.ts` — `ALLY_LANTERNITE` and `ALLY_LANTERNITE_NEST` spawn def templates
- `app/js/games/minion_battles/storylines/types.ts` — `LanterniteNestMissionConfig` type (`maxLanternites`, `spawnIntervalSec`, `patrolDestination`) and `LanternitePatrolDestination` union

### Engine integration
- `app/js/games/minion_battles/game/GameEngine.ts` — `lanterniteRespawns` queue; `drainLanterniteRespawns()` for free-unit respawn on timer
- `app/js/games/minion_battles/game/managers/LevelEventManager.ts` — `applyLanterniteEcologySpawnFields()` wires patrol fields onto units spawned from wave entries

### Mission using Lanternites
- `app/js/games/minion_battles/storylines/WorldOfDarkness/missions/007_ember_threshold.ts` — first Lanternite mission; nest at west glade, patrol to south gate, up to 3 scouts, 14s spawn interval; proximity reinforcement spawns 2 extra on enemy approach
- Terrain segments: `MapSegments/49_51_west_glade.ts` (nest anchor) and `MapSegments/50_51_south_gate.ts` (patrol draw point)

### Assets
- `app/js/games/minion_battles/assets/characters/lanternite.svg`
- `app/js/games/minion_battles/assets/characters/lanternite_nest.svg`
