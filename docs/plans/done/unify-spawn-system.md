# Unify unit spawning behind SpawnDefinition + spawnUnit() — Phases 2-5

## Completion note (2026-07-15)

Steps 1-6's automated work is done. All six call sites (`LevelEventManager`'s spawnWave/
continuousSpawn/proximitySpawn, `lanterniteNestTick.ts`, `swarmNestTick.ts`, `thornlingNestTick.ts`,
`BaseMissionDef.ts`'s enemy/pet spawns, and the two ability spawn sites in `0005Ability.ts`/
`0009Ability.ts`) now go through `spawnUnit()`/`engine.spawnUnit()`. All now-dead duplicated
placement/RNG/ecology-wiring code was deleted, along with `applyLanterniteEcologySpawnFields`,
`hydrateLanterniteNestFromMissionDef`, and `hydrateSwarmNestFromMissionDef`. Final verification:
`npm run lint` (0 errors), `npx tsc --noEmit` (clean), `npm run test` (128 files / 1023 tests passed,
1 skipped — up from the 128/1022/1 pre-Phase-2 baseline, matching Step 1's added regression test
exactly). Lanternite/swarmling AbilityTest scenarios also pass (7/7); no thornling-specific scenario
exists in the repo to run.

**Still needs a human:** the Step 6 manual/browser checklist item — launch Thorn March
(`storylines/WorldOfDarkness/missions/008_thorn_march.ts`) via the `run` skill and visually confirm
the pre-spawned nest, guards, thornbinder, scout role split/travel, and the swarm-nest contest still
work end-to-end. This is the first true visual exercise of the migrated `relativeToUnit` placement
and golden-angle stagger together; nothing else in this plan substitutes for it.

**Follow-up spotted, out of scope for this plan:** `docs/factions/lanternites.md` had one stale
function-name reference fixed during Step 6's grep sweep — no other doc drift found.

## Context

Unit spawning in Minion Battles historically happened through six independent code paths
(mission bootstrap, three `LevelEventManager` event types, three nest-tick modules, two
ability-triggered spawns), each hand-rolling "build a config object → `createUnitFromSpawnConfig`
→ `addUnit` → manually bolt on extra state." This duplication caused a real bug earlier this
session (`continuousSpawn` never wired lanternite ecology fields that `spawnWave` did) and a
second latent one (`edgeOfMap` never filtering by darkness/passability).

The fix is a unified system: one `SpawnDefinition` type describing what/where/AI-state for a
unit, and one `spawnUnit()` function that is the only code path allowed to construct and add a
unit to the battle. **Phase 1 already landed the new module, fully unused** — see
`C:\Users\Jeremy\.claude\plans\immutable-fluttering-unicorn.md` for the full original design
rationale (open questions, alternatives considered, why decisions were made). This plan covers
**Phases 2-5**: migrating the six existing call sites onto the new system and deleting the
now-dead duplicated code.

### What already exists (do not recreate — read these first)

- **`app/js/games/minion_battles/game/units/spawning/spawnDefinition.ts`** — `SpawnDefinition`
  (fields: `characterId`, `name?`, `hp?`, `speed?`, `stackSize?`, `abilities`, `aiSettings?`,
  `radius?`, `unitTags?`, `teamId`, `ownerId?`, `controlGroupId?`, `controllable?`,
  `combatSettings?`, `ephemeralDespawnAtGameTime?`, `invulnerabilityGenerations?`, `unitId?`,
  `stamina?`, `unitAITreeId?`, `placement`, `aiHookup?`, `count?`). `SpawnPlacement` (discriminated
  union: `fixedWorld`, `fixedGrid`, `edgeOfMap`, `anywhere`, `closestToPlayers`,
  `closestEnemySpawnPoint`, `relativeToUnit`). `SpawnAiHookup` (discriminated union: `none`,
  `lanternite`, `lanterniteNest`, `swarm`, `swarmNest`, `thornlingNest`, `pet`).
- **`app/js/games/minion_battles/game/units/spawning/spawnUnit.ts`** — `spawnUnit(ctx: SpawnUnitContext, def: SpawnDefinition, spawnSource?: SpawnSource): Unit[]`.
  Resolves placement (owns its own per-call `occupiedCells` dedup), resolves `unitAITreeId`
  (`def.unitAITreeId ?? (ctx.aiControllerId === 'alphaWolfBoss' ? 'alphaWolfBoss' : undefined)` —
  `undefined` lets `Unit`'s constructor apply its own `'hunt'` default), builds the unit via the
  **existing, unchanged** `createUnitFromSpawnConfig`, applies the `aiHookup` dispatch, calls
  `ctx.addUnit(unit, spawnSource)`. Returns fewer than `def.count` units (never throws) if
  placement resolution couldn't find enough valid positions — logs why via `console.error`/`warn`.
  `SpawnUnitContext` is structural/narrow (`units`, `eventBus`, `terrainManager`,
  `lightLevelEnabled`, `aiControllerId`, `mapPOIs`, `addUnit`, `getLightAt`, `getZoneById`,
  `generateRandomInteger`, `allocateObjectId?`) — `GameEngine` and `EngineContext` both already
  satisfy it structurally with zero changes.
- **`app/js/games/minion_battles/game/units/spawning/adapters.ts`** —
  `enemySpawnDefToSpawnDefinition(e: EnemySpawnDef, ownerId = 'ai'): SpawnDefinition` (fixed-world
  placement from `e.position`; nest-config aiHookup when `characterId` matches a nest character id
  and the corresponding `lanterniteNest`/`swarmNest`/`thornlingNest` field is set; otherwise a
  `lanternite` patrol-field aiHookup when any of `lanterniteNestOwnerUnitId`/`lanternPatrolFarWorld`/
  `lanternPatrolLeg`/`lanterniteRole`/`lanterniteTargetNestPoiId` is set).
  `spawnWaveEntryToSpawnDefinition(base: EnemySpawnDef, entry: SpawnWaveEntry, ownerId = 'ai'): SpawnDefinition`
  (maps `entry.spawnBehaviour` + its config sub-object to the matching `SpawnPlacement`; same
  `lanternite` aiHookup builder minus the role/targetPoi fields, which `SpawnWaveEntry` doesn't
  carry — matches today's behavior exactly).
- **`app/js/games/minion_battles/game/units/spawning/nestMissionConfigs.ts`** —
  `LanterniteNestMissionConfig`, `SwarmNestMissionConfig`, `ThornlingNestMissionConfig`,
  `LanternitePatrolDestination` (relocated from `storylines/types.ts`, which now re-exports them —
  no import site elsewhere needed to change).
- **`GameEngine.spawnUnit(def: SpawnDefinition, spawnSource?: SpawnSource): Unit[]`** — one-line
  facade delegating to the module function with `this` as `ctx`. Use this from ability code
  (`eng.spawnUnit(...)`) rather than importing the module function directly.
- **`app/js/games/minion_battles/game/units/spawning/spawnUnit.test.ts`** — 13 tests covering every
  placement kind and the `lanternite`/`pet` aiHookup dispatch. Do not duplicate this coverage.
- **`unit_defs/unitDef.ts`**: the old, unrelated `SpawnDefinition` (spawn-in VFX config) was renamed
  to `SpawnAnimationDef` in Phase 1 to free the name — irrelevant to this plan, mentioned only so
  nobody re-introduces a naming collision.

### Design rules that apply to every step below

- **Decision logic never moves.** Which role a lanternite gets, which POI a scout targets, the
  golden-angle stagger math, the `maxUnits`-per-team cap check — none of that becomes declarative
  config. It stays exactly where it is today, computed before a `SpawnDefinition` is built. Only
  the terminal "construct the unit and add it to the battle" step collapses into `spawnUnit`.
- **Player-count health scaling is a caller concern.** `spawnUnit` never multiplies `def.hp`.
  Every step below must replicate today's exact pattern: compute
  `resolveEnemySpawnStats({...base, ...entry})` (or `resolveEnemySpawnStats(enemySpawnDef)`), then
  set `def.hp = Math.round(stats.hp * (base.teamId === 'enemy' ? enemyHealthMult : 1))` and
  `def.speed = stats.speed` **before** calling `spawnUnit`.
- **`spawnSource` stays a call-site concern**, passed as `spawnUnit`'s third argument — never put it
  on the `SpawnDefinition` itself.
- **After each step, only unchecked → checked items change.** Add a one-line summary under each
  item describing what actually changed.

## Agent Instructions

This plan is executed by **`/jp-implement-plan`**. Read
`.claude/skills/jp-implement-plan/SKILL.md` for the full orchestrator/worker workflow — the
invoking agent is the sole orchestrator, spawning one worker per step **synchronously**, waiting
for each to finish, then reporting completion to the user. Each worker implements exactly one
step, checks off its items with a one-line summary, and stops without spawning the next agent.

Relevant project skills for workers to apply as needed: **`working-on-minion-battles`**,
**`working-on-ai-controllers`** (Steps 2-3), **`creating-an-ability`** / **`editing-card-behaviour`**
(Step 5), **`scoped-testing`** (per-step test selection), **`ability-tests`** (Step 6 only).

## Step 1: Migrate LevelEventManager (spawnWave, continuousSpawn, proximitySpawn)

**Touches:** `app/js/games/minion_battles/game/managers/LevelEventManager.ts`

- [x] Replace `executeSpawnWaveSpawns`'s behavior-grouping logic with a single loop over `spawns`:
      look up `base = BASE_SPAWN_DEFS[entry.characterId]` (skip if missing), build
      `const def = spawnWaveEntryToSpawnDefinition(base, entry, 'ai')`, apply the health-mult
      pattern above, call `spawnUnit(this.ctx, def, undefined)` (import `spawnUnit` from
      `../units/spawning/spawnUnit` and `spawnWaveEntryToSpawnDefinition` from
      `../units/spawning/adapters`; `this.ctx: EngineContext` already structurally satisfies
      `SpawnUnitContext`, no wrapper needed). Delete `applyLanterniteEcologySpawnFields`, and the
      `isValidSpawnCell`/`collectCandidateTiles`/`chooseRandomIndices`/`getRingCells` private
      methods plus `resolveClosestRingCells`/`resolveClosestEnemySpawnPointCells` (all now live in
      `spawnUnit.ts`). Known, accepted behavior changes vs. today (do not try to preserve): (1) the
      upfront `if (!terrainManager) return` guard for the whole spawn wave becomes a per-entry
      check inside `spawnUnit` (only entries whose placement actually needs terrain are affected);
      (2) the shared `occupiedCells` Set that previously deduplicated across *all* entries in one
      spawnWave is now scoped per-entry (each `spawnUnit` call gets its own) — real-world overlap
      risk is negligible since `edgeOfMap` never used it anyway.
      **Summary:** `executeSpawnWaveSpawns` rewritten to an 8-line loop calling
      `spawnWaveEntryToSpawnDefinition` + `spawnUnit`; all listed private helper methods and
      `applyLanterniteEcologySpawnFields` deleted; now-unused `DarknessLevel`, `TerrainGrid`,
      `TerrainManager`, `createUnitFromSpawnConfig`, `getEdgePositions`, `resolveZoneTiles`, `Unit`
      imports removed.
- [x] Rewrite `processContinuousSpawnEvent`'s entry loop the same way, but **preserve the
      `maxUnits` per-team soft-cap semantics exactly**: today's `isOverCap` check runs *before each
      individual unit* within a multi-count entry (so a burst can partially fulfill under a cap).
      When `evt.maxUnits` is set, do not batch via `def.count` — loop calling
      `spawnUnit(this.ctx, { ...def, count: 1 }, undefined)` per attempt, checking
      `unitCountByTeam[base.teamId] > maxUnits` before each and incrementing by
      `spawned.length` after. When `evt.maxUnits` is unset (the common case), a single batched
      `spawnUnit(this.ctx, def, undefined)` call is fine. This exact semantic is exercised by
      `005_monster.ts`'s `maxUnits: 4` slime cap — do not regress it.
      **Summary:** rewrote to build one `SpawnDefinition` per entry via
      `spawnWaveEntryToSpawnDefinition`, then either loop `spawnUnit(ctx, {...def, count:1})` with
      an `isOverCap` check before each attempt (maxUnits set) or a single batched `spawnUnit` call
      (maxUnits unset) — same per-attempt cap semantics as before, just via `spawnUnit`.
- [x] Rewrite `processProximitySpawnEvent`'s `extraEnemySpawns` loop: for each `EnemySpawnDef`,
      build `const def = enemySpawnDefToSpawnDefinition(enemyDef, 'ai')`, apply the health-mult
      pattern, call `spawnUnit(this.ctx, def, undefined)`. The `spawnWaveEntries` sub-path is
      already covered by the `executeSpawnWaveSpawns` rewrite above — no separate change needed.
      **Summary:** done exactly as described; `createUnitFromSpawnConfig` + manual ecology-field
      wiring replaced with `enemySpawnDefToSpawnDefinition` + `spawnUnit`.
- [x] Add a regression test proving the exact gap this refactor fixes: in
      `LevelEventManager.continuousSpawnStart.test.ts` (or a new adjacent test file), register a
      `continuousSpawn` event spawning `characterId: 'lanternite'` with
      `lanternPatrolFarWorld`/`lanterniteNestOwnerUnitId` set on the entry, step one tick, and
      assert the spawned unit's `lanterniteState.patrolFarWorld`/`nestOwnerUnitId` are set
      (previously never wired for `continuousSpawn` — only for `spawnWave`/`proximitySpawn`).
      **Summary:** added `LevelEventManager continuousSpawn lanternite ecology fields` describe
      block to `LevelEventManager.continuousSpawnStart.test.ts` asserting
      `nestOwnerUnitId`/`patrolFarWorld`/`patrolLeg` are all wired on a continuousSpawn-spawned
      lanternite; passes.

**Verify:** `npm run lint`, `npx tsc --noEmit` (interface-crossing changes), then
`npx vitest run app/js/games/minion_battles/game/managers/LevelEventManager.continuousSpawnStart.test.ts app/js/games/minion_battles/game/managers/LevelEventManager.spawnZone.test.ts app/js/games/minion_battles/storylines/WorldOfDarkness/missions/008_thorn_march.test.ts`.

## Step 2: Migrate lanterniteNestTick.ts

**Touches:** `app/js/games/minion_battles/game/lanternite/lanterniteNestTick.ts`,
`app/js/games/minion_battles/game/GameEngine.ts` (one call site)

- [x] At the top of `processLanterniteNests`, build one local `SpawnUnitContext`-shaped object from
      `params`: `{ units: params.units, eventBus: params.eventBus, addUnit: params.addUnit,
      terrainManager: null, lightLevelEnabled: false, aiControllerId: null, mapPOIs: params.mapPOIs
      ?? [], getLightAt: () => null, getZoneById: () => undefined, generateRandomInteger:
      params.generateRandomInteger, allocateObjectId: params.idSource?.allocateObjectId?.bind(params.idSource)
      }`. `terrainManager: null` is safe — the only placement kind this file uses (`relativeToUnit`)
      never touches it.
      **Summary:** added a `spawnCtx: SpawnUnitContext` const built exactly as specified at the top
      of `processLanterniteNests`.
- [x] Replace the `generateRandomNumber?: () => number` param with a required
      `generateRandomInteger: (min: number, max: number) => number` — it becomes the sole RNG
      source once the local `rng`/`INT31` setup (only ever used for the angle/distance draw this
      step removes) is deleted. Update the one call site in `GameEngine.ts` (`processLanterniteNests({...})`,
      near the top of `fixedUpdate`): replace `generateRandomNumber: () => this.generateRandomNumber()`
      with `generateRandomInteger: (min, max) => this.generateRandomInteger(min, max)`
      (`GameEngine` already implements this per `EngineContext`).
      **Summary:** param replaced in `lanterniteNestTick.ts`; `GameEngine.ts`'s `processLanterniteNests({...})`
      call site updated to pass `generateRandomInteger` instead of `generateRandomNumber`.
- [x] Scout-construction-completion branch: replace the `createUnitFromSpawnConfig` call + manual
      `newNest.lanterniteState.nestConfig/homeNestPoiId` assignment + Invincible-tag/
      invulnerabilityGenerations inheritance + `params.addUnit(newNest)` with one
      `spawnUnit(spawnCtx, { characterId: LANTERNITE_NEST_CHARACTER_ID, name: 'Lanternite Nest',
      abilities: ['0014'], teamId: 'nature', unitAITreeId: 'lanterniteNestIdle', aiSettings: {
      minRange: 0, maxRange: 0 }, placement: { kind: 'fixedWorld', x: nestPos.x, y: nestPos.y },
      unitTags: <Invincible tag if unit had it>, invulnerabilityGenerations: <inherited, same math
      as today>, aiHookup: { kind: 'lanterniteNest', nestConfig: newNestCfg, homeNestPoiId:
      unit.lanterniteState.targetNestPoiId ?? undefined } })` — call with **no spawnSource
      argument** (defaults to `'darknessSpawn'`, matching today's `params.addUnit(newNest)` with no
      second arg — new nests get the vortex/burst-rise spawn-in animation, not the grow animation).
      Keep `prepareLanterniteNestForMissionStart(newNest, params.gameTime)` and the
      `upsertNestLightSource` call as caller-side post-spawn steps on the returned unit, unchanged.
      **Summary:** replaced with `const [newNest] = spawnUnit(spawnCtx, {...})` exactly as specified
      (no spawnSource arg); `prepareLanterniteNestForMissionStart`/`upsertNestLightSource` kept
      unchanged as post-spawn steps on `newNest`.
- [x] Per-tick lantern-spawning loop: keep the role/targetPoi/constructionAngle/
      attackReadyAtGameTime decision logic (and the legacy non-networked `far`/`if (!far) break`
      path) completely unchanged — only replace the terminal `createUnitFromSpawnConfig` +
      `lan.lanterniteState.*` assignments + `params.addUnit(lan, 'nestSpawn')` with one
      `spawnUnit(spawnCtx, { characterId: LANTERNITE_CHARACTER_ID, name: 'Lanternite', abilities:
      ['0010'], teamId: 'nature', unitAITreeId: cfg.networked ? 'lanterniteNetwork' :
      'lanternitePatrol', aiSettings: { minRange: 0, maxRange: 600 }, placement: { kind:
      'relativeToUnit', anchorUnitId: nest.id, maxRadiusPx: nest.radius + NEST_SPAWN_EXTRA_RADIUS
      }, unitTags: <Invincible if nest had it>, invulnerabilityGenerations: <inherited>, aiHookup:
      <built from the already-computed role/targetPoi/constructionAngle/attackReadyAtGameTime, or
      the legacy patrolFarWorld/patrolLeg> }, 'nestSpawn')` (omit `minRadiusPx` — it defaults to the
      anchor's own radius, matching today's `nest.radius + rng()*EXTRA` range exactly). Push the
      returned unit's id onto `state.spawnedIds` same as today.
      **Summary:** decision logic kept unchanged (still computed before the spawn call); terminal
      construction replaced with `const [lan] = spawnUnit(spawnCtx, {...}, 'nestSpawn')` using
      `relativeToUnit` placement; `state.spawnedIds.push(lan.id)` unchanged. Caught and fixed a
      dropped `patrolFarWorld` field on the networked scout's `aiHookup` via the lint pass (unused-var
      warning) before finalizing.
- [x] Remove the now-dead local `rng`/`INT31` variable declarations. Leave `CELL_SIZE` import alone
      — it's still used by the unrelated `targetPoi` world-position fallback for
      `patrolFarWorld`/emitter targeting.
      **Summary:** `rng`/`INT31` locals and the `createUnitFromSpawnConfig` import removed; `CELL_SIZE`
      import kept (still used by the scout world-position fallback).

**Verify:** `npm run lint`, `npx tsc --noEmit`, then `npx vitest run --changed`. Do **not** run the
lanternite AbilityTest scenarios here — they run once in Step 6.

## Step 3: Migrate swarmNestTick.ts and thornlingNestTick.ts

**Touches:** `app/js/games/minion_battles/game/lanternite/swarmNestTick.ts`,
`app/js/games/minion_battles/game/lanternite/thornlingNestTick.ts`,
`app/js/games/minion_battles/storylines/BaseMissionDef.ts` (only if `hydrateSwarmNestFromMissionDef`
still has a live import there — leave it for Step 4 to remove; do not touch `BaseMissionDef.ts` in
this step otherwise), `app/js/games/minion_battles/game/GameEngine.ts` (two call sites)

- [x] Apply the identical pattern from Step 2 to both files: build a local `SpawnUnitContext`
      object from `params` (same shape as Step 2's, `terrainManager: null`), replace
      `generateRandomNumber?` with a required `generateRandomInteger`, update the corresponding
      `GameEngine.ts` call sites (`processThornlingNests({...})`, `processSwarmNests({...})`) the
      same way as Step 2's.
      **Summary:** added a `spawnCtx: SpawnUnitContext` const to both `processSwarmNests` and
      `processThornlingNests` (thornling's `mapPOIs` is a literal `[]` — that file never needed
      POIs); `generateRandomNumber?` replaced with required `generateRandomInteger` in both params
      types; both `GameEngine.ts` call sites updated to pass `generateRandomInteger: (min, max) =>
      this.generateRandomInteger(min, max)`. `params.addUnit`'s existing single-arg type
      (`(unit: Unit) => void`) needed no widening — it's structurally assignable to
      `SpawnUnitContext.addUnit`'s two-arg signature as-is, and both GameEngine.ts wrapper
      callbacks already force `'nestSpawn'` regardless of any second arg, so behavior is unchanged.
- [x] `swarmNestTick.ts`: construction-completion branch → one `spawnUnit(spawnCtx, {
      characterId: SWARM_NEST_CHARACTER_ID, name: 'Swarm Nest', abilities: [], teamId: unit.teamId,
      unitAITreeId: 'lanterniteNestIdle', aiSettings: null, placement: { kind: 'fixedWorld', x:
      world.x, y: world.y }, aiHookup: { kind: 'swarmNest', nestConfig: cfg, homeNestPoiId:
      targetPoiId ?? undefined } })` (no spawnSource arg — matches today's `params.addUnit(newNest)`).
      Keep `initializeSwarmNestSpawnState(newNest, params.gameTime)` as a caller-side post-spawn
      step. Per-tick swarmling loop: keep `findUnclaimedNestPoi`/golden-angle `orbitAngle` decision
      logic unchanged; terminal spawn becomes `spawnUnit(spawnCtx, { characterId:
      SWARM_NEST_SWARMLING_CHARACTER_ID, name: 'Swarmling', abilities: [SWARMLING_BITE_ABILITY_ID],
      teamId: nest.teamId, unitAITreeId: SWARMLING_AI_TREE_ID, aiSettings: { minRange: 0, maxRange:
      70 }, placement: { kind: 'relativeToUnit', anchorUnitId: nest.id, maxRadiusPx: nest.radius +
      NEST_SPAWN_EXTRA_RADIUS }, aiHookup: { kind: 'swarm', orbitAngle, targetNestPoiId:
      <resolved>, nestOwnerUnitId: nest.id } })` — no spawnSource arg (today's swarm-child
      `params.addUnit(child)` also passes none, unlike lanternite's `'nestSpawn'`; preserve this
      difference exactly).
      **Summary:** both branches done exactly as specified; `nestConfig: { ...cfg }` kept spread
      (defensive copy, matching today's `newNest.swarmState.nestConfig = { ...cfg }` so the new
      nest doesn't alias its parent's config object); collapsed the pre-existing duplicate
      `child.swarmState.targetNestPoiId = targetPoi.id;` assignment (dead no-op line) into a single
      `targetNestPoiId` resolved before the `spawnUnit` call. Removed the now-unused `CELL_SIZE`
      import while touching this file's imports (it was already dead before this step).
- [x] `thornlingNestTick.ts`: simplest case — terminal spawn becomes `spawnUnit(spawnCtx, {
      characterId: spawnCharacterId, name: <capitalized spawnCharacterId, same formatting as today>,
      abilities: spawnAbilities, teamId: nest.teamId, unitAITreeId: spawnAITreeId, aiSettings: {
      minRange: 0, maxRange: 80 }, placement: { kind: 'relativeToUnit', anchorUnitId: nest.id,
      maxRadiusPx: nest.radius + NEST_SPAWN_EXTRA_RADIUS } })` — no `aiHookup` needed (mobile
      thornlings carry no special state), no spawnSource arg.
      **Summary:** done exactly as specified.
- [x] Remove now-dead local `rng`/`INT31` declarations in both files.
      **Summary:** removed from both files — `resolveRelativeToUnitPositions` inside `spawnUnit.ts`
      now owns the angle/distance draw via `ctx.generateRandomInteger`, so no local RNG calc
      remained in either tick file.

**Verify:** `npm run lint`, `npx tsc --noEmit`, then `npx vitest run --changed`. AbilityTest
scenario runs deferred to Step 6.

## Step 4: Migrate BaseMissionDef.ts

**Touches:** `app/js/games/minion_battles/storylines/BaseMissionDef.ts`,
`app/js/games/minion_battles/game/lanternite/lanternitePulse.ts`,
`app/js/games/minion_battles/game/lanternite/swarmNestTick.ts`

- [x] Enemy-spawn loop: replace the `enemySpawns: UnitSpawnConfig[]` map + per-spawn
      `createUnitFromSpawnConfig` + the ~28-line `if`-chain wiring nest configs and lanternite
      ecology fields with: iterate `this.enemies` directly, build `const def =
      enemySpawnDefToSpawnDefinition(e, 'ai')` (import from `../game/units/spawning/adapters`),
      apply the health-mult pattern (`resolveEnemySpawnStats(e)`, same `enemyHealthMult` logic as
      today), call `const [unit] = engine.spawnUnit(def, 'initialGameSpawn')`, then keep
      `initializeAbilityRuntimeForUnit(unit)` / `attachAmmoIfNeeded(engine, unit)` as caller-side
      post-spawn steps (guard on `unit` being defined). `spawn.unitId` is already handled by the
      adapter (`def.unitId`) → `createUnitFromSpawnConfig`'s `id` field — no special-casing needed.
      The post-spawn `for (const u of engine.units)` loop (nest hydration completion —
      `prepareLanterniteNestForMissionStart`/`initializeThornlingNestSpawnState`/
      `initializeSwarmNestSpawnState`) is unchanged.
      **Summary:** rewrote to a 10-line `for (const e of this.enemies)` loop building `def` via
      `enemySpawnDefToSpawnDefinition`, overriding `def.hp`/`def.speed` per the health-mult
      pattern, then `engine.spawnUnit(def, 'initialGameSpawn')` with a guard on the returned unit;
      post-spawn hydration loop left untouched.
- [x] Pet-spawn block: replace the `createUnitFromSpawnConfig` call + manual
      `pet.petState.defId/ownerUnitId` + `unit.petState.unitIds.push(pet.id)` with one
      `engine.spawnUnit({ characterId: petDef.unitCharacterId, name: petDef.name, teamId: 'player',
      abilities: [...petDef.abilityIds], unitAITreeId: 'pet', aiSettings: { minRange: 0, maxRange:
      50 }, placement: { kind: 'fixedWorld', x: spawnX + 40, y: spawnY }, aiHookup: { kind: 'pet',
      ownerUnitId: unit.id, defId: petId } }, 'initialGameSpawn')` — the three manual pet-wiring
      lines are now handled inside `spawnUnit`'s `pet` dispatch. Keep
      `initializeAbilityRuntimeForUnit(pet)` as a caller-side post-spawn step.
      **Summary:** done exactly as specified; guarded on `pet` being defined before calling
      `initializeAbilityRuntimeForUnit(pet)`.
- [x] Remove now-unused imports: `createUnitFromSpawnConfig` (keep `createPlayerUnit`),
      `UnitSpawnConfig` type from `../game/types`. `hydrateLanterniteNestFromMissionDef`/
      `hydrateSwarmNestFromMissionDef` imports too (their last call sites were the deleted if-chain
      above) — then delete both functions themselves from `lanternitePulse.ts` and
      `swarmNestTick.ts` respectively (grep first to confirm no other caller exists; there should be
      none). Keep `LANTERNITE_NEST_CHARACTER_ID`/`THORNLING_NEST_CHARACTER_ID`/
      `SWARM_NEST_CHARACTER_ID` imports — still used by the unchanged post-spawn hydration loop.
      **Summary:** removed `createUnitFromSpawnConfig`/`UnitSpawnConfig` imports (kept
      `createPlayerUnit`); added `enemySpawnDefToSpawnDefinition` import from
      `../game/units/spawning/adapters`; grepped and confirmed BaseMissionDef.ts was the only
      caller of both hydrate functions, then deleted `hydrateLanterniteNestFromMissionDef` from
      `lanternitePulse.ts` (and its now-unused `LanterniteNestMissionConfig` type import) and
      `hydrateSwarmNestFromMissionDef` from `swarmNestTick.ts` (kept `SwarmNestMissionConfig`,
      still used elsewhere in that file); the three nest-character-id imports were left in place.

**Verify:** `npm run lint`, `npx tsc --noEmit`, then
`npx vitest run app/js/games/minion_battles/storylines/WorldOfDarkness/missions/008_thorn_march.test.ts app/js/games/minion_battles/storylines/WorldOfDarkness/missions/007_ember_threshold.test.ts app/js/games/minion_battles/storylines/BunkerAtTheEnd/missions/last_holdout.test.ts app/js/games/minion_battles/game/units/petSystem.test.ts`.

## Step 5: Migrate the two ability spawn sites

**Touches:** `app/js/games/minion_battles/card_defs/dark_animals/0005_AlphaWolfSummon/0005Ability.ts`,
`app/js/games/minion_battles/card_defs/0009_HuskSeedBarrage/0009Ability.ts`

- [x] `0005Ability.ts`: add `spawnUnit(def: SpawnDefinition, spawnSource?: SpawnSource): Unit[];` to
      the local `GameEngineLike` interface (import `SpawnDefinition` type from
      `../../../game/units/spawning/spawnDefinition`). In the `for (let i = 0; i < 3; i++)` loop,
      replace the `createUnitFromSpawnConfig(config, eng.eventBus, eng)` + `eng.addUnit(wolf,
      'abilitySpawn')` pair with one `const [wolf] = eng.spawnUnit({ ...config-equivalent fields,
      placement: { kind: 'fixedWorld', x: spawnX, y: spawnY } }, 'abilitySpawn')` — `teamId:
      caster.teamId`, `unitAITreeId: caster.unitAITreeId`, `controllable: false`, `unitTags: []`
      must all be preserved exactly as today (do not let a player-controlled alpha wolf's caster
      state leak onto summoned wolves). Reusing `enemySpawnDefToSpawnDefinition(ENEMY_DARK_WOLF,
      'ai')` as a base and overriding `teamId`/`unitAITreeId`/`controllable`/`unitTags`/`placement`
      is one clean way to build the definition; hand-rolling the object literal is equally fine if
      clearer in context. Everything after (particle burst, closest-enemy targeting,
      `wolf.aiContext = {...}`, `queueOrder(...)`) is unchanged, operating on the returned `wolf`.
      Guard the `if (closest && biteAbility)` block on `wolf` being defined.
      **Summary:** added `spawnUnit` to `GameEngineLike` and a `SpawnDefinition` type import; the
      `createUnitFromSpawnConfig`/`eng.addUnit` pair replaced with
      `const [wolf] = eng.spawnUnit({ ...enemySpawnDefToSpawnDefinition(ENEMY_DARK_WOLF, 'ai'),
      teamId: caster.teamId, unitAITreeId: caster.unitAITreeId, controllable: false, unitTags: [],
      placement: { kind: 'fixedWorld', x: spawnX, y: spawnY } }, 'abilitySpawn')`; added
      `if (!wolf) continue;` right after the call so the (currently unreachable, since `fixedWorld`
      placement always resolves) particle-burst/closest-enemy/queueOrder code that follows never
      dereferences an undefined `wolf`. `createUnitFromSpawnConfig` import removed (now unused).
- [x] `0009Ability.ts`: add the same `spawnUnit` method to its local `EngineLike` interface. In
      `onProjectileExpired`'s `for (let i = 0; i < spawnCount; i++)` loop, replace the
      `createUnitFromSpawnConfig` + `eng.addUnit(husk, 'abilitySpawn')` pair with one
      `eng.spawnUnit({ characterId: 'huskling', name: 'huskling', teamId: 'enemy', abilities:
      ['0002'], aiSettings: { minRange: 0, maxRange: 70 }, combatSettings: { damageModifier: {
      flatAmt: -3, multiplier: 1 } }, ephemeralDespawnAtGameTime: eng.gameTime + HUSK_LIFETIME_SEC,
      placement: { kind: 'fixedWorld', x: projectile.x + ox, y: projectile.y + oy } },
      'abilitySpawn')` — `unitAITreeId` stays omitted (relies on the unified fallback to `'hunt'`,
      identical to today's behavior since no explicit tree id was ever set here).
      **Summary:** added `spawnUnit` to `EngineLike` and a `SpawnDefinition` type import; the
      `createUnitFromSpawnConfig`/`eng.addUnit` pair replaced with one `eng.spawnUnit({...},
      'abilitySpawn')` call exactly as specified; `createUnitFromSpawnConfig` import removed (now
      unused).

**Verify:** `npm run lint`, `npx tsc --noEmit`, then
`npx vitest run --changed` (no dedicated unit test files exist for either ability today; their
behavior is covered by AbilityTest scenarios if registered, or by manual verification in Step 6).

## Step 6 (final): Cleanup + full verification

**Touches:** whatever stragglers the grep below finds (expected: none, if Steps 1-5 were thorough)

- [x] Grep the repo for `applyLanterniteEcologySpawnFields`, `hydrateLanterniteNestFromMissionDef`,
      `hydrateSwarmNestFromMissionDef` — confirm zero references remain anywhere (including test
      files). Grep for `generateRandomNumber` inside the three nest-tick files — confirm zero
      remaining. Fix anything found.
      **Summary:** zero code/test references to any of the three deleted symbols found; only hits
      were this plan file's own prose (expected) and a stale mention of
      `hydrateLanterniteNestFromMissionDef` in `docs/factions/lanternites.md`'s code-map comment,
      which was fixed to drop the dead function name. `generateRandomNumber` grep in the three
      nest-tick files returned zero matches.
- [x] Run `npm run lint` (full repo) and `npx tsc --noEmit` — both clean.
      **Summary:** `npm run lint` → 0 errors, 17 pre-existing warnings unrelated to this plan (React
      hooks deps, unused vars in unrelated files). `npx tsc --noEmit` → no output, clean.
- [x] Run `npm run test` (full Vitest suite) — 0 failures. Compare the passing count against the
      pre-Phase-2 baseline (128 files / 1022 tests / 1 skipped, recorded at the end of Phase 1) —
      the count should be equal or higher (Step 1 added a regression test), never lower.
      **Summary:** 128 files passed (128), 1023 tests passed + 1 skipped (1024 total), 0 failures.
      Test count is +1 over the 1022-test baseline, matching Step 1's added continuousSpawn
      lanternite-ecology regression test; file count unchanged at 128.
- [x] Run the lanternite/swarm/thornling AbilityTest scenarios headlessly via
      `npx vitest run app/js/games/minion_battles/testing/runner/SimulationRunner.test.ts -t "lanternite"`
      and, if a swarmling- or thornling-specific scenario file exists under
      `app/js/games/minion_battles/testing/scenarios/general/` (grep for `swarm`/`thornling` there
      first — do not assume filenames), run those too. All must pass — this is the first true
      end-to-end exercise of the migrated `relativeToUnit` placement, golden-angle stagger, and
      role/POI aiHookup wiring together.
      **Summary:** `-t "lanternite"` → 5 passed (light-pulse attack, nest build, nest dual-spawn
      scout+defender, death torch-off/respawn, death nest-owned-skips-respawn). Grepped
      `testing/scenarios/` for `swarm`/`thornling`: found `general/swarmlings.ts`
      (`swarmlingHuntAndBiteScenario`, registered in `registry.ts`) and no thornling-specific
      scenario file anywhere. Ran `-t "swarmling"` → 2 passed (`swarmling hunt-and-bite scenario`
      and `World Modifiers: swarmling death spawns dark light for 5 rounds`). Note: the swarmling
      scenario spawns swarmlings directly via `createUnitFromSpawnConfig` for combat-AI testing, not
      through the migrated `swarmNestTick.ts` path — it does not itself exercise the
      `relativeToUnit`/golden-angle swarm-nest spawn code; that path is covered by the full-suite
      `spawnUnit.test.ts` unit tests and Step 6's manual/browser checklist item below. All 7 matched
      tests passed, 0 failures.
- [ ] Manual/browser checklist (needs a human — note as such in the completion report, do not
      attempt to automate): launch a lanternite mission (e.g. Thorn March,
      `storylines/WorldOfDarkness/missions/008_thorn_march.ts`) via the `run` skill and visually
      confirm the pre-spawned nest, guards, thornbinder, scout role split, scout travel to the
      second nest, and the swarm-nest contest (added earlier this session) all still work.

**Verify:** all of the above — this is the plan's one expensive verification pass; nothing further
needed after this step.
