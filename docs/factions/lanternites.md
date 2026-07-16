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

### Nest Network

Nests form a **network** via terrain POIs. Each `nest` POI may declare connections to other `nest` POIs with `connects:<poi_id>` tags. The runtime treats connections as bidirectional.

When a nest spawns, it prioritizes roles:
1. **First spawn** is always a **scout** — it pathfinds toward the nearest unoccupied connected nest POI.
2. **Subsequent spawns** fill the **defender** quota first (≈ half of `maxLanternites`), then send scouts if an unoccupied POI exists.
3. If all connected POIs are occupied, surplus spawns become defenders.

When a scout arrives at its target POI it waits `scoutConstructionSec` (default: 12 s). On completion a new `lanternite_nest` is spawned at that location, and the scout is removed.

### Roles

| Role | Behavior |
|------|----------|
| **scout** | Pathfinds directly to `lanternPatrolFarWorld` (resolved from target POI at spawn); attacks opportunistically when `lanterniteAttackReadyAtGameTime` allows; transitions to construct node on arrival |
| **defender** | Stays within ~3 tiles of home nest (`lanterniteNestOwnerUnitId`); returns if drifted; attacks opportunistically |

### Attack Stagger

Each Lanternite spawned from a networked nest receives a `lanterniteAttackReadyAtGameTime` set to `gameTime + phaseOffset`. The phase offset (`spawnIndex % maxLanternites × roundDuration / maxLanternites`) staggers attacks across a 10 s round window, preventing ability bursts.

### Light-Pulse Attack

Networked Lanternites carry ability **`0010` (Light Pulse)**:
- **Range:** 200 px
- **Damage:** 5
- **Prefire:** 0.7 s (0.4 s aim + 0.3 s fire)
- No chasing — Lanternites only fire when an enemy happens to be in range

### Free Lanternite Respawn

A Lanternite with **no** nest owner (spawned directly into a mission) respawns **3 seconds** after death at the position it died.

### Unit Stats

| Unit | HP | Speed | Perception | Size | Team |
|------|----|-------|------------|------|------|
| `lanternite` | 20 | 70 | 260 | Small | allied |
| `lanternite_nest` | 120 | 0 (stationary) | 0 | Large | allied |

---

## Code Map [Draft]

### Core Lanternite systems
- `app/js/games/minion_battles/game/lanternite/lanternitePulse.ts` — Soul Sap pulse, torch light management, free-unit respawn scheduling, mission start init (`prepareLanterniteNestForMissionStart`)
- `app/js/games/minion_battles/game/lanternite/lanterniteNestTick.ts` — per-tick nest pacing; construction completion loop (scouts → new nest spawn); role-aware networked spawn logic; legacy patrol fallback
- `app/js/games/minion_battles/game/lanternite/lanterniteNetworkUtils.ts` — POI graph helpers: `getConnectedNestPoiIds`, `findUnoccupiedConnectedNestPoi`, `countAliveChildrenByRole`

### AI trees
- `app/js/games/minion_battles/game/units/unitAI/lanterniteNetwork/` — **networked nest AI** (`lnet_assign_role`, `lnet_scout_travel`, `lnet_scout_construct`, `lnet_defend`)
- `app/js/games/minion_battles/game/units/unitAI/lanternitePatrol/` — legacy two-leg patrol AI (kept for backward compat)
- `app/js/games/minion_battles/game/units/unitAI/lanterniteNestIdle/` — passive nest AI (waits each turn)

### Attack ability
- `app/js/games/minion_battles/card_defs/0010_LanterniteStrike/0010Ability.ts` — `LanterniteStrikeAbility` (Light Pulse, range 200, dmg 5)

### Unit definitions & serialization
- `app/js/games/minion_battles/game/units/unit_defs/unitDef.ts` — `lanternite` and `lanternite_nest` stat blocks
- `app/js/games/minion_battles/game/units/Unit.ts` — Lanternite fields: `lanterniteRole`, `lanterniteTargetNestPoiId`, `lanterniteHomeNestPoiId`, `lanterniteConstructionCompleteAtGameTime`, `lanterniteAttackReadyAtGameTime`, `lanterniteNestOwnerUnitId`, `lanternPatrolFarWorld`, `lanternPatrolLeg`, `lanterniteNestConfig`, `lanterniteNestSpawnState` — all serialized in `toJSON` / `fromJSON`

### Spawn definitions & mission config
- `app/js/games/minion_battles/constants/enemyConstants.ts` — `ALLY_LANTERNITE` (abilities: `['0010']`) and `ALLY_LANTERNITE_NEST` spawn templates
- `app/js/games/minion_battles/storylines/types.ts` — `LanterniteNestMissionConfig` (`maxLanternites`, `spawnIntervalSec`, `patrolDestination`, `networked?`, `nestPoiId?`, `scoutConstructionSec?`)

### Terrain network (POIs)
- `app/js/games/minion_battles/terrain/segmentSchema.ts` — `MapSegmentPOI` type; `nest` is a valid POI type; `tags` array holds `connects:<id>` strings
- `app/js/games/minion_battles/storylines/WorldOfDarkness/registerSegments.ts` — registers `nest_west` (west glade, stitched col=7/row=37, tag `connects:nest_south`) and `nest_south` (south gate, stitched col=31/row=33)
- POI `col`/`row` in mission-007 are **stitched-world coordinates** (not segment-local), matching `terrainGrid.gridToWorld(col, row)` in the 44×44 stitched grid

### Engine integration
- `app/js/games/minion_battles/game/GameEngine.ts` — passes `mapPOIs` and `terrainGrid` to `processLanterniteNests` each tick; `drainLanterniteRespawns()` for free-unit respawn

### Mission
- `app/js/games/minion_battles/storylines/WorldOfDarkness/missions/007_ember_threshold.ts` — `networked: true`, `nestPoiId: 'nest_west'`, `scoutConstructionSec: 12`; `maxLanternites: 3`, `spawnIntervalSec: 14`
- Terrain segments: `MapSegments/49_51_west_glade.ts` (nest anchor `LANTERN_NEST_FOCUS`) and `MapSegments/50_51_south_gate.ts` (patrol draw point + south nest site)

### Tests
- `app/js/games/minion_battles/testing/scenarios/general/lanternites.ts` — two gameplay test scenarios:
  - `lanternite_nest_build` — networked nest spawns scout, scout travels and builds second nest
  - `lanternite_defender_attack` — defender fires Light Pulse at nearby enemy

### Assets
- `app/js/games/minion_battles/assets/characters/lanternite.svg`
- `app/js/games/minion_battles/assets/characters/lanternite_nest.svg`
