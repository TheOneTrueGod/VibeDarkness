# Faction: The Darkness

The Darkness is both the environment and the enemy. It is the setting itself — a corrupted world — and the engine that generates the creatures that inhabit it.

---

## Thematic Primer [Draft]

The Darkness is not a villain with a plan; it is a condition. It pervades the world of "A World of Darkness" as a slow, ambient corruption — turning natural animals into wrong things. Wolves with too many eyes. Creatures that don't flinch. Things that dissolve into purple smoke when they die, as if they were never fully real.

Dark creatures are distorted mirrors of beasts: they look almost like something you'd recognise, but the details are off. They have no self-preservation. They pursue with single-minded purpose until they or their target is gone. There is no negotiating with them, no fleeing from them — they just keep coming.

The Darkness also manifests spatially. Caves and enclosed spaces favour it; open areas with campfires, crystals, or Lanternites push it back. Certain dark creatures are specifically weakened by bright light — the Darkness's own corruptions become liabilities when illuminated.

The **Alpha Wolf / The Beast** is the apex expression of this corruption so far — a massive, wrong version of a pack animal, standing guard over dark crystals deep in a cave.

---

## Mechanical Primer [Draft]

### Light Level System

The world has a global light level that varies per mission. Light is modelled as a grid of per-tile values; individual sources (campfires, Lanternites, dark crystals) add or subtract from base levels.

Thresholds defined in `darknessLevels.ts`:
- `FULL_DARKNESS = -20`
- `NEUTRAL_DARKNESS = 0`
- `BRIGHT_LIGHT = 10`

### Light Hate

Some dark creatures are weakened when standing on a tile at or above `BRIGHT_LIGHT`. This is an opt-in per-unit mechanic. Affected units: **Thornbinder**, **Husk Artillery**.

### Dark Creature Presentation

Units with `creatureType: 'dark_creature'` share a consistent visual language:
- **Palette:** dark purple
- **On injury:** no blood
- **On death:** dissolve in purple particle smoke (not a corpse)

This is enforced via `darkCreatureDissolutionDeathEffect` — it is not opt-in per unit, it is the faction's death contract.

### Darkness-Based Spawning

Missions can spawn dark creatures continuously from the Darkness itself (not from a nest or fixed wave). This is used in mission 002 to create endless pressure. See `LevelEventManager` for how darkness spawn waves are processed.

### Enemy Roster [Draft]

| Unit ID | Type | Notes |
|---------|------|-------|
| `dark_wolf` | dark_creature | Fast lunge attacker; pack filler |
| `alpha_wolf` | dark_creature | Boss; CC resist, hard CC armour, custom boss AI |
| `enemy_ranged` (Slime) | dark_creature | Stays back, ranged harassment |
| `thornbinder` | dark_creature | Zone control; bramble AoE; Light Hate: weakens at bright light |
| `husk_artillery` | dark_creature | Summoner; spawns husklings; Light Hate: weakens at bright light |
| `huskling` | dark_creature | Ephemeral melee minion spawned by husk_artillery |
| `boar` | beast (natural) | Not a dark creature — a real animal; charges, has blood/corpse |

> The **boar** is listed here because it appears in dark-world missions, but it is a `beast`, not a dark creature. It has self-preservation and leaves a corpse.

---

## Code Map [Draft]

### Light & Darkness system
- `app/js/games/minion_battles/game/darknessLevels.ts` — `DarknessLevel` enum (FULL_DARKNESS, NEUTRAL_DARKNESS, BRIGHT_LIGHT)
- `app/js/games/minion_battles/game/lightHate.ts` — `LIGHT_HATE_DEFS`, `isLightHateWeakened()`, `getLightLevelAtWorldPx()`
- `app/js/games/minion_battles/game/LightGrid.ts` — per-tile light accumulation from sources

### Dark creature visuals
- `app/js/games/minion_battles/game/deathEffects/darkCreatureDissolutionDef.ts` — purple particle dissolution definition
- `app/js/games/minion_battles/game/deathEffects/darkCreatureVisualConstants.ts` — tint and palette constants

### Unit definitions
- `app/js/games/minion_battles/game/units/unit_defs/unitDef.ts` — all unit stat blocks and `creatureType` field; dark creature entries are `dark_wolf`, `alpha_wolf`, `enemy_ranged`, `thornbinder`, `husk_artillery`, `huskling`
- `app/js/games/minion_battles/constants/enemyConstants.ts` — enemy spawn def templates (abilities, team, AI settings) used by missions

### Unit-specific files (dark creatures)
- `app/js/games/minion_battles/game/units/dark_animals/` — unit-specific logic (e.g. `DarkWolf.ts`, `slimeRanged.ts`)

### AI trees
- `app/js/games/minion_battles/game/units/unitAI/default/` — standard aggro/wander/findLight used by most dark creatures
- `app/js/games/minion_battles/game/units/unitAI/aggroWander/` — used by boar
- `app/js/games/minion_battles/game/units/unitAI/alphaWolfBoss/` — custom boss AI (idle + attack states)

### Missions (World of Darkness storyline)
- `app/js/games/minion_battles/storylines/WorldOfDarkness/missions/` — all mission files
  - `001_dark_awakening.ts` — first wolf encounter
  - `002_towards_the_light.ts` — darkness-continuous spawn pressure; reach campfire objective
  - `003_light_empowered.ts` — boar hunt + mixed enemy types
  - `005_monster.ts` — Alpha Wolf boss fight; dark crystal arena
  - `007_ember_threshold.ts` — thornbinder appears; first lanternite mission
- `app/js/games/minion_battles/game/managers/LevelEventManager.ts` — processes mission wave events including darkness-based spawns

### Terrain & map segments
- `app/js/games/minion_battles/storylines/WorldOfDarkness/MapSegments/` — terrain segments used by dark-world missions; use the `map-segments` skill for stitching and coord conventions
