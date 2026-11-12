# Visibility and senses

> **Completion summary (2026-11-11).** Steps 1–8 are implemented, and Step 9's automated checks are green.
>
> **What's in place:**
> - Rock and Impassable block vision and light, through a shared tile-line tracer and per-engine light-occlusion masks.
> - Units carry data-driven senses: def baseline, instance `senseGrants`, buff grants, and the disabled Darkvision / Tremorsense Training nodes.
> - Team perception (seen / glimpsed / heard / felt / hidden) is derived for rendering only.
> - Enemies render translucent in darkness or when glimpsed, and invisible ones are hidden with gray hearing / tremorsense pulses.
> - Dark terrain in vision shows faintly, and spell circles hide with their caster.
> - Debug Console has a "Reveal all units" toggle.
>
> **Verification:**
> - `tsc` and lint are clean.
> - Full Vitest: 4453 passed. The only failure is `questBankUi`, plus an unhandled rAF error in `interactiveTargeting.test.ts`; both predate this plan.
> - All light / dark / swarm / visibility AbilityTests pass headlessly.
> - Most of the browser checklist was verified live (see Step 9).
>
> **Still unverified (needs a human, with the browser pane in front and an admin account):**
> - Pixel look of pulses and the hidden hit flash.
> - Tremorsense vs hearing, and Darkvision, via admin-granted nodes.
> - Hidden enemies' telegraphs and damage numbers; spell circles hiding with their caster.
> - Node visibility for non-admins in the research UI.
> - Frame time.
>
> **Follow-ups:**
> - ~~A single rock tile can hide a fully lit enemy at about 4.5 tiles.~~ **Done 2026-11-11:** vision, glimpse and wall-blocked senses use `isTileLineClearPermissive` (`terrain/tileLine.ts`): clear if the centre line or any segment between sample points in the two tiles (centre plus four inset corners) is clear. Darkness cost still follows the centre line; light occlusion keeps the strict line. Covered by `tileLine.test.ts` and a pillar case in `teamPerception.test.ts`.
> - Glimpse has no "outside vision range" precondition (Step 5 deviation).
> - AI still uses its own `perceptionRange`.
> - Campaign traits for Darkvision are not plumbed into battle (Decision 1).
> - Pre-existing failing scenarios `path_around_rock` / `exposed_duration_extension` and the `interactiveTargeting` rAF teardown leak are unrelated to this plan but worth fixing.

## Goal

Today, an enemy on a tile with light ≤ `FULL_DARKNESS` is drawn as a red circle (`UnitRenderer.ts:~300`). Nothing else limits what the player sees.

Replace this with a **multi-tier visibility system**. Each unit has **senses**, and a team perceives every enemy at the strongest tier any of its units reaches:

| Tier | How it detects | What the local player sees |
|---|---|---|
| **Seen** (vision) | Line of sight within 8 tiles (circular). Darkness eats into range. Walls block it. | The unit. An enemy on a dark tile is drawn translucent. |
| **Glimpsed** (vision) | Beyond vision range, but the enemy stands on a lit tile with a clear line of sight | The enemy, translucent (harder to see). |
| **Heard** (hearing) | Within 4 tiles, through walls. Player units have it by default. | Soft light-gray pulses at the unit's position. |
| **Felt** (tremorsense) | Like hearing, usually a longer range. Granted, not default. | Pulses like hearing but stronger: thicker lines, bigger radius, higher alpha. |
| **Hidden** | None of the above | The unit is not drawn. Targeting indicators, quest markers and damage numbers still are. |

Precedence when several senses detect a unit: **seen > glimpsed > heard > felt**.

"Invisible" below means heard, felt or hidden: the unit body is not drawn.

Other changes in scope:
- **Walls block light** the same way they block vision. The wall tile itself still receives light, so a wall's face is lit.
- **Visible dark terrain:** tiles inside the team's vision that are dark get a slightly lighter darkness overlay, so the terrain shows faintly.
- **Terrain outside vision range is unchanged:** lit terrain shows as it does today.
- **Darkvision** reduces the darkness penalty on vision.
- **Disabled research nodes:** Darkvision and Tremorsense, in the Training tree (beside Core Training).

### Design

Engine-first, following "Build the engine, not the feature" in `app/js/games/minion_battles/AGENTS.md`.

**1. Terrain occlusion is a terrain property.**
- `TerrainProperties` gains `blocksVision` and `blocksLight`. Both are true for Rock and Impassable, the same set `TerrainGrid.hasLineOfSight` treats as obstructing.
- Reads go through effective terrain (`TerrainManager.getEffectiveTerrainType`), so rock created at runtime blocks too and destroyed rock stops blocking.
- One line-trace helper serves vision, light and any future consumer. The helper ignores the start and end tiles, so the blocking wall itself is visible and lit.

**2. Senses are data.**
- `SenseProfile` is resolved per unit by one entry point, `getUnitSenses(unit)`:
  ```ts
  {
    vision?: { range; darknessPenetration; glimpseLit };
    darkvision?: number;
    hearing?: { range };
    tremorsense?: { range };
  }
  ```
- Profiles are built from `SenseGrant`s, which come from three sources:
  - `UnitDefEntry.senses`: the baseline. Content units get `DEFAULT_UNIT_SENSES`; players get `PLAYER_SENSES`.
  - `Unit.senseGrants`: instance grants, serialized. Research and abilities write these.
  - `Buff.senseGrants`: a def-pattern property for temporary senses.
- **Merge rules:**
  - Ranges take the max.
  - `darkvision` and `darknessPenetration` add.
  - `glimpseLit` is OR-ed.
- Named presets:
  - `DEFAULT_UNIT_SENSES`: vision 8 / penetration 2 / `glimpseLit: true`.
  - `PLAYER_SENSES`: the default plus hearing 4.
  - `DARKVISION_GRANT`: +3 tiles.
  - `TREMORSENSE_GRANT`: range 6.
- `SENSE_DEFS` registry: each sense's priority, whether walls block it, whether darkness affects it, and its indicator style id. A new sense later (echolocation, true sight) is a new entry, not new branches.

**3. The vision rule** (deterministic, tile-based):
- **Seen.** A target tile is in a viewer's vision when all of these hold:
  - It is within `vision.range` (Euclidean distance in tiles).
  - The tile line to it is not blocked by `blocksVision` (the endpoints are exempt).
  - The **darkness cost** summed along the line is ≤ `darknessPenetration + darkvision`. The sum starts at the first tile after the viewer and includes the target tile.
- Per-tile darkness cost:
  - 0 at light ≥ `MEDIUM_LIGHT_MIN` (4).
  - 1 at light ≤ `FULL_DARKNESS` (0).
  - Linear in between.
- So a viewer sees at most 2 fully dark tiles deep, and partial darkness costs partially.
- **Glimpsed.** An enemy is glimpsed when all of these hold:
  - It is outside every viewer's vision range.
  - Some viewer has `glimpseLit`.
  - The enemy's tile is lit (light > `FULL_DARKNESS`).
  - The line from that viewer to the enemy is clear of `blocksVision`.
- There is no range cap. The check is per enemy, not per tile, so it stays cheap.

**4. Team perception is derived, never serialized.**
- `getTeamPerception(engine, teamId)` returns:
  - the union of visible tiles across the team's living units (a `Uint8Array` mask);
  - a `Map<unitId, Detection>`, where `Detection = 'seen' | 'glimpsed' | 'heard' | 'felt' | 'hidden'`;
  - a `revision`.
- It is cached per engine and recomputed when `gameTick` or `terrainManager.navEpoch` changes.
- Friendly units are always `'seen'`. When the mission's light system is off, or the debug dark overlay is off, every unit is `'seen'` (today's gate).
- It is presentation-only: it never feeds the simulation, so it cannot desync. AI keeps its own `perceptionRange` for now.
- Helper `isDetectionVisible(d)` is true for `'seen'` and `'glimpsed'`: the unit body is drawn.

**5. Light occlusion is simulation.**
- `computeLightChannelGrid` accepts an optional occlusion cache. A source contributes to a tile only when the source's mask marks that tile.
- Masks are cached per engine on `LightingSystem`, never module-level, so concurrent simulations stay safe. They are keyed by `col,row,range` and cleared when `navEpoch` changes.
- Masks are a pure function of effective terrain, so this is deterministic in preview (ITS) and committed runs.

**6. One consumer entry point.**
- `UnitRenderer`, `EffectRenderer` (spell circles), `PreviewRenderer` (enemy ghost move paths) and `tutorials/tutorialUnits.ts` (`isUnitOnScreen`) all ask `getUnitDetection`.
- No renderer re-derives "is this enemy visible" from light any more.

**7. Effects that hide with their owner.**
- New `Effect` property `concealedWithOwner?: boolean`. When true, `EffectRenderer` skips the effect while its `ownerActorId` is invisible to the local team.
- `createSpellCircleEffect` sets it, so spell circles are its first user. Any other caster-attached aura can opt in.
- Serialize it if `Effect` serializes its other fields; omit it when false.

### Rendering rules

**Seen and glimpsed units**
- Friendly units are drawn exactly as today, at full opacity, so player units stay easy to see in darkness.
- Enemies:
  - **Seen, on a dark tile:** container alpha from `enemyDarknessAlpha(lightLevel)`: 1 when lit, down to `ENEMY_DARK_MIN_ALPHA = 0.45` in full darkness, following the same curve as `darknessVisionCost`.
  - **Glimpsed:** alpha `GLIMPSED_ENEMY_ALPHA = 0.45`.
  - Both constants live in one small render-rules module beside the helper.

**Heard and felt units**
- The unit container, knockback shadow and hover-flight juice are hidden.
- A new `SenseIndicatorRenderer` draws expanding ring pulses at the unit's position on **wall time** (`performance.now()`), so the pulses keep playing while the game is paused.
- Each unit's pulse phase is offset by a hash of its id, so groups don't pulse in sync.
- Styles are data (`senseIndicatorStyles.ts`):

| Style | Colour | Alpha | Rings | Period | Max radius | Line width |
|---|---|---|---|---|---|---|
| `hearing` | `0xd4d4d8` | 0.35 | 2 | 1.6 s | 1.6 × unit radius | 1.5 |
| `tremorsense` | `0xe5e5e5` | 0.5 | 3 | 1.3 s | 2.0 × unit radius | 2.5 |

**Hidden units**
- Same hiding as heard and felt units, but no pulses.
- **Still render:**
  - active telegraphs (`renderActiveAbilityPreviews`, existing lit-clipping unchanged);
  - projectile previews;
  - enemy ghost **ability** previews. These are currently skipped in darkness; that skip goes.
  - damage numbers;
  - quest and objective markers (`ui/components/ObjectiveMarkerOverlay.tsx`). They read engine positions, so verify, don't change.
- **Don't render:**
  - enemy ghost **move paths** (shown only for seen or glimpsed units; a path would reveal the unit);
  - spell circles (via `concealedWithOwner`).

**Hit flash on invisible enemies** (heard, felt or hidden)
- When one takes damage, draw a **red circle flash** (`HIT_FLASH_COLOR`, the unit's radius) at its position. It fades out on wall time over the same duration as the normal hit flash, so the player sees that their attack connected.
- `UnitRenderer.onDamageTaken` routes on `getUnitDetection`: visible units keep today's sprite flash; invisible ones get the standalone flash on a graphics layer outside the hidden unit container.

**Overlay** (`OverlayRenderer.updateDarknessOverlay`)
- Per-tile alpha stays `lightLevelToAlpha(level)`.
- For tiles in the team's visible mask, alpha is capped at `VISIBLE_DARK_TILE_MAX_ALPHA = 0.85`, so dark terrain in vision shows faintly.
- Every other tile looks as today: lit terrain outside vision range still appears, and dark terrain outside vision stays dark.
- The texture is rebuilt when the tick **or** `perception.revision` changes.

### Key files (minion_battles-relative)

| Area | File |
|---|---|
| Occlusion flags | `terrain/TerrainType.ts`, `terrain/TerrainManager.ts` |
| Line trace | new `terrain/tileLine.ts` (+ test). Reuse or align with `terrain/playerMovePath.ts` `bresenhamGridLine` and `TerrainGrid.hasLineOfSight` |
| Light occlusion | `game/LightGrid.ts`, new `game/lighting/lightOcclusion.ts` (+ test), `game/lighting/LightingSystem.ts` |
| Senses model | new `game/visibility/senses.ts` (+ test), `game/units/unit_defs/unitDef.ts` (`UnitDefEntry.senses`), `game/units/Unit.ts`, `game/units/unitToJSON.ts`, `game/units/unitFromJSON.ts`, `buffs/Buff.ts` |
| Research | `../../researchTrees/types.ts`, `../../researchTrees/evaluator.ts`, `../../researchTrees/trees/training.ts`, `storylines/BaseMissionDef.ts` (beside `applyMissionStartResourcesFromResearch`) |
| Perception | new `game/visibility/teamPerception.ts` (+ test), new `game/visibility/AGENTS.md` |
| Rendering | `game/GameRenderer/renderers/UnitRenderer.ts`, `game/GameRenderer/renderers/OverlayRenderer.ts`, `game/GameRenderer/renderers/EffectRenderer.ts`, new `game/GameRenderer/renderers/SenseIndicatorRenderer.ts`, new `game/GameRenderer/senseIndicatorStyles.ts`, new `game/GameRenderer/renderers/visibilityRenderRules.ts`, `game/GameRenderer/GameRenderer.ts` |
| Effects | `game/effects/Effect.ts`, `game/spellCircles/spellCircles.ts` |
| Other consumers | `game/GameRenderer/renderers/PreviewRenderer.ts` (`enemyUnitHiddenInFullDarkness`), `tutorials/tutorialUnits.ts` (`isUnitOnScreen`) |
| Debug | `../../contexts/DebugSettingsContext.tsx`, `../../debug/debugSettingsStore.ts`, `../../components/DebugConsole/tabs/DebugTogglesTab.tsx` |
| Scenarios | `testing/scenarios/general/visibility.ts` (new), `testing/scenarios/general/lightingSystem.ts`, `testing/scenarios/registry.ts` |

## Agent Instructions

This plan is executed by `/jp-implement-plan`. The **invoking agent is the sole orchestrator**. It spawns one worker per step **synchronously** (never in the background), waits for each to finish, then reports completion to the user. Each worker implements exactly one step, checks its items off with a one-line summary, and **stops without spawning the next agent**. Follow `.claude/skills/jp-implement-plan/SKILL.md`.

- Branch: `master`. **Do not commit.** The tree has unrelated dirty files (Command Core / thorns work, `researchTrees/*`); leave their changes alone, and edit around them when a step touches the same file.
- Read "Build the engine, not the feature" in `app/js/games/minion_battles/AGENTS.md`.
  - Senses, styles, render alphas and occlusion are data and registries.
  - No `if (characterId === 'player')` in perception code. Players differ only through `PLAYER_SENSES` on their unit def.
  - The friendly / enemy split in rendering uses `areEnemies(localTeamId, unit.teamId)`.
- **Determinism:**
  - Light occlusion is simulation state: pure, engine-scoped caches, no module-level state.
  - Perception is presentation-only and must not be read by simulation code.
  - New `Unit.senseGrants` round-trips `toJSON` / `fromJSON`. Omit it when empty so old checkpoints load unchanged.
- **Performance:** wrap `getTeamPerception` recomputation and light-mask building in `tickPerformanceTracker` (see the **performance-debugging** skill).
- **Verification per step:** `npm run lint`, plus `npx tsc --noEmit` when the step crosses an interface. Run only the test files named in the step (`npx vitest run <files>`). The full suite, AbilityTests and the browser check run once, in Step 9.
- Relevant skills:
  - **working-on-minion-battles**
  - **game-object-def-pattern** (`UnitDefEntry.senses`, `Buff.senseGrants`)
  - **game-engine** (LightingSystem / caches)
  - **research-trees** (`grantSense` effect, Training nodes)
  - `.claude/skills/narrative/writing-style-abilities/STYLE.md` (node descriptions)
  - **ability-tests** (Step 8)
  - **scoped-testing**
  - **writing-nested-agents-files** (`game/visibility/AGENTS.md`)
  - **debug-console** (Step 7 toggle)

## Steps

### Step 1: Terrain occlusion flags and line trace

- [x] Add `blocksVision` and `blocksLight` to `TerrainProperties` (`terrain/TerrainType.ts`). True for Rock and Impassable, false otherwise. Document both beside `blocksProjectiles`.
  - Done: both flags added and documented after `blocksProjectiles`; set on all 9 terrain types (true only for Rock and Impassable).
- [x] Add `TerrainManager.blocksVisionAt(col, row)` and `blocksLightAt(col, row)`, reading effective terrain.
  - Done: both read `getEffectiveTerrainType` and return true out of bounds; covered by a new test in `terrain/TerrainManager.rock.test.ts` (rock blocks, OOB blocks, destroyed rock stops blocking).
  - Out-of-bounds counts as blocking.
- [x] New `terrain/tileLine.ts`:
  - Done: `forEachTileOnLine` (returns `true` if it reached the end) and `isTileLineClear`, using integer round-half-up DDA (same rule as the old `hasLineOfSight`, exactly symmetric). `TerrainGrid.hasLineOfSight` now traces with `forEachTileOnLine` and checks `TERRAIN_PROPERTIES[...].blocksVision` (still bedrock-only, endpoints still checked); its existing tests and `drowning.test.ts` pass unchanged. Note: diagonal lines can slip between two tiles that touch only at a corner (documented in the file header).
  - `forEachTileOnLine(c0, r0, c1, r1, visit)`: integer line, start to end inclusive; `visit` may return `false` to stop.
  - `isTileLineClear(c0, r0, c1, r1, blocks)`: ignores both endpoints.
  - Point `TerrainGrid.hasLineOfSight` at the shared tracer only if its existing tests still pass unchanged. Otherwise leave it alone.
- [x] `terrain/tileLine.test.ts`:
  - Done: 10 tests covering all five listed cases plus single-tile lines, early stop, and both-direction `isTileLineClear` agreement over a grid.
  - clear line;
  - wall in the middle blocks;
  - a wall endpoint does not block;
  - diagonal past a corner;
  - line is symmetric in both directions.

### Step 2: Walls block light

- [x] New `game/lighting/lightOcclusion.ts`:
  - Done: `LightOcclusionCache(width, height, blocksLight)` with `getMask` (rounded-Euclidean range, `isTileLineClear`, source coords rounded, keyed `col,row,range`, cache dropped past 512 masks so moving lanterns can't grow it unbounded) and `invalidate()`; mask builds measured under new verbose perf key `PERF_LIGHT_OCCLUSION`.
  - `LightOcclusionCache(width, height, blocksLight)` with `getMask(col, row, range): Uint8Array` (row-major, 1 = lit-reachable), built with `isTileLineClear`.
  - `invalidate()`.
  - Doc comment: a blocking tile is itself reachable (wall faces get lit); tiles behind it are not.
- [x] `computeLightChannelGrid` (`game/LightGrid.ts`) takes an optional `occlusion?: LightOcclusionCache`. When present, skip a source's contribution to a tile whose mask byte is 0. Applies to positive and void sources alike.
  - Done: masks fetched once per source before the tile loop; zero mask byte skips positive and void contributions. `computeLightGrid` / `getLightGrid` forward the optional arg. Only other caller is `game/lightHate.ts` (gameplay: Thornbinder/ThornStomp weakening) — now occluded via optional `engine.getLightOcclusion?.()` (new `GameEngine.getLightOcclusion()` delegate). No map-tool callers exist.
  - Callers that pass nothing behave exactly as today.
  - Grep other callers of `computeLightGrid` / `getLightGrid` and decide per caller. Map tools may stay unoccluded; anything gameplay-facing should get occlusion.
- [x] `LightingSystem` owns one engine-scoped `LightOcclusionCache`, built lazily from `terrainManager.blocksLightAt`. It is recreated on grid size change and invalidated when `terrainManager.navEpoch` differs from the cached epoch. Pass it in `initLightGrid` and `runLightGameTick`.
  - Done: `LightingSystem.getLightOcclusion()` builds lazily from `terrainManager.blocksLightAt`, recreates on terrain manager / grid identity or size change, invalidates on `navEpoch` change; used by both `initLightGrid` and `runLightGameTick`.
- [x] Tests in `game/LightGrid.test.ts` and `game/lighting/lightOcclusion.test.ts`:
  - Done: LightGrid — far side at global light, wall tile lit, void occluded too, all-open occlusion equals no-arg output (existing no-arg tests unchanged). lightOcclusion — mask/wall face/range, cache reuse + invalidate, and a `LightingSystem` test over a real `TerrainManager` where `destroyRock` bumps `navEpoch` and light then reaches through.
  - a source behind a 1-tile wall line leaves the far side at global light;
  - the wall tile itself is lit;
  - no occlusion arg gives identical output to today;
  - after a rock is destroyed (epoch bump) the light reaches through.
- [x] Add a "Walls block light" line to the terrain section of `terrain/AGENTS.md`. Note the gameplay reach: corruption, daylight damage and darkness spawns all read the light grid, so walls now cast shadows for them too.
  - Done: paragraph added to `terrain/AGENTS.md` (beside the rock/water notes), naming corruption, daylight damage, darkness spawns and Light Hate.

### Step 3: Sense model on units

- [x] New `game/visibility/senses.ts`:
  - Done: types (+ `Detection` and `SenseIndicatorStyleId`, for Steps 5/6), `SENSE_DEFS` (each entry also names its `detection` tier; `SENSE_IDS_BY_PRIORITY` derived, vision 30 > hearing 20 > tremorsense 10), frozen presets, `mergeSenseGrants` (never mutates base), `getUnitSenses`, `getDarknessPenetration(profile)` (penetration + darkvision), `darknessVisionCost`, `parseSenseGrantsFromJSON`. `SenseGrant` discriminates on `kind` (`{kind:'darkvision', amount}`, `{kind:'tremorsense'|'hearing', range}`, `{kind:'vision', range?, darknessPenetration?, glimpseLit?}`). Only runtime import is `darknessLevels.ts`, so research can import presets as plain data. `getUnitSenses` takes a structural `SensingUnit` and reads `unit.baseSenses` (no runtime import of unitDef, avoiding a unitDef↔senses cycle).
  - types `SenseId` (`'vision' | 'hearing' | 'tremorsense'`), `SenseProfile`, `SenseGrant` (discriminated union: `vision`, `darkvision`, `hearing`, `tremorsense`);
  - `SENSE_DEFS` registry: `priority`, `blockedByWalls`, `affectedByDarkness`, `indicatorStyle`;
  - presets: `DEFAULT_UNIT_SENSES`, `PLAYER_SENSES`, `DARKVISION_GRANT`, `TREMORSENSE_GRANT`;
  - `mergeSenseGrants(base, grants)`: max for ranges, additive for penetration and darkvision, OR for `glimpseLit`;
  - `getUnitSenses(unit)`: def baseline + `unit.senseGrants` + each buff's `senseGrants`;
  - `darknessVisionCost(lightLevel)`: 0 at ≥ `MEDIUM_LIGHT_MIN`, 1 at ≤ `FULL_DARKNESS`, linear between.
- [x] `UnitDefEntry.senses?: SenseProfile` (`unitDef.ts`). The player def uses `PLAYER_SENSES`; everything else defaults to `DEFAULT_UNIT_SENSES` through the getter. Follow **game-object-def-pattern**.
  - Done: field + `senses: PLAYER_SENSES` on `player`; accessor `getUnitSensesDef(characterId)`; def-sourced getter `Unit.baseSenses` (no backing field, not serialized).
- [x] `Unit.senseGrants: SenseGrant[]`, serialized in `unitToJSON` / `unitFromJSON` (omitted when empty), with an `addSenseGrant(grant)` helper.
  - Done: `addSenseGrant` stores a copy (frozen presets are safe to pass). `unitFromJSON` uses `parseSenseGrantsFromJSON` (drops malformed entries). Golden snapshot in `game/units/Unit.test.ts` now carries a tremorsense grant (inline snapshot updated).
- [x] `Buff.senseGrants?: readonly SenseGrant[]` property on the base class (def pattern, default none).
  - Done: type-only import in `buffs/Buff.ts`; not serialized (subclasses set it).
- [x] `game/visibility/senses.test.ts`:
  - Done: 17 tests (presets, SENSE_DEFS order, merge max/add/OR, no base mutation, instance + buff sources, JSON round-trip, omit-when-empty, malformed parse, cost endpoints and midpoints). Verified: lint baseline (0 errors, 1 known warning), `tsc --noEmit` clean, and senses/Unit/engineSerialization/serializedGameStateUpgrade/unitDefRegistry/buffs tests green.
  - presets resolve;
  - merge rules;
  - a buff grant appears and disappears with the buff;
  - `senseGrants` round-trips through JSON;
  - the cost curve endpoints.

### Step 4: Granting senses (research effect and Training nodes)

- [x] Add a `ResearchEffect` variant `{ type: 'grantSense'; grant: SenseGrant }` (`researchTrees/types.ts`). Import the type only, so the research tree stays free of engine runtime imports.
  - Done: variant added with a type-only `SenseGrant` import from `game/visibility/senses`.
- [x] `getSenseGrantsFromResearch(researchTrees)` in `researchTrees/evaluator.ts`, in the same deterministic node order as `getMissionStartResourcesFromResearch`.
  - Done: same loop as `getMissionStartResourcesFromResearch` (RESEARCH_TREES order, `sortNodesDeterministic`); returns copies of each grant.
- [x] In `storylines/BaseMissionDef.ts`, apply the grants to each player unit at mission start, beside `applyMissionStartResourcesFromResearch`.
  - Done: new `applySenseGrantsFromResearch(unit, research)` (calls `unit.addSenseGrant` per grant), called right after `applyMissionStartResourcesFromResearch`. Note: the tiny-battle harness `spawnTinyPlayerUnit` does not go through this path, so tests use `DARK_AWAKENING.initializeGameState`.
- [x] In `researchTrees/trees/training.ts`, add two nodes modelled on `playtest_vitality` (`disabled: true`, so only admins see and grant them):
  - Done: `darkvision` (order 910, pos 20,60) and `tremorsense` (order 920, pos 20,200), left of Core Training, `cost: {}`, no requirements, descriptions read their numbers from the presets. Presets imported directly (senses.ts runtime-imports only `darknessLevels.ts`, which has no imports); to read `.amount` / `.range` the two preset constants in `senses.ts` are now typed as their narrowed `Extract<SenseGrant, …>` variants (still assignable to `SenseGrant`).
  - `TRAINING_NODE_DARKVISION` = `'darkvision'`, title "Darkvision", effect `{ type: 'grantSense', grant: DARKVISION_GRANT }`;
  - `TRAINING_NODE_TREMORSENSE` = `'tremorsense'`, title "Tremorsense", effect `{ type: 'grantSense', grant: TREMORSENSE_GRANT }`.
  - Both have `prereqNodeIds: [TRAINING_NODE_CORE]`, positions next to Core Training that don't overlap existing nodes, and descriptions and flavour text per the abilities style guide (e.g. "See {3} tiles farther into darkness." / "Sense enemies within {6} tiles through walls, even unseen.").
  - Import the grant presets as plain data. If that drags engine runtime into the research tree, duplicate the literal grants and add a test that they equal the presets.
- [x] Wire the research node preview (`research/researchNodePreview.ts`) to describe a `grantSense` effect, e.g. "Grants Darkvision" or "Grants Tremorsense (6 tiles)", if the preview lists effects generically. Otherwise note it as a follow-up.
  - Done: the preview diffs stat sheets, so the sheet now carries the player's resolved senses (`mergeSenseGrants(getUnitSensesDef(player), getSenseGrantsFromResearch(...))`) and a data table `SENSE_PREVIEW_ROWS` (vision, darkvision, hearing, tremorsense) emits text rows like "Darkvision +0 tiles → +3 tiles" / "Tremorsense none → 6 tiles". A new sense is a new row.
- [x] Tests (evaluator's existing test file, or a new co-located one):
  - Done: new `researchTrees/senseGrantsResearch.test.ts` (empty, each node, node order + copies, disabled/prereq/admin-visible, no position overlap); mission-start application test in `research/passiveSpawnEffects.test.ts` (p1 gets both grants, p2 none, darkness penetration 2+3); sense-row test in `research/researchNodePreview.test.ts`. Verified: lint (0 errors, 1 known warning), `tsc --noEmit` clean, the 41 test files importing the training tree / evaluator / preview all green. `vitest related` fails on the same unrelated parse error as `--changed`, so those files were run explicitly instead.
  - no nodes gives `[]`;
  - researching `darkvision` gives the darkvision grant, and `tremorsense` gives the tremorsense grant;
  - both nodes are `isDisabledResearchNode`.
  - Also run any existing training- or research-tree layout tests (`npx vitest related researchTrees/trees/training.ts --run`).

### Step 5: Team perception

- [x] New `game/visibility/teamPerception.ts`:
  - Done: `computeTeamPerception` / `getTeamPerception` / `getUnitDetection` / `isDetectionVisible` over a structural `PerceptionEngine` (`GameEngine` satisfies it; compile-time check in the test). Viewers are living units allied to `teamId` (`areAllies`, so `allied` units pool vision with players). Per-sense detectors keyed by `SenseId` (`vision` = mask + glimpse, hearing/tremorsense share `rangedDetector`), tried in `SENSE_IDS_BY_PRIORITY`; wall/darkness rules read from `SENSE_DEFS`. Cache is a `WeakMap<engine, …>` also keyed on light toggle, terrain manager and unit-list identity/length (covers checkpoint restores at the same tick); measured under new `PERF_TEAM_PERCEPTION`. A unit missing from `engine.units` (e.g. a preview ghost) is detected against the cached viewers. Added `DebugSettingsSnapshot.revealAllUnits` (default false; Step 7 builds the toggle UI). Deviation: glimpse follows this step's wording (lit + clear line from a `glimpseLit` viewer), with no "outside every viewer's range" precondition, so a lit enemy across a dark gap inside 8 tiles is glimpsed rather than hidden.
  - `computeTeamPerception(engine, teamId): TeamPerception`, a pure function of state:
    - **Vision:** for each living team unit, each tile within its vision range, `isTileLineClear` with `blocksVisionAt`, and accumulate `darknessVisionCost(engine.getLightAt(...))` along the line against `darknessPenetration + darkvision`. Union into `visibleTiles`.
    - **Per enemy:**
      - `'seen'` if its tile is in `visibleTiles`;
      - else `'glimpsed'` if its tile is lit (> `FULL_DARKNESS`) and some team unit with `glimpseLit` has a clear `blocksVision` line to it;
      - else `'heard'` if any team unit's hearing range ≥ tile distance;
      - else `'felt'` for tremorsense;
      - else `'hidden'`.
    - Priority order and wall rules come from `SENSE_DEFS`, not hard-coded branches.
    - Non-enemies are always `'seen'`.
    - Light system off (`!engine.state.lightLevelEnabled`) → everything `'seen'`, mask all-visible.
  - `getTeamPerception(engine, teamId)`: per-engine cache (a `WeakMap<GameEngine, …>` or a field on the engine). Recomputes when `gameTick`, `navEpoch` or `teamId` changes, and bumps `revision`. Measured with `tickPerformanceTracker`.
  - `getUnitDetection(engine, teamId, unit)`: the single consumer entry point. It also honours the debug "dark overlay off" setting and the Step 7 "Reveal all units" toggle. Read the debug snapshot here, not in the pure compute.
  - `isDetectionVisible(detection)`: true for `'seen'` and `'glimpsed'`.
- [x] `game/visibility/teamPerception.test.ts`, one tiny grid with walls and a dark region:
  - Done: 18 tests on a 24 × 11 grid with a fake engine over a real `TerrainManager`: all 12 listed cases, plus allies/neutral always seen and vision pooled across allies, dead viewers ignored, cache revision per tick, recompute after `destroyRock`, off-list ghost units, and the debug bypasses.
  - lit enemy at 5 tiles → seen;
  - lit enemy 10 tiles away with a clear line → glimpsed;
  - the same enemy behind a wall → not glimpsed;
  - a dark enemy 10 tiles away → hidden;
  - enemy 2 tiles into full darkness → seen;
  - 3 tiles into full darkness → not seen;
  - enemy behind a wall at 3 tiles → heard;
  - darkvision grant → the 3-deep enemy is now seen;
  - tremorsense 6 with no hearing → felt at 5 tiles behind a wall;
  - hearing beats tremorsense at 3 tiles;
  - wall tile adjacent to the viewer is in `visibleTiles`;
  - light system disabled → all seen.
- [x] New `game/visibility/AGENTS.md` (follow **writing-nested-agents-files**):
  - Done: file table, tiers, vision/glimpse rules, grant sources, presentation-only rule, adding a sense; referenced from `game/AGENTS.md` and the folder table in `minion_battles/AGENTS.md`. Verified: lint (0 errors, 1 known warning), `tsc --noEmit` clean, visibility + `tickPerformanceTracker` tests green.
  - the tiers;
  - the vision and glimpse rules;
  - the grant sources (def, instance, buff, research);
  - "presentation-only: never read from simulation";
  - how to add a sense.

### Step 6: Rendering (units, overlay, pulses, effects)

- [x] New `game/GameRenderer/renderers/visibilityRenderRules.ts` (+ test):
  - Done: the three constants, `enemyDarknessAlpha` (same curve as `darknessVisionCost`; `null` light = 1), `enemyUnitAlpha` (seen → darkness alpha, glimpsed → 0.45, invisible tiers → 0), plus `darknessOverlayTileAlpha` and `isEffectConcealed` so the overlay and effect rules are pure too.
  - `ENEMY_DARK_MIN_ALPHA`, `GLIMPSED_ENEMY_ALPHA`, `VISIBLE_DARK_TILE_MAX_ALPHA`;
  - pure `enemyUnitAlpha(detection, lightLevel)`.
- [x] `UnitRenderer.renderUnits`: replace the `inFullDarkness` red-circle branch with `getUnitDetection`.
  - Done: invisible units hide container, knockback shadow and hover juice and `continue`; visible enemies get `fadeAlpha × enemyUnitAlpha` (container alpha is now set every frame), friendlies 1. Red-circle code, the buff-effects guard and the `debugSettingsSnapshot` / `DarknessLevel` imports are gone. Darkness alpha is gated on a new `isPerceptionActive(engine)` export in `teamPerception.ts` (light on and no debug bypass), because `'seen'` alone can't distinguish "perception off".
  - **Visible** (`isDetectionVisible`): today's normal path.
    - Enemies get `enemyUnitAlpha`, multiplied with any fade-in alpha.
    - Friendlies stay at full alpha.
  - **Invisible:** `visual.visible = false`, and hide the knockback shadow and hover-flight juice.
  - Remove the dead red-circle code and the `!inFullDarkness` buff-effects guard.
- [x] `UnitRenderer.onDamageTaken`: for invisible units, start a standalone red-circle flash (`HIT_FLASH_COLOR`, unit radius) at the unit's position. It fades on wall time over the normal hit-flash duration and is drawn on a graphics layer outside the unit container, above the darkness overlay. Visible units keep today's flash.
  - Done: routes on `getUnitDetection` (local team cached from `render`); invisible units get a per-unit standalone `Graphics` (`Z_UNITS + 0.2`, in `gameContainer`) that follows the unit while it fades; `startHitFlash` now takes the target graphics and the flash state remembers it (switching modes hides the old one). Standalone flashes are cleaned up with their unit and in `destroy`.
- [x] `OverlayRenderer`:
  - cap alpha at `VISIBLE_DARK_TILE_MAX_ALPHA` for tiles in the local team's `visibleTiles` (needs `localTeamId`; pass it through `render` from `GameRenderer`);
  - leave every other tile as today;
  - rebuild the texture when the tick or `perception.revision` changes.
  - Keep the fog filter threshold behaviour.
  - Done: `render(engine, realDt, localTeamId = 'player')` (GameRenderer passes `localTeamId`); per-tile alpha goes through `darknessOverlayTileAlpha` with the team's `visibleTiles` (ignored if its size differs from the grid); texture rebuilds on tick or `perception.revision` change (`reset` clears it). Fog threshold untouched (0.53 at `DARKNESS_FOG`, below the 0.85 cap, so fog still shows on lifted tiles).
- [x] New `game/GameRenderer/senseIndicatorStyles.ts`: a `PulseStyle` record keyed by indicator style id (`hearing`, `tremorsense`), with the values from the Rendering rules table, plus a pure `pulseRings(style, wallTimeSec, phaseOffset)` returning ring radii and alphas.
  - Done: `PULSE_STYLES` (table values plus `startRadiusShare: 0.25`), `pulseRings` (radius in unit radii, alpha fades to 0 over a period), `pulsePhaseOffset(unitId)` (FNV hash → [0,1)) and `indicatorStyleForDetection` (reads `SENSE_DEFS[*].indicatorStyle` by detection tier, so no per-sense branches).
- [x] New `SenseIndicatorRenderer`:
  - one `Graphics` layer above the darkness overlay and below units;
  - every frame, draws pulses for each `'heard'` / `'felt'` unit from `performance.now()`;
  - `setLayerVisible` / `destroy` like its siblings.
  - Register it in `GameRenderer` (measure under `PERF_UI_CANVAS_UNITS` or a new perf key).
  - Done: one `Graphics` at z 8 (above overlay 5 / daylight pulse 6, below shadows 9 and units 10); draws rings for active living units whose detection maps to a style. Registered in `GameRenderer`, rendered right after units inside the `PERF_UI_CANVAS_UNITS` measure, follows the units layer toggle, destroyed with the renderer.
- [x] `Effect.concealedWithOwner` (serialized like sibling optional fields, omitted when false). `createSpellCircleEffect` sets it to true. `EffectRenderer.render` takes an `isActorVisible(actorId)` callback from `GameRenderer` (via `getUnitDetection` for the local team) and skips concealed effects whose owner is invisible.
  - Done: effects are not serialized at all (no `toJSON`), so it is a constructor option set only when true. `createSpellCircleEffect` sets it. `EffectRenderer.render(effects, getUnitPosition?, isActorVisible?)` hides (not destroys) concealed visuals and drops concealed particles; `GameRenderer` passes `(id) => !unit || isDetectionVisible(getUnitDetection(engine, localTeamId, unit))`.
- [x] Tests:
  - `visibilityRenderRules.test.ts`;
  - `senseIndicatorStyles.test.ts`: rings expand and fade over a period, tremorsense radius and width exceed hearing, phase offset shifts rings;
  - `game/spellCircles/spellCircles.test.ts`: a spell circle effect is `concealedWithOwner`.
  - Done: `visibilityRenderRules.test.ts` (9), `senseIndicatorStyles.test.ts` (8, incl. every `SENSE_DEFS` indicator has a style), spell circle assertion, and an `Effect.test.ts` case (undefined unless true). Also added a Rendering section to `game/visibility/AGENTS.md`. Verified: lint (0 errors, 1 known warning), `tsc --noEmit` clean, and all of `game/GameRenderer/renderers/*.test.ts`, `senseIndicatorStyles.test.ts`, `spellCircles.test.ts`, `game/effects/*.test.ts`, `game/visibility/*.test.ts` green (20 files, 132 tests). Pixi drawing itself is unverified until the Step 9 browser check.

### Step 7: Other consumers and debug toggle

- [x] `PreviewRenderer`:
  - Done: `enemyUnitHiddenInFullDarkness` replaced by `isUnitPerceived` (`isDetectionVisible(getUnitDetection(engine, localTeamId, unit))`), used only for enemy ghost move paths (both the live-path loop and pending-order paths); the skip before enemy ghost ability previews is gone. `overlayRenderer` and `isWorldPointLit` stay for telegraph / projectile lit-clipping (unchanged).
  - replace `enemyUnitHiddenInFullDarkness` with `!isDetectionVisible(getUnitDetection(...))` for enemy ghost **move paths** only;
  - stop skipping enemy ghost **ability** previews for invisible units (targeting indicators always render);
  - leave the lit-clipping of active telegraphs as is.
- [x] `tutorials/tutorialUnits.ts` `isUnitOnScreen`: an enemy counts as visible only when `isDetectionVisible`. Update its doc comment.
  - Done: enemies now use `isDetectionVisible(getUnitDetection(engine, localTeamId, unit))`; doc comment updated; `DarknessLevel` / `CELL_SIZE` imports dropped. Side effect: it now also honours the debug bypasses (dark overlay off / reveal all) like the renderer.
- [x] Debug toggle **"Reveal all units"** (Debug Console → Toggles), stored in `debugSettingsSnapshot` and read only by `getUnitDetection`. Darkvision and tremorsense are tested manually by admin-granting the disabled Training nodes.
  - Done: `revealAllUnits` / `setRevealAllUnits` in `DebugSettingsContext` (state + effect syncing `debugSettingsSnapshot.revealAllUnits`); an On/Off row "Reveal all units" under Render Visibility in `DebugTogglesTab`, beside the Darkness layer toggle. Only `teamPerception.ts` reads the snapshot flag (via `isPerceptionBypassed`, which also drives `isPerceptionActive`). Not persisted, like the Darkness layer toggle.
- [x] Grep for remaining `FULL_DARKNESS` visibility checks in renderers and UI (not simulation: `spawnUnit`, `unitDamage` and corruption keep theirs) and route them through `getUnitDetection`.
  - Done: none left in renderers or UI. Remaining hits are light rendering, not unit visibility: `OverlayRenderer` (overlay alpha curve, dominant-light tint), `PreviewRenderer.isWorldPointLit` (telegraph lit-clipping, kept by design), `PlayerInteractionManager` (debug mouse tooltip light level). Stale "enemies hidden" comment on `DarknessLevel.FULL_DARKNESS` reworded.
- [x] Run the tests co-located with touched files, e.g. `tutorials/*.test.ts` if they cover `isUnitOnScreen`.
  - Done: no test covers `isUnitOnScreen`, `PreviewRenderer` or the debug context/tab (none exist). Ran `tutorials/`, `game/visibility/`, `game/GameRenderer/` tests: 11 files, 82 tests green. Lint 0 errors (1 known warning), `tsc --noEmit` clean. Toggle and ghost-preview behaviour need the Step 9 browser check.

### Step 8: AbilityTests

- [x] New `testing/scenarios/general/visibility.ts` with **one** scenario, `visibility_senses_tiers` (`generalSection: 'Visibility'`, slug added to `GENERAL_GROUP_ORDER`):
  - Done: 16 × 10 grid, global light 0, lantern (5 / r3) two tiles above the player with a rock pillar beside it, rock wall line (row 4, cols 0–6) right below the player, far patch light (3 / r1) at col 13. "Seen 1 tile into dark" stands in the pillar's light shadow (light 0) with one lit tile between it and the player (cost 1). The six dummies are a data table of expected detections; `assertPass` compares `computeTeamPerception(engine, 'player')` to it and checks the wall tile below the player is in `visibleTiles`; `describeState` lists each detection with its light level. Exported as `VISIBILITY_SCENARIOS`, registered, and `visibility` slug added to `GENERAL_GROUP_ORDER`.
  - **Map:** a small grid (about 16 × 10) with a rock wall segment and a fully dark region (global light 0). It has one light source near the player and one lit patch far from the player.
  - **Units:**
    - player with `PLAYER_SENSES` + a `TREMORSENSE_GRANT` instance grant;
    - enemy dummies placed to be seen (lit), seen (1 tile into dark), glimpsed (far lit patch, clear line, 10+ tiles), heard (behind wall, 3 tiles), felt (dark, 5 tiles, behind wall) and hidden (dark, 10+ tiles).
  - **Order:** the player gets a `wait` order to keep the runner alive.
  - **`assertPass`:** checks `computeTeamPerception` detections for all six, and that the wall tile next to the player is in `visibleTiles`.
- [x] Add `light_blocked_by_walls` to `testing/scenarios/general/lightingSystem.ts`: a light source beside a rock line. The tile behind the wall stays at global light, and the wall tile is lit. Register it.
  - Done: 12 × 8 grid, light (5 / r2) at (3,4), full-height rock column at col 5; asserts wall tile light > 0 and (7,4) == global 0 (unoccluded it would be 3). Probed: wall 5, behind 0. Registered after `lightingBaseOverlapScenario`.
- [x] Run only `npx vitest run testing/runner/SimulationRunner.test.ts`, or the file that headlessly runs the registry, filtered to the two new ids if the runner supports it. Full AbilityTest runs wait for Step 9.
  - Done: added two `runScenarioHeadless` cases to `testing/runner/SimulationRunner.test.ts`; `-t "walls scenario|senses tiers"` → 2 passed. Lint 0 errors (1 known warning), `tsc --noEmit` clean. Step 9 runs them with the other lighting/darkness/swarmling scenarios via `-t` on that file.

### Step 9: Final verification

- [x] `npx tsc --noEmit` and `npm run lint` clean.
  - Done: `tsc --noEmit` exit 0; lint 0 errors, 1 known warning (`unlock.questBanks.test.ts` unused `WOD_CH2_MAP_X_COL3`).
- [x] Full Vitest suite (`npm run test`). Pay attention to light and corruption, daylight, darkness-spawn and checkpoint snapshot tests that may shift now that walls block light. Fix real regressions; update snapshots only where the change is the intended occlusion.
  - Done: 543 / 544 files, 4453 tests passed, 2 skipped, no snapshot changes needed. The parse error that breaks `--changed` / `related` did not trip the full run. Only failure: `questBankUi.test.ts` (known, unrelated). One unhandled error, `requestAnimationFrame is not defined` from `interactiveTargeting.test.ts` (a stubbed rAF timer fires after `afterAll` unstubs it). It reproduces at clean `HEAD` in a temporary worktree (since removed), so it predates this plan. `accountKnowledge` passed this run. No regressions from this plan found, so no fixes were made.
- [x] Run the AbilityTests headlessly: the new `visibility_senses_tiers` and `light_blocked_by_walls`, plus the existing lighting, darkness-strength and swarmling scenarios.
  - Done: `SimulationRunner.test.ts` + `darknessStrength.scenarios.test.ts` with a light / walls / senses / swarmling / darkness `-t` filter: 30 passed. Also ran all 34 registry scenarios whose id matches light / dark / swarm / visib / lantern / campfire through `runScenarioHeadless` (incl. `lighting_base_overlap_darkens_tile`, which has no Vitest case): all pass. Every registered scenario (174): 172 pass; `path_around_rock` and `exposed_duration_extension` fail identically at clean `HEAD`, so they predate this plan. The temporary test file was deleted.
- [ ] Manual browser check: a dark mission, e.g. 006d Displacer or 011 Lonely Castle (global light 0). Use the **run** / **playwright-e2e** skills.
  - Partly done (2026-11-11, built-in browser pane, local `testuser_a`, non-admin). Played 006d Displacer and 002 Towards the Light (global light 0, crystal caves). Checks used live `getUnitDetection` / renderer state, read through Vite module imports. Screenshots are in the session scratchpad `step9-screens/`.
  - **Verified:** a lit enemy within 8 tiles is drawn at alpha 1. A lit enemy at 8.06 tiles is `glimpsed`, alpha 0.45. A `seen` enemy on a dark tile has alpha 0.45. The player at light 0 has alpha 1. With the player in the dark, its 22 visible tiles are all dark and draw as a faint patch. Lit campfire terrain outside vision still shows; unseen dark stays dark. Wall tiles beside visible ground are in `visibleTiles` and lit; lit tiles behind walls are not visible. Light no longer bleeds through walls: the live grid with occlusion vs without differs on 104 tiles, e.g. open tiles cols 55–58 west of the east crystal cave are 0 instead of 1–3. A `heard` wolf 3 tiles into the dark is not drawn and shows two gray rings. The rings kept changing at a fixed tick while paused at the order screen. Hidden wolves are not drawn, and the objective "!" marker shows. The heard wolf's move path didn't show, judging from the screenshot only; the glimpsed wolf's path did show. Hitting a `hidden` / `heard` wolf (unit_8, Chain Lightning) routes to the standalone hidden flash, which shows and then clears. No red circles appear anywhere.
  - **Still needs a human:** (1) Pixel look of the pulses and the hidden hit flash. The pane was hidden, so rAF ran at about 1/s: the flash became visible but never drew a frame before it cleared, and pulses animated choppily. (2) Tremorsense pulses look stronger, hearing beats tremorsense, and Darkvision lets you see deeper. These need admin-granting the disabled nodes, and no admin test account exists. (3) Hidden enemies' attack telegraphs and damage numbers. A damage number did appear in the dark, but the target's tier at hit time wasn't confirmed. (4) Spell circles hidden with their caster (no caster enemy came up). (5) Darkvision / Tremorsense nodes invisible to non-admins in the research UI. The non-admin Upgrades tab shows only owned research; covered by `senseGrantsResearch.test.ts`. (6) Frame time in the Performance tab: the hidden pane makes timing unreliable, and that tab is admin-only.
  - **Observed (by design, worth a look):** on Displacer at tick 1, a wolf on a fully lit tile 4.5 tiles from the player was `hidden`. A single rock tile at (6,13) sits on the DDA line from (3,11) to (7,13), and 4.5 tiles is beyond hearing range 4. One-tile pillars can hide whole enemies in open light.
  - **Seen and glimpsed**
    - Enemies in light within 8 tiles render normally.
    - Enemies in light beyond 8 tiles render translucent.
    - Enemies just inside darkness render translucent.
    - Player units in darkness stay fully opaque.
  - **Terrain and light**
    - Visible dark terrain shows faintly.
    - Lit terrain outside vision still shows.
    - Unseen dark terrain stays dark.
    - Walls stop vision; wall faces are visible.
    - Torch and crystal light no longer bleeds through walls.
  - **Pulses**
    - Enemies behind a wall within 4 tiles show gray pulses, which keep animating while paused at the order screen.
    - After admin-granting the disabled Tremorsense node, tremorsense pulses look stronger, and hearing wins where both apply.
    - Admin-granting Darkvision lets you see deeper into darkness.
  - **Hidden enemies**
    - Not drawn.
    - Their attack telegraphs, damage numbers and the objective "!" marker still show.
    - Their spell circles do not show.
    - Hitting one shows a red flash at its position.
  - **General**
    - No lingering red circles.
    - The Darkvision and Tremorsense nodes are invisible to non-admins.
    - Frame time is comparable to before (Performance tab).
- [ ] Append a completion summary at the top of this plan and move it to `docs/plans/done/`.
  - Summary written at the top (2026-11-11). Not moved: the orchestrator will ask the user about archiving.

## Decisions

1. **Darkvision as a trait:** reaches players through the `grantSense` research effect (the disabled Training node), unit defs and buffs. Plumbing campaign character traits into battle is a follow-up.
2. **Enemies in light beyond 8 tiles:** a new `'glimpsed'` tier draws them translucent, as long as walls don't block the line.
3. **Terrain outside vision range:** looks as it does today.
4. **Darkness rendering:** applies to enemies only. Player and allied units stay fully opaque.
5. **Damage numbers** stay. Invisible enemies flash red when hit. Spell circles are hidden while their caster is invisible.
6. **Tremorsense:** a disabled Training node, like Darkvision.
7. **"High alpha"** is read as *more see-through*: enemies in darkness and glimpsed enemies get a lower opacity (0.45 at the extreme) rather than a dark tint. Both are single constants in `visibilityRenderRules.ts` if they need tuning.
