# Garden Heart boss + Reactions — Implementation Plan

**Implemented 2026-11-17 (awaiting browser test):** Steps 1–17 and 8a are done by parallel workers and verified by inspection and targeted tests. The Garden Heart is the boss of the `garden_heart` mission (Chapter 3), with the Shell, Stems, Briar/Tangle, four burrowing phases, five node kinds, the destroyable Pod Mortar seed, and Reactions (Reflex, reaction frames on Crystal Laser, the seed and the resprout eruption, tutorial, UI, co-op claims over the mesh with a host-recorded claim row). Open: the manual browser checklist below, the full `npm run test:sim` run, and the follow-ups listed under Step 18.

Goal: build the second Chapter 3 boss, **The Garden Heart** (`garden_heart`), and the **Reaction** mechanic it teaches: a Reflex resource that lets players pause a Reactable boss attack at its reaction frame and answer it, including the co-op claim flow. Source of truth for the design is the browser plan **0008 The Garden Heart: Reactions** (`docs/ideas/plans/0008_2026-11-15_garden-boss.md`, Ideas → Plans). Link to its sections rather than restating the design; this file records only the decisions that bind implementation.

The plan has three parts that can ship separately, in order: **A** engine pieces and the fight (Steps 1–8), **B** single-player Reactions (Steps 9–13), **C** co-op Reaction claims (Steps 14–17). Step 18 verifies everything.

## Plan-level decisions (locked)

**Fight** (browser plan 0008, "The fight")

- **Vocabulary:** Heart, Knot, Bud, Stem, Shell, Briar, Tangle. Use these names in code (`GardenHeart…`, `knot`, `bud`), not "leaf node" / "thick vines".
- **Shell:** a Knot with at least one living child takes 10 less per hit, never below 10, and a hit already under 10 is unchanged (25 → 15, 14 → 10, 6 → 6). The grey "resisted" number shows whenever the Shell took anything off.
- **Phases:** four, at 100/75/50/25%. Damage past a threshold is lost. On retreat the old tree dies and its Stems become Briar; the Heart resurfaces at an authored sprout point away from the party and old Briar.
- **Arena:** four segments, `62_47_queens_garden`, `63_47_conservatory`, `62_48_herb_garden`, `63_48_orchard`.
- **Pod Mortar seed:** destroyable, **20 base health scaled by player count** via `getEnemyHealthMultiplier` (`constants/enemyConstants.ts`), the same as other enemies. Killing it cancels the burst (no damage, a short fizzle).
- **Look:** Nightbloom palette (`#134e4a` / `#e9d5ff`), Seed pod Heart. Art references are the `gh-*` pieces in `app/js/components/minionBattlesHomePage/Ideas/fxArt/gardenHeartArt.tsx`.

**Reactions** (browser plan 0008, "Reactions in this fight")

- **Names:** Reaction (the mechanic), **Reflex** (the resource), **Reactable** (the ability flag), **reaction frame** (the moment). Never reuse "interrupt" (that is `ccInterrupt` / `interruptPolicy`).
- **Reflex:** a per-unit `Resource`, start 1, cap 1, recover 1 at each round start (`Resource.onRoundStart`, as `Charge` does).
- **Knowledge:** account knowledge key `Reactions`. Granted at the **start** of the Garden Heart fight. The engine gets a per-player "knows Reactions" flag at battle bootstrap, serialized so every client agrees.
- **Tutorial:** fires the first time a reaction frame pauses the local player, in any mission. Uses the existing tutorial system with a new trigger.
- **Who is paused:** at a reaction frame, every player unit that knows Reactions, has ≥ 1 Reflex and is inside that attack's telegraph. No active player.
- **Merge:** reaction-frame waiters are added to the tick's deferred pause (`requestMidCastOrderPause` already merges), so simultaneous frames and any other pause on that tick form one plane.
- **Acting:** pass (`wait`) is free. Any ability (no tag filter in v1) spends 1 Reflex, cancels whatever the unit was casting (refund rules as `applyConditionalCancelDecision`), uses its normal cooldown, and plays out in normal time. The boss's attack keeps running.
- **Garden attacks that are Reactable:** Pod Mortar burst (frame at the start of the 1.5 s red telegraph) and the resprout eruption. Crystal Laser (`1490`) also gets the flag; it stays inert for parties without the knowledge.

**Co-op claims** (browser plan 0008, "Co-operation" and "Co-op claim: settled")

- **Gate:** one rule, `canClaimReaction(engine, unit)`, true only while a Reactable attack is in progress (start of its cast to its hit) and the unit knows Reactions and has ≥ 1 Reflex. Later this widens to "any pause plane" (Ideas → Systems, "Reflex as an extra turn"), so nothing else may hard-code the in-progress check.
- **Flow:** claimant broadcasts a claim request over the WebRTC mesh (to host and peers) carrying `planeId` and `atTick`. Peers mark it pending. The host validates, records it through a **dedicated claim endpoint** (not `BattleNet.submitOrder`), and only then sends accepted/rejected with the same `planeId`/`atTick`. A record that cannot be written is a rejection.
- **Several claimants:** every claim that reaches the host before the plane closes is accepted; the plane belongs to all of them.
- **Host sequencing:** the host never closes a plane while a claim request for it is undecided, so "accepted, then resumed anyway" cannot happen.
- **Stopping:** a claimant gives up on a rejection, or when the plane with the matching `planeId` closes. Peers that played ahead past the plane rewind to it if the claim is accepted.
- **Plane identity:** every pause plane gets a deterministic `planeId` (derived from `atTick` plus a per-battle counter), serialized in `WaitingForOrders`.
- **Mesh down:** the claim button is disabled while the mesh link to the host is down.
- **Not now:** no pause-plane timeout (Ideas → Systems).
- **Endpoint shape:** decided in Step 15 on architecture grounds, with this rule: the accepted claim must live in the stream the engine replays (so replays and checkpoint fingerprints include it), never in a separate claims store.

## Key existing code index

Paths are under `app/js/games/minion_battles/` unless noted.

| Concern | Location |
|---|---|
| Mid-cast pause and its decision | `game/units/unitAbilityTick.ts` (conditionalCancel on interval exit), `game/managers/OrderManager.ts` (`applyConditionalCancelDecision`, `resolveConditionalCancelIfNeeded`) |
| Pause plane forming / merging / resuming | `game/orderPause/OrderPauseController.ts` (`requestMidCastOrderPause`, `commitDeferredOrderPauseAfterCompletedTick`, `tryResumeParallel`), `GameEngine.requestConditionalCancelPause` |
| Pause plane state | `game/types.ts` (`WaitingForOrders`, `OrderWaiter`, `normalizeWaitingForOrdersFromJSON`) |
| Timing intervals + timeline marks | `abilities/abilityTimings.ts` (`AbilityTimingInterval`, `ConditionalCancelDef`, cancel timeline marks) |
| Resources | `resources/Resource.ts` (`onRoundStart`), `resources/Charge.ts` (round recovery precedent), `resources/SuperBar.ts`, `resources/resourceIds.ts`, `resources/createResourceFromId.ts`, `resources/resourceDisplayDefs.ts` |
| Round start | `game/managers/UnitManager.ts` (`onRoundStart`), `game/roundProgressMilestones.ts` |
| Enemy health scaling | `constants/enemyConstants.ts` (`getEnemyHealthMultiplier`) |
| Phases | `game/units/components/phaseDef.ts` (`invulnerableSeconds`, `health_below_percent`) |
| Damage modifiers / armour precedent | `abilities/damageModifiers.ts`, `abilities/earthCoreArmour.ts` |
| Damage numbers | `game/effect_defs/textEffects.ts` (`damageNumberEffectDef`) |
| Thorns | `game/terrainEffects/thorns.ts`, `terrainEffectDefs.ts`, `DARK_THORN_EFFECT_TYPE`, `THORN_HITS_TAKEN_PARAM` |
| Nest spawner | `spawnerCore.ts`, `buildNestSpawnContext` |
| Boss setups / mission | `storylines/WorldOfDarkness/missions/castle/castleBosses.ts`, `.../missions/020_garden_heart.ts`, `defineCastleMission` |
| Knowledge + tutorials | `app/js/accountKnowledge.ts`, `backend/TutorialKnowledge.php`, `tutorials/` (see `tutorials/AGENTS.md`), `ui/pages/battlePhase/useBattleTutorial.ts` |
| Mission knowledge grants (completion precedent) | `phaseHandlers/battleVictory.ts`, `app/js/app/useMissionResultRecording.ts` |
| Battle bootstrap per-player data | `game/battleBootstrap.ts` (`darknessUpgradeBonuses` precedent) |
| Sync | `game/battlenet/BattleNet.ts`, `game/battlenet/types.ts` (`BattleSyncNudge`), `game/battlenet/hostPersistWindow.ts`, `app/js/WebRtcLobbyMesh.ts`, `backend/BattleStorage.php`, `backend/Http/` |
| Existing pause tests | `game/conditionalCancel.test.ts` |

## Agent Instructions

This plan is executed by `/jp-implement-plan` (see `.claude/skills/jp-implement-plan/SKILL.md`; do not restate its workflow here). The **invoking agent is the sole orchestrator**: it spawns one worker per step **synchronously** (never in the background), waits for each worker to finish, then moves to the next step, and finally reports plan completion to the user. Each worker implements **exactly one step**, checks off that step's checklist items with a one-line summary under each, and **stops without spawning the next agent**.

Every worker reads "Build the engine, not the feature" in `app/js/games/minion_battles/AGENTS.md` first. Each piece below is a reusable property or preset; nothing may special-case the Garden Heart in engine code.

Project skills relevant to this plan (workers invoke the ones matching their step):

- `working-on-minion-battles` — always.
- `game-engine`, `game-object-def-pattern` — any step adding serialized state (Steps 1, 3, 4, 6, 9–11, 14).
- `creating-an-ability`, `editing-card-behaviour`, `card_defs/SKILL.md` (AbilityRegistry) — Steps 6–7, 10.
- `abilities/AGENTS.md` (CastBehaviours) — Steps 6, 10.
- `crowdControl/AGENTS.md` — Step 10 (keep Reactions separate from CC interrupts).
- `terrain/AGENTS.md` — Step 4.
- `game/effects/AGENTS.md` — Steps 2, 3, 5.
- `working-on-ai-controllers` — Step 7.
- `missions`, `map-segments`, `map-design`, `modifying-spawn-definitions` — Step 8.
- `research-trees` (knowledge) and `tutorials/AGENTS.md` — Step 12.
- `editing-and-creating-components`, `components-for-the-ui`, `hud-effects` — Steps 13, 17.
- `game-sync-data-flow`, `webrtc-lobby-mesh` — Steps 14–17.
- `time-dilation` — Step 10 (Crystal Laser runs under Time Stop).
- `writing-style-abilities` (`.claude/skills/narrative/writing-style-abilities/STYLE.md`) — any player-facing text.
- `ability-tests` — Step 18 (scenarios).
- `scoped-testing` — per-step Vitest scope.

**Verification cadence:** per step, at most `npm run lint:changed`, `npx tsc --noEmit` when the step crosses an interface boundary, and only the specific test files the step touches or creates. No full-suite, whole-directory, or AbilityTest/E2E runs in regular steps; Step 18 runs the expensive things once. `tsc` currently has one pre-existing error in `abilities/archetypes/defineDirectionalShield.ts`; ignore it, add no new ones.

---

## Part A — Engine pieces and the fight

### Step 1 — Flat per-hit damage reduction

Files: `abilities/damageModifiers.ts` (or a new sibling `game/units/components/flatReduction.ts` if the modifier pipeline is the wrong layer), the unit damage entry point it feeds, new `game/flatDamageReduction.test.ts`.

- [x] Add a generic per-hit flat reduction a unit can carry: `{ amount, floor, condition }`, where a hit under `floor` is unchanged and any other hit becomes `max(floor, hit - amount)`.
  - Done: new `game/units/flatDamageReduction.ts` (`FlatDamageReduction { amount, floor, condition? }`, `applyFlatReductionToHit`, `applyUnitFlatReductions`, condition registry via `registerFlatReductionCondition(id, (unit) => boolean)`; unknown id = inactive). Stored as serialized `Unit.flatDamageReductions` (omitted when empty).
  - `condition` is a named predicate id resolved from a registry (serializable), not a closure on the unit.
- [x] Report on the damage event how much was resisted, so feedback (Step 2) and logs can read it.
  - Done: `damage_taken` event and `DamageBreakdown` now carry optional `resisted` (omitted when 0), set in `applyDamageToUnitDetailed`.
- [x] Tests: 25 → 15, 14 → 10, 6 → 6 with `{ amount: 10, floor: 10 }`; condition false → full damage; it stacks after (not before) percentage modifiers, matching how `earthCoreArmour` orders itself (confirm and document the order).
  - Done: `game/flatDamageReduction.test.ts` (6 tests green). Order, now documented in the module: attacker modifiers, then target `exposed`, then flat reduction, then shields, then earth-core armour, then hp.

### Step 2 — Resisted damage numbers

Files: `game/effect_defs/textEffects.ts`, the site that spawns damage numbers, a test next to existing text-effect tests (or new `game/effect_defs/textEffects.resisted.test.ts`).

- [x] Add a "resisted" variant of `damageNumberEffectDef`: smaller, grey, slower drift. Spawned for any unit whenever the hit's resisted amount (Step 1) is > 0.
  - Done: new effect type `ResistedDamageNumber` (`resistedDamageNumberEffectDef` in `effect_defs/textEffects.ts`, registered in `effect_defs/index.ts`; Effect.ts motion + MiniTerrainView treat it like DamageNumber). 11px grey `0x9ca3af`, 1.5 s duration (vs 0.92) so it drifts slower. When `ev.resisted > 0`, `createDamageTakenEffect` spawns ONLY the grey number, showing the damage actually dealt (`ev.amount`; damage numbers have no prefix), instead of the normal `DamageNumber`; a fully resisted hit shows a grey "0". Normal hits are unchanged.
- [x] Test that a resisted hit picks the variant and a normal hit does not.
  - Done: added to existing `game/createDamageTakenEffect.test.ts` (4 tests green): resisted hit gives only `ResistedDamageNumber` (amount dealt), amount 0 gives grey 0, normal hit gives only `DamageNumber`.

### Step 3 — Node trees and Stem tethers

Files: new `game/units/components/nodeTree.ts` (parent/child links), new `game/tethers/` module (Stem bodies), registration in the unit component and serialization paths (`unitToJSON.ts` / `unitFromJSON.ts` or the component registry), new `game/nodeTree.test.ts`, new `game/tethers/tether.test.ts`.

- [x] Node tree component: `parentId`, `childIds`, and hooks `onLastChildDied` and `onDeath`. Provide the named condition `hasLivingChildren` for Step 1's reduction.
  - Done: unit component `nodeTree` (`game/units/components/nodeTree.ts` state/API, `nodeTreeHooks.ts` hooks, `nodeTreeSpawn.ts`), registered in `builtinComponents.ts` and the hook table. Importing `nodeTree.ts` registers the flat-reduction condition `hasLivingChildren` (`NODE_TREE_HAS_LIVING_CHILDREN`).
  - **API for Step 7:** `spawnNodeChild(engine, parent, spawnDefinition, { tetherMaxLength? })` spawns and links in one call (placement comes from the def's own `placement`); `linkNodeChild(parent, child, { tetherMaxLength? })` / `unlinkNodeChild` link existing units. `tetherMaxLength` is the leash in px between unit centres; omit it for an untethered link (Knots, which never move, can be tethered too). Read with `getNodeParentId`, `getNodeChildIds` (LIVING children only; a dying child removes itself), `hasLivingChildren(unit)`.
  - **Callbacks are named, not closures:** a def declares `componentSpec(NODE_TREE_COMPONENT, { onLastChildDied: 'openShell', onDeath: 'id' })` and the id is registered with `registerNodeTreeCallback(id, (unit, ctx, event, child) => ...)` in `nodeTreeHooks.ts`. `onLastChildDied` fires on the PARENT once when its living-child list empties after a child death (never for `unlinkNodeChild`); `onDeath` fires on the unit that died. Unknown id = no-op. A parent dying does not kill or cascade to children (their tethers just stop existing). Units that declare nothing get the component attached lazily when linked, with no callbacks. Use `flatDamageReductions: [{ amount, floor, condition: 'hasLivingChildren' }]` on Heart and Knots.
- [x] Tether body linking two units: blocks unit movement along its length (feed the occupancy / pathing layer, see `CellOccupancyManager.ts`), follows its ends, keeps a max length (the Bud's leash), lets projectiles pass while alive, and exposes a sway phase for the renderer.
  - On `onDeath` of the child end, the tether converts to terrain (Step 4) along the tiles it covers.
  - Done: `game/tethers/tether.ts`. The tether has NO state of its own: it exists while the child's `nodeTree` state has `tetherMaxLength` and both ends live; its ends are the live parent and child positions. Blocking: `slideAlongTethers` is called in `updateUnit` (`unitMovementTick.ts`) after the wall slide; a walker is stopped/slides along the vine, the two end units are exempt, projectiles/beams and forced movement (knockback, nudge, hover) ignore it. Leash: `nodeTree` tick hook clamps a child to `tetherMaxLength` from its parent. Renderer data: `tetherVinePoints(seg, timeSec)` (pinned ends, travelling wave), `tetherSwayPhase(childId)`, `listLiveTethers(engine)`. Child death: `placeBriar(tetherCoveredTiles(...))` (Step 4) in the `nodeTree` onDeath hook.
  - **Known limit:** the nav grid does not know about living tethers, so a path planned across one stalls against it (hold, slide along) instead of re-routing. Briar, once the vine is dead, is real terrain and is routed around. The movement-tick check scans `engine.units` per moving unit (a Map lookup each), fine at current unit counts.
- [x] Serialize both; round-trip test in each test file.
  - Done: nodeTree slice serializes as unit-JSON keys `nodeParentId`, `nodeChildIds`, `nodeTetherMaxLength`, `nodeResolved` (omitted at defaults); the tether serializes through the child's slice. Round-trip tests in `game/nodeTree.test.ts` and `game/tethers/tether.test.ts`.
- [x] Tests: killing a Bud fires its parent's `onLastChildDied` only when it was the last child; a living tether blocks a walk through it; a dead tether leaves Briar on its tiles.
  - Done: `game/nodeTree.test.ts` (7 tests) and `game/tethers/tether.test.ts` (9 tests) green; also leash clamp, unlinked-walk-is-clear control, ends exempt, vine geometry. Note a killed tether's Briar blocks the same walk (tests use `unlinkNodeChild` for the "clear" control).
- [x] Renderer: draw tethers as a segmented vine with a travelling wave (art: `gh-opening`). Keep drawing in the existing GameRenderer layer conventions.
  - Done: new `GameRenderer/renderers/TetherRenderer.ts` (dark stroke plus light core, leaf joints, wall-time wave, z 9 just under units, hidden when neither end is visible to the local team), wired into `GameRenderer.ts` with the units layer. Colours are placeholders for the `gh-opening` art pass; not viewed in a browser.

### Step 4 — Destructible and wearing terrain (Briar, Tangle)

Files: `terrain/` defs (see `terrain/AGENTS.md`), `game/terrainEffects/` (wear precedent in `thorns.ts`), new `game/terrainEffects/briar.test.ts`.

- [x] Briar: terrain that blocks movement, has health, can be targeted/damaged, and becomes Tangle when destroyed.
  - New `TerrainType.Briar = 10` (runtime-only, blocks movement and projectiles, not vision/light) driven by a generic `TerrainProperties.durability` (30 health, `becomes: Tangle`). `TerrainManager` API: `placeBriar(tiles)` (Step 3 entry point: returns the tiles that became Briar; skips rock/water/off-grid/existing Briar), `damageDurableTerrain(col,row,dmg,src?)`, `damageDurableTerrainByHits`, `getDurableTerrainHealth`. Logic in new `terrain/durableTerrain.ts`. Projectiles with `rockHitsToBreak` also chip the Briar they stop at.
- [x] Tangle: a `variantOf` Thick Grass with a much lower speed multiplier and `blocksProjectiles`; each stopped projectile adds wear (`THORN_HITS_TAKEN_PARAM` pattern); after 3 it becomes Grass.
  - `TerrainType.Tangle = 11` (speed 0.3, `variantOf: ThickGrass`) with generic `projectileWear { hits: 3, becomes: Grass }`; wear is a countdown in the floor tile's `destructible` (kind `wear`), hooked into `Projectile`'s wall-stop branch via `wearTerrainByProjectile`. Beams do not wear it.
- [x] Health and wear are serialized and in the checkpoint fingerprint.
  - State lives in floor-tile `destructible`, so it serializes with `floorTiles` (round-trip tested). It is not mixed into the event-based runtime fingerprint, same as rock/water (terrain changes emit no fingerprint event); add a mix in `engineEventWiring.ts` if Step 18 finds a desync need.
- [x] Tests: Briar destroyed → Tangle; three projectiles → Grass; movement cost on Tangle.
  - `game/terrainEffects/briar.test.ts` (11 tests, incl. real-projectile wear and serialization round-trip). Also extended the renderer layer order, ascii, preview priority and editor colour tables for the new types. Renderer art is plain fills for now.

### Step 5 — Burrow and resprout phase transition preset

Files: `game/units/components/phaseDef.ts` (transition presets), the phase runner, new `game/phaseBurrow.test.ts`.

- [x] Verify whether `invulnerableSeconds` also clamps the hit that crossed the threshold. If not, add a phase option that clamps that hit to the threshold, so a burst cannot skip a phase. Record the finding in a one-line comment on the option.
  - It does not (invulnerability starts after the crossing hit lands in full). Added `UnitPhaseDef.clampHitAtThreshold` (finding commented on it); `clampHitAtPhaseThreshold` in `phaseRuntime.ts` runs from `UnitManager.processPhaseTriggers` on `damage_taken` (HP already reduced, death not yet applied), restoring HP to exactly the threshold, so a would-be kill survives. Only the next unentered phase clamps.
- [x] Add a `burrow` transition preset: close (callback), sink with a ground mask, travel along a burrow trail to a chosen point, rise. Point choice is a pluggable rule; ship `farthestFromParty` filtered by a min distance from given exclusion zones.
  - `transition: burrowPreset({ closeSeconds, sinkSeconds, travelSeconds, riseSeconds, sproutPoints, pointRule?, minDistanceFromExclusions?, exclusionZones?, exclusionSources?, callbacks? }, banner?)` in `phaseDef.ts`; runtime in new `phaseBurrow.ts` (serialized `ActiveBurrow` as `phaseBurrow` on the unit JSON, tick-time clocks). Registries by id: `registerSproutPointRule`, `registerSproutExclusionSource` (dynamic zones, e.g. old Briar), `registerBurrowCallback` (run when a stage begins, e.g. close the Shell). Unit is Invincible and `controlled` (cannot act) for the whole burrow; abilities interrupted at start. `getBurrowVisual(phaseState, tickTime)` returns stage/progress/depth/trail for the renderer; the ground-mask drawing itself is not built.
- [x] Tests: crossing 75% with a large hit leaves health at exactly 75%; the unit is untargetable during the transition and ends at a valid sprout point.
  - New `game/phaseBurrow.test.ts` (11 tests, green) plus existing `phase.test.ts` still green; lint clean on touched files.

Notes for later steps: Step 8 should author `sproutPoints` (world px, passable cells), set `clampHitAtThreshold: true` on the 75/50/25% phases, register an exclusion source for old Briar and a close callback for the Shell. `farthestFromParty` relaxes exclusion zones if they rule out every candidate (it still needs a passable point), and keeps the unit in place if none is passable. The renderer does not yet draw the ground mask or trail (read `getBurrowVisual`).

### Step 6 — Fused body (destructible seed)

Files: new `game/units/fusedBody.ts` (or a CastBehaviour if the abilities layer fits better; decide and note why), Pod Mortar seed unit def, new `game/fusedBody.test.ts`.

- [x] Generic "fused body": a small unit with health, a fuse duration, an effect on expiry and an effect on death. Health uses `getEnemyHealthMultiplier(playerCount)`.
  - Built as a unit **component** (`fusedBody`, in `game/units/components/fusedBodyComponent.ts` + `fusedBodyHooks.ts`), not a CastBehaviour: the seed is a targetable unit that lives several ticks and serializes with the unit; the CastBehaviour's job is only to lob (spawn) it. Effects are named (`effectId` + numeric `params` + render `visuals`) and resolved from a registry (`registerFusedBodyEffect`); built in: `none`, `areaDamage` (`params.damage` to living enemies within `options.radiusPx`). Fuse counts world seconds. `spawnFusedBody(engine, { characterId, x, y })` / `buildFusedBodySpawn` in `fusedBodySpawn.ts` spawn it with `scaledFusedBodyHp`. Unit def `pod_seed` (base 20 hp, fuse 5 s, radius 96 px, burst 12 dmg are placeholders for Step 7 to tune). Added EventBus event `fused_body_telegraph_started`.
- [x] The fuse exposes its telegraph window (last 1.5 s) so Step 10 can put a reaction frame on it.
  - For Step 10 and the renderer: `getFusedBodyStatus(unit)` (`telegraphing`, `remaining`, `elapsedInTelegraph`, `area`), `fusedBodyTelegraphArea(unit)` (the burst circle, only while telegraphing; check players against this), and the one-shot event `fused_body_telegraph_started` `{ unitId, x, y, radiusPx, secondsLeft }` emitted on the tick the window opens (that tick is the reaction frame). It fires inside the component tick (nest phase), so Step 10 should subscribe to the event or add its frame check after `runUnitComponentTick`. Window length is `FUSED_BODY_TELEGRAPH_SECONDS` (per-def `telegraphSeconds` override). The renderer does not draw the red ring yet.
- [x] Tests: expiry triggers the burst; killing it first triggers the fizzle and no damage; health scales with player count.
  - `game/fusedBody.test.ts` (5 tests: burst, fizzle, health scaling, telegraph window/event, serialization round-trip) passes; `unitDefRegistry.test.ts` and `unitComponent.test.ts` still pass.

### Step 7 — Five node kinds and the Garden Heart unit

Files: new `card_defs/` folder for the Garden Heart abilities (next free enemy number; register in `AbilityRegistry`), unit defs for Heart, Thornspitter, Pod Mortar, Mender Bloom, Hive Gourd, Creeper, AI in `game/units/unitAI/gardenHeart/`, tests next to each ability.

- [x] Thornspitter: two quick fans of three slow thorn projectiles at a player.
  - Done: ability `1601` Thorn Fans (`card_defs/16_enemy_garden_heart/1601_ThornFans`; new ability group `EnemyGardenHeart = 16`, ids `1601`-`1604`, all numbers in `gardenHeartConstants.ts`). Aim 0.7 s, then fan 1, a 0.45 s gap, fan 2; each fan is three `ProjectileLaunch` entries with `withAimOffset` (-16/0/+16 deg). Plain default projectile visual (placeholder).
- [x] Pod Mortar: lobs a fused body (Step 6) with 5 s fuse, 1.5 s red telegraph.
  - Done: ability `1602` Lob Seed: 0.9 s windup, then `spawnFusedBody(engine, { characterId: 'pod_seed', x, y, teamId })` at the aimed point (the engine clamps aim to range 380). Fuse, telegraph and burst stay on the `pod_seed` def (Step 6); reaction frame hook is Step 10's.
- [x] Mender Bloom: rooted area heal on nearby nodes, Shelled ones and the Heart included.
  - Done: ability `1603` Mend (targetless): 1.2 s windup, then `applyHeal` (12, no injury penalty) to every living friendly unit with a `nodeTree` slice within 220 px (`nodesInMendReach`), caster excluded. AI `canUse` only when a node in reach is hurt.
- [x] Hive Gourd: capped spawner reusing `spawnerCore.ts` / `buildNestSpawnContext` with `swarmling` and `slime`.
  - Done: new generic `spawner` unit component (`game/units/components/spawnerComponent.ts` state, `spawnerHooks.ts` tick; options `{ spawnerId, maxChildren, intervalSec, burstCount }`, spec registered by id with `registerSpawnerSpec`). The Gourd's spec (`hiveGourd`, in `card_defs/16_enemy_garden_heart/gardenHeartRegistrations.ts`) alternates swarmling / slime, cap 4, one per 6 s. While at the cap the timer is held one interval ahead, so a kill starts a fresh wait. Registered in `builtinComponents.ts` and the hook table; serializes as `spawnerSpawnedIds` / `spawnerNextSpawnAt`.
- [x] Creeper: runner vine that lays `dark_thorn` for 4-6 tiles, then retracts.
  - Done: ability `1604` Runner Vine using the new generic cast behaviour `CastBehaviours.GroundTrail` (`abilities/CastBehaviours/GroundTrailBehaviour.ts`): rolls 4-6 tiles once per cast from `generateRandomInteger`, lays one `dark_thorn` tile at a time along the aim over 1.6 s (payload serialized), then a render-only 0.8 s "retract" interval; the thorns stay 24 s.
- [x] Heart and Knots carry Step 1's reduction with condition `hasLivingChildren`; their Shell opens visually on `onLastChildDied`.
  - Done: new def field `UnitDefEntry.flatDamageReductions` (copied onto `Unit.flatDamageReductions` in the constructor via `getUnitFlatDamageReductions`); every node kind and the Heart sets `[SHELL_REDUCTION]` and declares `nodeTree` with `onLastChildDied: 'gardenShellOpen'` (registered in `gardenHeartRegistrations.ts`; plays a lilac pulse). The Shell state is derived (`!hasLivingChildren`); no custom shell sprite yet.
- [x] Bud movement on a leash (tether max length), Knots stationary, Mender Bloom never moves.
  - Done: new AI tree `gardenNode` (`game/units/unitAI/gardenNode/`, idle -> attack, registered in `unitAI/index.ts` + `contextTypes.ts`): `canNodeMove(unit)` = speed > 0 and no living children, so Knots hold still, Buds drift to keep range (the nodeTree leash clamps them), Heart and Mender Bloom have speed 0. Nodes with no abilities (Heart, Hive Gourd) just wait.
- [x] Phase tree layouts are data (one table per phase), matching browser plan 0008 "Node kinds": P1 one Thornspitter Bud; P2 Thornspitter + Pod Mortar; P3 Hive Gourd Knot -> Thornspitter Bud, Creeper Knot -> Mender Bloom Bud; P4 a mix with two extra Pod Mortar Buds on the Heart.
  - Done: `game/gardenHeart/gardenTreeLayouts.ts` (`GARDEN_TREE_LAYOUTS`, polar offsets from the parent; P4 = Hive Gourd Knot [Thornspitter, Pod Mortar], Creeper Knot [Mender Bloom, Thornspitter], two Pod Mortar Buds on the Heart). Engine entry points in `game/gardenHeart/growGardenTree.ts`.
- [x] Ability tests per kind (headless), one behaviour each, no number-tuning assertions.
  - Done: `game/gardenHeart/gardenHeart.test.ts` (24 tests): registration, Shell on every node, one test per kind, movement rule, layouts match the design, grow/dismiss/Briar. `unitDefRegistry`, `AbilityRegistry`, `spawnerCore`, `nodeTree`, `fusedBody`, `tether` suites still green; tsc has only the known error; eslint clean on touched files.

**Notes for Step 8 (and 10):**

- **Grow a phase's tree:** `growGardenTree(engine, heart, phase /* 1-based */, { at? })` (`game/gardenHeart/growGardenTree.ts`) spawns each node of that phase's layout around the Heart (or `at`), links it with a Stem tether (leash `STEM_LEASH_PX`, 6 tiles), returns the units by layout key. Nodes are nudged to the nearest passable tile (3-tile search); health is scaled by `getEnemyHealthMultiplier(engine.enemyScalingPlayerCount)`. Call it for phase 1 at mission start (after spawning the Heart from `ENEMY_GARDEN_HEART`, `unitAITreeId: 'gardenNode'`, `UnitTag.Boss`).
- **Retreat wiring is already registered:** burrow callback ids `gardenDismissTree` (`GARDEN_DISMISS_TREE_CALLBACK_ID`, kills the whole old tree so its Stems become Briar) and `gardenGrowTree` (`GARDEN_GROW_TREE_CALLBACK_ID`, grows layout `phaseState.index + 1` at the Heart's new spot). Use `burrowPreset({ ..., callbacks: { sink: 'gardenDismissTree', rise: 'gardenGrowTree' } })` on the 75/50/25% phases with `clampHitAtThreshold: true`. The burrow callbacks themselves are NOT covered by a test yet (only the functions they call); Step 8 should cover one retreat end to end. Register your own exclusion source for old Briar and a sprout-point list.
- The Heart def is `garden_heart` (hp 300 placeholder, `Colossal`, tags Boss + Structure, nodeTree + Shell, no abilities). It has no `phases` yet: Step 8 adds `phases` on the def (or via the boss setup). Boss setups should scale its health like other bosses.
- All six defs use the sprite `curling_vines` as a placeholder (no custom art, no shell/ground-mask rendering). Colours are the Nightbloom pair via `NIGHTBLOOM_PRIMARY` / `NIGHTBLOOM_SECONDARY` (ability icons, pulses).
- Registration of the family's hooks (Hive spawner spec, `gardenShellOpen`, the two burrow callbacks) lives in `card_defs/16_enemy_garden_heart/gardenHeartRegistrations.ts`, imported for side effects by `abilities/AbilityRegistry.ts`; anything that builds a battle already loads that registry.
- Step 10: the Lob Seed ability itself is not Reactable (the seed's fuse is: `reactable: true` on `pod_seed`). The resprout eruption is not built; if Step 10/8 wants one it can be a `gardenGrowTree`-adjacent burst or a phase `worldEffects` entry.
- Knots currently also spawn their own Stem tether; a Knot's Stem blocks walking like a Bud's. Spawned Hive Gourd children use the `hunt` AI and do not count as tree children (they are not under the Gourd's `nodeTree`).

### Step 8 — The Garden Heart mission

Files: `storylines/WorldOfDarkness/missions/020_garden_heart.ts`, `castle/castleBosses.ts`, the two new segments if they are not yet stitched, mission tests.

- [x] Stitch the 2×2 arena (`62_47`, `63_47`, `62_48`, `63_48`) and author sprout points per segment.
  - Done: `020_garden_heart.ts` rooms are the four segments (2x2, north-west first); `mapNode` pinned at (62.5, 47) so the Mission Map layout did not move. Sprout points are authored per segment in segment-local cells (`GARDEN_ARENA_SPROUT_SEGMENTS`, two per segment) in `card_defs/16_enemy_garden_heart/gardenHeartPhases.ts` and converted to world px (`GARDEN_SPROUT_POINTS`); the mission test checks each lands on passable ground at the right global cell.
- [x] Replace the Alpha Wolf placeholder with a `boss: { kind: 'custom', ... }` Garden Heart setup: four phases at 75/50/25%, `burrow` transitions, old tree dies to Briar on retreat.
  - Done: `gardenHeartBossSetup` (`castle/castleBosses.ts`) spawns `ENEMY_GARDEN_HEART` (health scaled by the normal mission enemy spawn) and a new `CastleBossSetup.onMissionStart(engine)` hook calls `growGardenTree(engine, heart, 1)`. Phases live on the `garden_heart` def (`phases: GARDEN_HEART_PHASES`; phases are def data, so the arena's sprout points are in the def, not the mission): 75/50/25% with `clampHitAtThreshold`, `burrowPreset` with `callbacks: { sink: gardenDismissTree, rise: gardenGrowTree }`, exclusion source `gardenBriar` (registered in `gardenHeartRegistrations.ts`: every Briar tile is a zone) and min distance 2 tiles. Escort dropped: new spawn preset `castle_boss_alone` (no wolf). `defineCastleMission` now takes and forwards `startRewards` (Garden Heart: `knowledgeKeys: [KNOWLEDGE_REACTIONS]`).
  - **Resprout eruption (reusable burrow option):** `BurrowTransitionDef.eruption?: { radiusPx, damage, reactable?, label? }` (`phaseDef.ts`, runtime in `phaseBurrow.ts`). At the start of the `rise` stage it calls `requestReactionFrame` with a circle at the sprout point; the rise IS the telegraph (1.5 s) and the burst lands on everything still inside when the rise ends (plus a Pulse effect). `ActiveBurrow.eruptionRadiusPx` is serialized so the renderer can draw the telegraph circle from `peekPhaseState(unit).burrow` (centre `toX/toY`, radius `eruptionRadiusPx`, only while `stage === 'rise'`; `getBurrowVisual` does not carry it yet). Garden numbers (3 tiles, 10 dmg, label `garden_eruption`) are placeholders in `gardenHeartPhases.ts`.
- [x] Mission test: loads, spawns the Heart with the phase-1 tree, segment coords line up (see `map-segments`).
  - Done: `storylines/WorldOfDarkness/missions/castle/gardenHeartMission.test.ts` (5 tests green): arena layout and start grant, sprout cells passable and aligned to the composed placements, Heart on the boss POI with exactly the phase-1 tree and no escort, an end-to-end retreat at 75% (clamped to exactly 75%, old tree dead, Briar laid, Heart at a sprout point, exactly the phase-2 tree linked under it), and the eruption as a reaction frame (`garden_eruption`, pass is free) whose burst lands. `castlePath.test.ts` updated (the Garden Heart is no longer a placeholder wolf mission). Lint clean on my files; tsc shows only the known error.

### Step 8a — Garden Heart rendering

Files: `game/GameRenderer/` renderers (unit, effect and ground layers), the Garden Heart unit defs' visuals, renderer tests if a pattern exists.

- [x] Burrow: draw the ground mask while the Heart sinks and rises, and the burrow trail while it travels, from `getBurrowVisual(phaseState, tickTime)` (Step 5).
  - Done: pure `resolveBurrowRender(unit, tickTime)` in new `game/units/unitRenderOptions.ts` (wraps `getBurrowVisual`; adds `sinkY`, `groundLineY`, dirt colour). `UnitRenderer` reuses the drowning clip for it (`getBurrowSinkState`), so the body slides below the ground line; new `GameRenderer/renderers/UnitGroundMarkRenderer.ts` (z 9, wired in `GameRenderer.ts` with the units layer) draws the dark hole + dirt lip while sinking/rising and the churned trail plus a moving mound while travelling. Works for ANY unit mid burrow transition; colours come from `UnitDefEntry.renderOptions.burrow.dirtColor`.
- [x] Pod Mortar seed: draw the red blast circle for the last 1.5 s of the fuse (`fusedBodyTelegraphArea` / `getFusedBodyStatus`, Step 6), plus a short fizzle when it dies early.
  - Done: `resolveFusedBodyTelegraph(unit)` (red circle, inner fill growing to the burst edge) drawn by `UnitGroundMarkRenderer` for any unit with the `fusedBody` component; colour via new optional `FusedBodyOptions.telegraphColor` (default red). Fizzle is data on `pod_seed`'s `onDeath.visuals`: a small Nightbloom `Pulse` ring beside the existing puff.
- [x] Shell: a closed plated look on the Heart and Knots while `hasLivingChildren`, and an open core once their last child dies, in the Nightbloom palette (see `gh-heart-pod`, `gh-shell`, `gh-kit` in `app/js/components/minionBattlesHomePage/Ideas/fxArt/gardenHeartArt.tsx`). Keep it a reusable render option on the def, not Garden-Heart-specific code in the renderer.
  - Done: new def field `UnitDefEntry.renderOptions: UnitRenderOptions { plated?, burrow? }`; `plated` = closed while any of the unit's flat damage reductions is active (so `hasLivingChildren` drives it, no Garden-specific check), open otherwise (`resolvePlatedLook`). Painter `syncPlatedLook` / `drawPlatedLook` (`renderers/unitRenderOptionsVisual.ts`) adds a child Graphics to the unit visual (so it sinks and clips with the body): rim spikes, two plates, glowing seam when closed; plates swung apart round a pulsing lilac core when open (art `gh-heart-pod`). All six node defs share `GARDEN_NODE_RENDER_OPTIONS` (`gardenHeartConstants.ts`: plate `#134e4a`, core `#e9d5ff`). Tests: `game/unitRenderOptions.test.ts` (6 green); lint clean, tsc only the known error. Not viewed in a browser. Resprout eruption: `resolveBurrowRender(...).eruption` (set only while `stage === 'rise'` and the burrow carries `eruptionRadiusPx`) is drawn by `UnitGroundMarkRenderer` as the same red ring + growing fill at `toX/toY`, generic for any burrower. For Step 8 / later art: the placeholder `curling_vines` sprite still sits under the plated overlay; the overlay scales with `unit.radius`.

## Part B — Single-player Reactions

### Step 9 — Reflex resource

Files: new `resources/Reflex.ts`, `resources/resourceIds.ts`, `resources/createResourceFromId.ts`, `resources/resourceDisplayDefs.ts`, new `resources/Reflex.test.ts`.

- [x] `Reflex` resource: start 1, max 1, `onRoundStart` recovers 1. Icon and colour per `resourceDisplayDefs`. Constants `REFLEX_START`, `REFLEX_MAX`, `REFLEX_PER_ROUND`.
  - Added `resources/Reflex.ts` (id `reflex`, pips bar, Zap icon, violet `#c4b5fd`), registered in `resourceIds.ts`, `createResourceFromId.ts`, `resourceDisplayDefs.ts`.
- [x] Every player unit gets Reflex in battles where its owner knows Reactions (Step 11 provides the flag; until then gate on a parameter so tests can set it).
  - `attachReflexIfKnown(unit, eventBus, knowsReactions)` is called in `BaseMissionDef.initializeGameState` right after `attachResourcesForAbilityCosts`, with `playerKnowsReactions(engine, pu.playerId)`.
  - **Step 11 hook:** `playerKnowsReactions` in `resources/Reflex.ts` is now a re-export of Step 11's `game/reactions/playerKnowledge.ts` version (one source of truth; done in Step 10). The mission-start knowledge grant must set that flag before `initializeGameState` reaches the player loop, or Reflex will not be attached for the grant fight. `buildTinyBattleEngine` does not attach Reflex yet; Step 18/10 tests can call `attachReflexIfKnown(unit, bus, true)` directly.
- [x] Tests: spend to 0, round start back to 1, never above max, serialization round-trip.
  - `resources/Reflex.test.ts` (4 tests) plus the existing `createResourceFromId.test.ts` pass.

### Step 10 — Reactable flag, reaction frame and the pause

Files: `abilities/abilityTimings.ts` (`reactionFrame` on `AbilityTimingInterval`), `abilities/Ability.ts` (`reactable` flag), `game/units/unitAbilityTick.ts` (frame detection), `game/orderPause/OrderPauseController.ts` / `GameEngine.ts` (new `requestReactionPause`), `game/managers/OrderManager.ts` (reaction decision), `game/types.ts` (`WaitingForOrders.planeId`, per-waiter `reason`), new `game/reactionPause.test.ts`.

- [x] `reactionFrame?: { at: 'start' | 'end' }` on an interval, valid only on abilities with `reactable: true`. The telegraph area the frame checks against comes from the interval's existing telegraph/hitbox data.
  - Done: `AbilityTimingInterval.reactionFrame?: { at, area(ctx) }` plus `AbilityStatic.reactable`; `validateReactionFrames(id, reactable, entries)` throws otherwise. The area is an explicit resolver (no generic telegraph data exists): `ReactionArea` = `circle` or `lanes` (segments + half-width), in `game/reactions/reactionFrame.ts`.
- [x] When an enemy's interval reaches its frame, collect player units that know Reactions, have ≥ 1 Reflex and are inside the telegraph, and add each as a waiter via the same deferred-pause path as `requestMidCastOrderPause` (so it merges with any other pause that tick).
  - Done: one generic entry point `requestReactionFrame(engine, { sourceUnitId, area, label })` (`game/reactions/reactionFrame.ts`): collects hostile-to-source player units that pass `unitCanReact` (knows Reactions via `playerKnowsReactions`, alive, Reflex >= 1) and are in the area, sets `reactionPending`, and calls `engine.requestReactionPause` (same deferred path as `requestMidCastOrderPause`). `unitAbilityTick` calls it for Reactable intervals; `engineEventWiring` calls it on `fused_body_telegraph_started` for fused bodies with `reactable: true` (pod_seed has it). **Step 8 must call `requestReactionFrame` for the resprout eruption** (not built yet).
- [x] Mark each such unit with a serialized `reactionPending` (ability id + caster id); the decision runs in `OrderManager` beside `applyConditionalCancelDecision`: `wait` clears it for free; any castable ability spends 1 Reflex, cancels the unit's current cast with the same refund rules, and queues normally.
  - Done: `Unit.reactionPending { abilityId, casterId }` lives on the UNIT (serialized in unit JSON, not on the waiter; `tutorials/reactionPauseQuery.ts` updated to read it). Decision in `OrderManager.resolveReactionIfNeeded` (runs in `applyOrder` and `applyOrderLogic`, only for confirmed `endTurn: true` orders so drafts never spend Reflex): `wait` free; a castable ability (`canUseAbilityNow`) spends 1 Reflex, cancels every running cast with `refundAbilityCost`, clears pending; no Reflex / not castable is rejected and the unit stays pending.
- [x] Add a deterministic `planeId` to `WaitingForOrders` (per-battle counter in engine state); include it and the waiters' `reactionPending` in serialization and the checkpoint fingerprint (`game/Fingerprint.ts`).
  - Done: `WaitingForOrders.planeId = `${atTick}:${GameState.pausePlaneCounter}`, counter bumped per committed plane, serialized (`pausePlaneCounter`, omitted when 0) and restored; reset in `prepareForNewGame`. Unit JSON carries `reactionPending`, so checkpoints include it. A reaction waiter also counts as a mid-cast pause (ITS freezes on it, no coop-cancel). The runtime event fingerprint mixes `reaction:<abilityId>` when an action decision resolves.
- [x] Flag Crystal Laser (`1490`) Reactable with a frame at the start of its aim window; flag the Pod Mortar burst (fuse telegraph start) and the resprout eruption.
  - Done: Crystal Laser `reactable: true`, frame `at: 'start'` of the `aim` window (the Time Stop has just ended, players thawed; covered by a test in `courtMagician.test.ts`). Area = rays from the wall slots toward the tracked player (`crystalLaserReactionArea`, lane half-width 24 px). Pod Mortar seed flagged via `FusedBodyOptions.reactable`. Resprout eruption: left for Step 8 (see above).
- [x] Tests: two players, one in the telegraph, one out → one waiter; no knowledge or 0 Reflex → no pause; pass costs nothing; acting spends 1 and cancels the current cast; two Reactable frames on one tick → one plane; plane id is stable across a save/load.
  - Done: `game/reactionPause.test.ts` (8 tests) covers each case; the plan-id test round-trips through `GameEngine.fromJSON`. `conditionalCancel`, `coopTeamworkPause`, `snapshotLoad`, `Unit`, `fusedBody`, `Reflex`, court magician and tutorial tests still pass.

### Step 11 — Per-player Reactions knowledge in the engine

Files: `game/battleBootstrap.ts`, the engine/player state that receives it, `storylines/BaseMissionDef.ts` or the mission-start path, `app/js/accountKnowledge.ts`, `backend/TutorialKnowledge.php` or the knowledge grant path, tests next to `battleBootstrap.test.ts`.

**Query for Steps 9/10/14:** `playerKnowsReactions(engine, ownerId)` in `game/reactions/playerKnowledge.ts` (accepts the engine or any `{ playerKnowledgeKeysByPlayer }`; `ownerId` is the unit's player id, false for enemies/null). Generic form: `playerHasBattleKnowledge(engine, playerId, key)`. Step 9: replace the placeholder parameter gate with `playerKnowsReactions(engine, unit.ownerId)` when giving player units Reflex (note Reflex must be added after `engine.playerKnowledgeKeysByPlayer` is set, which `sessionLoad` does before `mission.initializeGameState`).

- [x] Add knowledge key `Reactions` to `accountKnowledge.ts`.
  - Added `KNOWLEDGE_REACTIONS` plus registry entry (type systems, tier 3) and `BATTLE_ENGINE_KNOWLEDGE_KEYS` (the keys copied into engine state; mirrored in new `backend/BattleKnowledge.php`, sync-tested).
- [x] Pass each player's knowledge of `Reactions` into battle bootstrap (follow the `darknessUpgradeBonuses` precedent) and store it per player in serialized engine state. Step 9 and 10 read it from there.
  - New `GameState.playerKnowledgeKeysByPlayer` (serialized/restored in `engineSerialization`, `SerializedGameState`, `GameEngine` accessor). Source: server merges owner-account engine keys into the game state as `playerKnowledgeKeysByPlayer` (`LobbyManager::mergePlayerEquipmentIntoState`); `sessionLoad` resolves it (plus start grants) via `resolvePlayerKnowledgeKeysByPlayer`; `BattleSessionLoadArgs`/`runBattleBootstrap` take an optional override.
- [x] Add a mission-start knowledge grant (`startRewards.knowledgeKeys` or similar on the mission def, mirroring `completionRewards.knowledgeKeys`). The Garden Heart grants `Reactions`. The grant both persists to the account and sets the engine flag for this battle, so the mechanic works from this fight's first reaction frame. Investigate whether the server needs a new endpoint or can reuse the completion-grant path; pick the simplest that is idempotent.
  - Added `startRewards?: { knowledgeKeys }` on the mission config (`storylines/types.ts`). Engine flag: `sessionLoad` unions it into every player's keys. Persistence: needed a new endpoint (completion path is victory-only): `POST /api/account/battle-start-knowledge` (`GrantBattleStartKnowledgeHandler`, allowlist `BattleKnowledge::START_GRANTABLE_KEYS`, idempotent), called by each client in `runBattleBootstrap` after load for itself. NOT yet set on the Garden Heart mission: `020_garden_heart.ts` goes through `defineCastleMission` which does not forward the field; **Step 8 must pass `startRewards: { knowledgeKeys: [KNOWLEDGE_REACTIONS] }` through `defineCastleMission` to the mission def.** Known edge: the server-read account keys can differ between clients only if a grant lands mid-lobby-load; the mission start grant makes the Garden Heart immune to that.
- [x] Tests: bootstrap with and without the key; a mission with a start grant sets the flag on every player.
  - `game/reactions/playerKnowledge.test.ts` (8 tests: with/without key, start grant on all players, engine-key filtering, checkpoint serialization, PHP allowlist sync). Resolution tested as a pure function since the bootstrap test uses stubs.

### Step 12 — Reactions tutorial

Files: `tutorials/tutorialTypes.ts` (new trigger), `tutorials/tutorialLogic.ts`, `storylines/WorldOfDarkness/tutorials.ts` (or the storyline that owns Chapter 3), `storylines/tutorialRegistry.ts`, `ui/pages/battlePhase/useBattleTutorial.ts`, `tutorials/tutorialLogic.test.ts`.

- [x] New trigger `reactionPause`: fires when the local player is a waiter with `reactionPending`, in any mission.
  - Trigger in `tutorialTypes.ts`/`tutorialLogic.ts` (`TutorialBattleContext.reactionPause`); `useBattleTutorial` takes `localPlayerId` (passed from `BattlePhase`) and computes it via `isLocalPlayerInReactionPause(engine, playerId)` in new `tutorials/reactionPauseQuery.ts`. **Step 10 must provide:** `engine.waitingForOrders.waiters[i].reactionPending` (non-null) on each reaction waiter; that file is the only reader, change it there if the shape differs. Step 10 had not landed when this was built, so tests use a stub view.
- [x] Tutorial under knowledge key `Reactions`: point at the Reflex display, the reaction mark on the enemy timeline, and the ability bar; explain pass is free and acting costs 1 Reflex. Follow the writing style guide.
  - `TUTORIAL_REACTIONS` (`reactions_intro`, `pauseGame`, 3 steps) in `WorldOfDarkness/tutorials.ts`. Progress is under new `type: 'tutorial'` key `TutorialReactions` (`accountKnowledge.ts` + `backend/TutorialKnowledge.php`); new `TutorialDef.requiresKnowledge: 'Reactions'` gates it (Reactions itself stays out of the recordable keys). **Step 13 must register HUD anchors** `reflexDisplay`, `reactionMark`, `abilityBar` (ids added to `hudAnchors.ts`; missing anchors just show no pointer).
- [x] Tests in `tutorialLogic.test.ts`: triggers on the first reaction pause, never again once done.
  - New `reactions tutorial` describe block (trigger, knowledge gate, done, waiter query); with `tutorialKnowledgeSync.test.ts` and `tutorialRegistry.test.ts` green; eslint clean, no new tsc errors.

### Step 13 — Reactions UI

Files: the enemy battle timeline (where `TimelineCancelMark`s render), `abilities/abilityTimings.ts` (reaction marks), `ui/pages/battlePhase/BattleAbilityBar.tsx`, the player resource HUD, a unit test for the mark builder.

- [x] Reaction frame mark on the enemy timeline (red danger bars), with a tooltip: "Reactable: spend 1 Reflex to act here."
  - Pure builder `visibleReactionMarks` in `abilityTimings.ts` (0.1 s bar ending on the frame); `BattleTimeline` draws them as `ReactionMarkBar` on the Enemies row, only when the local player knows Reactions. The first mark registers the `reactionMark` HUD anchor. Fused-body seeds (Pod Mortar) have no timeline row, so they show nothing extra (the red ground telegraph is enough).
- [x] Reflex shown on the player's resource HUD.
  - Already listed by `UnitResourcePanel` (pips bar from Step 9); `ResourceBarRow` now registers the `reflexDisplay` anchor for the `reflex` row.
- [x] At a reaction pause, the ability bar shows a "Reaction" banner and the Reflex cost on each ability; Pass is labelled free.
  - `RowSlotAbilities` gets `isReactionPause` (from `BattleAbilityBar`: local waiter and unit `reactionPending`): banner, "1 Reflex" badge per card, Pass tooltip "let it land (free)"; the bar container registers the `abilityBar` anchor. Not changed: `getAbilityDisabledReason` does not know about Reflex, so cards are not greyed when Reflex is 0 (the engine rejects such orders).
- [x] Test the mark builder (pure function), as the existing cancel marks are tested.
  - `visibleReactionMarks` describe block in `abilityTimings.test.ts` (3 tests; file 150 green); eslint clean, no new tsc errors.

## Part C — Co-op Reaction claims

### Step 14 — Claim rule and claim state in the engine

Files: new `game/reactions/claimRule.ts` (`canClaimReaction`), `game/types.ts` (`WaitingForOrders.claims`), `game/orderPause/OrderPauseController.ts` (add a waiter to an open plane), `game/managers/OrderManager.ts`, new `game/reactions/claim.test.ts`.

- [x] `canClaimReaction(engine, unit)`: unit knows Reactions, has ≥ 1 Reflex, is not already a waiter, and a Reactable attack is in progress (any enemy active ability with `reactable` between cast start and its hit). Document that this last clause is the one to widen for "Reflex as an extra turn".
  - Done: `game/reactions/claimRule.ts`. Rule = `unitCanReact` + not already a waiter of the open plane + `findReactableAttackInProgress(engine, unit)` (the one clause to widen later). In progress = a hostile active ability with `reactable` whose cast elapsed is in `[0, total duration)`, or a hostile `reactable` fused body whose fuse outcome is still null.
- [x] `applyReactionClaim(planeId, unitId)`: engine-side, deterministic; rejects if the plane id does not match the open plane or the rule fails; otherwise adds the unit as a waiter with `reactionPending` and records the claim on the plane. Multiple claims per plane allowed.
  - Done: `applyReactionClaim(engine: EngineContext, planeId, unitId): boolean` in `claimRule.ts` (mutates the open plane in place: pushes a sorted waiter, sets `reactionPending` to the attack found, appends to `plane.claims`, mixes `reaction_claim:<planeId>` into the order fingerprint). Rejects on no plane / stale or missing `planeId` / unknown unit / rule failure. Lives in claimRule rather than OrderPauseController/OrderManager: it needs no controller state. Step 16 note: the plane is mutated in place, so a pending `onParallelBatchResolved` promise would still finalize; the host hold in `tryResumeParallel` must cover that.
- [x] Serialize claims; include them in the fingerprint.
  - Done: `WaitingForOrders.claims?: ReactionClaim[]` (`{ unitId, ownerId }`), written by `engineSerialization` (omitted when empty), parsed in `normalizeWaitingForOrdersFromJSON`, kept when the load path merges extra waiters. It is part of `toJSON`, so checkpoints/fingerprints cover it; the claimant's `reactionPending` is in unit JSON.
- [x] Tests: accept while a Reactable attack is in progress; reject without one; reject for a stale plane id; two claims on one plane both accepted; the plane resumes only when every waiter, claimants included, has an order.
  - Done: `game/reactions/claim.test.ts` (7 tests: accept, reject no attack, reject no knowledge/Reflex, stale id, two claims + resume only when all answered, claimant acting spends 1 Reflex, save/load). `reactionPause` and `conditionalCancel` tests still green; eslint clean, no new tsc errors.

### Step 15 — Claim endpoint and recorded stream

Files: `backend/Http/` (new handler), `backend/BattleStorage.php`, `game/battlenet/BattleNet.ts` (host-side caller), `game/BattleSession.ts`, PHP test under `backend/tests/`, `game/battlenet/BattleNet.test.ts`.

- [x] Design the endpoint (write the decision as a short comment block at the top of the handler): the host posts `{ planeId, atTick, unitId, playerId }`; the server appends it to the stream the engine replays (the applied-orders stream or a sibling record type read by the same merge), bumps the orders revision, and returns success or failure. It is not `submitOrder` and has none of its client-side early returns.
  - **Architecture decision (also the comment block at the top of `backend/Http/Handlers/Battle/AppendReactionClaimHandler.php`):** a claim is an ORDER ROW in the existing pending -> applied stream: finalized, at the plane's `atTick`, body `{ unitId, abilityId: 'reaction_claim', targets: [], endTurn: false, reactionClaim: { planeId } }` (builder/reader in `game/reactions/claimOrder.ts`, PHP mirror `BattleStorage::isReactionClaimOrder`). The normal host merge moves it to applied; every client, late joiner, resync and replay rebuilds it from the same `GET .../orders` read, and `appendOrder` bumps the orders revision so peers refetch. No separate claims store (it would need its own fetch/merge/replay/checkpoint path and could drift). Dedicated endpoint `POST /api/lobbies/{id}/games/{gameId}/orders/reaction-claim` body `{ hostPlayerId, playerId (claimant, owns the unit), atTick, planeId, unitId }` -> `{ success, idHash, rejectedReason? }`; host-only (`hostPlayerId` must be the lobby host). It reuses `AppendOrderAccept::tryAppend` (tick in past / ahead of host / unit owner windows) with a deterministic row id (`BattleStorage::reactionClaimIdHash`), so a repeat is one row and still `success`. `AppendOrderHandler` (`POST /orders`) now refuses claim rows. `BattleStorage::orderOverlayKey` gets a `reaction_claim` suffix so a claim never shadows (or is shadowed by) the same unit's real order at that tick.
- [x] Clients apply recorded claims through `applyReactionClaim` when merging, at `atTick`, so replays and late joiners rebuild them.
  - `sessionOrders.ts` (`applyRemoteOrdersFor` and `applyHeldRemoteOrdersFor`, the ITS-held path) routes a claim row to new `OrderManager.queueReactionClaim(atTick, planeId, unitId)` instead of `queueOrder`. Plane open with that `planeId` -> `applyReactionClaim` now; plane not formed yet (replaying client behind) -> held in `OrderManager.pendingReactionClaims` and drained by `drainReactionClaimsForPlane` when `OrderPauseController` commits the plane (before the plane is shown/checkpointed); closed plane or other plane id at that tick -> dropped. Idempotent (a claimant already a waiter fails `canClaimReaction`). `pendingReactionClaims` is runtime-only like `pendingOrders`: a checkpoint load skips rows at or before its tick and refetches the rest from the stream; the claim itself is in the checkpoint as `waitingForOrders.claims` + the claimant's `reactionPending` once applied.
- [x] Host never replies accepted before the endpoint returns success; a failure is a rejection.
  - **For Step 16:** `BattleNet.recordReactionClaim({ planeId, atTick, unitId, playerId }): Promise<boolean>` (host only; `playerId` = claimant). `true` = the row is durably in the stream AND already applied to the host engine (through `session.applyRemoteOrders`, the same path as a replay), so the host may now send `reaction-claim-result accepted: true`. `false` (not host, endpoint missing/failed/threw, accept window rejection such as `tick_in_past`) must be answered as a rejection; it never defers or retries a failed claim (a late claim could land after the plane closed). It does not touch `submitOrder`'s early returns. While the POST is in flight it registers in `hostUnackedAppends`, so a batch merge for that tick waits for it; **Step 16 must still hold `tryResumeParallel` for an undecided request** (the plane is mutated in place; a pending `onParallelBatchResolved` promise would still finalize). Host validation before calling it: `canClaimReaction(engine, unit)` and `plane.planeId === request.planeId` (use `engine.getUnit(unitId)`). `LobbyClient.appendReactionClaim` is the wire call (`BattleApi.appendReactionClaim?` is optional so partial API stubs compile). The recorded claim also reaches peers by the normal polling/`order-appended` nudge; mesh messages stay hints.
- [x] Tests: PHP test for append and revision bump; BattleNet test that a recorded claim is applied on merge at the right tick.
  - `backend/tests/ReactionClaimRecordTest.php` (record, revision bump, idempotent, coexists with the real order at the same tick, merge carries it to applied, tick-in-past rejected; `php` run green, existing overlay/revision PHP tests still green). `game/reactions/claimStream.test.ts` (4: wire helpers; claim row applied on the open plane once and never queued as an order; claim held for a not-yet-formed plane then applied when it commits; stale plane id dropped). `BattleNet.test.ts` gains 4 `recordReactionClaim` tests (success applies via session and never calls `appendBattleOrder`; failed endpoint -> false and nothing applied; throw -> false; non-host -> false). 149 tests green across BattleNet, reactions, reactionPause, conditionalCancel; eslint clean; no new tsc errors.

### Step 16 — Claim messages over the mesh and host sequencing

Files: `game/battlenet/types.ts` (new message kinds), `app/js/WebRtcLobbyMesh.ts` (routing only), `game/battlenet/BattleNet.ts`, `game/orderPause/OrderPauseController.ts` (`tryResumeParallel` hold), `game/battlenet/BattleNet.test.ts`.

- [x] Messages: `reaction-claim-request { planeId, atTick, unitId }` (claimant → host and peers), `reaction-claim-result { planeId, atTick, unitId, accepted }` (host → all). They are hints; state from Step 15 is the truth.
  - `ReactionClaimMessage` in `battlenet/types.ts`; mesh event type `reaction_claim` (`transient: true`, broadcast with `sendEventToAll`) via new hook `ui/pages/battlePhase/useReactionClaimMessages.ts` (`parseReactionClaimMessage`, stable `sendReactionClaimMessage`), wired in `BattlePhase` -> `useBattleSessionLifecycle` -> `createBattleNet({ sendReactionClaimMessage, hostPlayerId })`. `WebRtcLobbyMesh.ts` needed no change (it already routes arbitrary events). Results are only trusted from `hostPlayerId`; the sender id comes from the mesh, never from the payload.
- [x] Host: validate with `canClaimReaction`, call the endpoint, apply locally, send the result. While a request for the open plane is undecided, `tryResumeParallel` must not close the plane.
  - New `battlenet/ReactionClaimController.ts` (owned by `BattleNet`). Host `decide`: marks the claim undecided synchronously, judges with `session.evaluateReactionClaim` (pure `evaluateReactionClaimRequest` in `reactions/claimRule.ts`: planeId + atTick match, claimant owns the unit, `canClaimReaction`; a repeat of an applied claim answers accepted), calls `recordReactionClaim`, broadcasts the result, then `session.retryParallelResume()`. Hold: new `GameEngine.parallelResumeHold` (checked in `OrderPauseController.tryResumeParallel` right after `allReady`), set on the host in `sessionEngineBinding` to `netAdapter.isReactionClaimUndecidedFor(planeId)`. A host's own claim skips the network hop but goes through the same `decide`.
- [x] Peers: track pending claims per `planeId`; if they have played ahead past the plane and the claim is accepted, rewind to the plane (use the existing resync/rewind path; do not invent a new one).
  - Entries are keyed `planeId|unitId` (max 24, newest kept). An accepted result for a plane the local engine already ran past (not the open plane, `engineTick >= atTick`, claim never applied locally) calls the existing `requestResync('reaction-claim-played-ahead')`; the host recorded the row before replying, so the resync rebuilds it from the stream. "Applied" is tracked by new runtime-only `OrderManager.hasAppliedReactionClaim(planeId, unitId)`.
- [x] Claimant: give up on a rejection or on the close of the plane whose id matches. Ignore results for other plane ids.
  - New `GameEngine.onParallelPlaneClosed(planeId)` (fired in `finalizeResume`, wired in `sessionEngineBinding` to `BattleNet.handleParallelPlaneClosed`). On a matching close an own pending claim becomes `rejected` (or `accepted` if its row had been applied), another player's pending claim is dropped; other plane ids are ignored.
- [x] Tests: request then accept; request then reject; request arriving after close is rejected; two requests both accepted; a lost result is recovered from the merged state; a close of an earlier plane does not cancel a pending claim.
  - `game/battlenet/reactionClaimController.test.ts` (11 tests, real engine: all six cases plus the hold with the owner acting first, a rejected undecided request releasing the hold, results for other plane ids / non-host ignored, mesh link down sends nothing, played-ahead resync). With `BattleNet`, reactions, `reactionPause` and `conditionalCancel` tests green (160); eslint clean on touched files, no new tsc errors.

**Client API for Step 17** (all on `BattleNet`, `netRef.current`; ids are the open plane's `engine.waitingForOrders.planeId`):

- `requestReactionClaim(unitId): boolean` — sends a claim for the open plane. False (nothing sent) when no plane is open, the host link is down, the local engine says `canClaimReaction` is false (use `session.evaluateReactionClaim(planeId, atTick, unitId, localPlayerId) === 'ok'` for the button's enabled state, it is the same rule the host applies), or a live claim already exists.
- `getReactionClaimState(planeId, unitId): 'pending' | 'accepted' | 'rejected' | null` — null = never claimed. `rejected` means "Too late" (host refused, record failed, or the plane closed first). A pending claim whose row has since been applied reads `accepted` even if the result message was lost.
- `getReactionClaims(planeId)` / `getPendingReactionClaims(planeId): ReactionClaimEntry[]` (`{ planeId, atTick, unitId, playerId, state, own }`) — every tracked claim for the plane, own and other players'; pending ones for the plane HUD (the waiters list is `engine.waitingForOrders.waiters`, accepted claims are also in `waitingForOrders.claims`). Other players' pending entries disappear when their plane closes.
- `isHostLinkUp(): boolean` — mesh link to the lobby host is up (always true on the host; false when the mesh/`hostPlayerId` is not wired). `PeerLinkTracker` gained `isLinked(peerId)` and `subscribe`.
- Subscribe with `net.on('reaction-claims-changed', cb)` (payload `{ planeId }`, `null` for a host-link change); re-read the getters in the callback. Getters are silent (safe to call in render). A claim result can also change the plane (new waiter), which already re-renders the HUD via the normal `waiting_for_orders` / `pause_state` session events.
- Limitation: if the mesh is disabled (`ENABLE_WEBRTC_LOBBY` off) non-hosts can never claim (`isHostLinkUp()` false); the host always can.

### Step 17 — Claim button and visibility

Files: `ui/pages/battlePhase/` (claim button near the ability bar), the pause-plane HUD that shows who is being waited for, `app/js/WebRtcLobbyMesh.ts` (link state read), component test if a pattern exists.

- [x] "React" button for a player who is not a waiter, shown only while `canClaimReaction` is true; disabled with a tooltip while the mesh link to the host is down.
  - New `ui/components/ReactionClaimControls.tsx` (in `BattlePhase`'s `noticeSlot` column above the plaque): polls engine + `netRef` every 100 ms, button visible only for a non-waiter when `canClaimReaction(engine, localUnit)`; `offline` (disabled, tooltip) when `!net.isHostLinkUp()`; click calls `net.requestReactionClaim(unitId)`. Pure labels in `ui/pages/battlePhase/reactionClaimView.ts` (`computeReactionClaimButton`).
- [x] Pending, accepted and rejected states on the button ("Too late" for a rejection).
  - Button shows Claiming... / Claimed / "Too late" from `net.getReactionClaimState` (rejected only while the plane is still open; a closed plane hides it).
- [x] The plane HUD lists every waiter and every pending claim, for all players.
  - Same component lists every waiter and every pending claim ("Name: choosing / claiming", "(you)" for own) to all players, shown while a reaction waiter or pending claim exists (`buildReactionPlaneRows`). Tests: `reactionClaimView.test.ts` (6 green); eslint clean, no new tsc errors. Not browser-checked. Uses native `title` tooltips.

## Verification

### Step 18 — Final verification

Files: new AbilityTest scenarios under `testing/scenarios/` (see `ability-tests`), the browser plan.

- [x] AbilityTest scenarios (high level, deterministic):
  - Shell: hitting a shelled Knot does reduced damage, killing its Bud opens it.
    - Done: `garden_heart_shell` (general section Garden Heart, `testing/scenarios/general/gardenHeart.ts`): shelled Knot takes 25 -> 15 (resisted 10); after its Bud dies a 25 hit does the full 25.
  - Phase retreat: a large hit at the 75% threshold triggers the retreat, the old tree becomes Briar, the Heart resurfaces with the phase-2 tree.
    - Done: `garden_heart_phase_retreat` (real mission): big hit clamps to 75%, old tree dead, Briar laid, Heart at a sprout point with exactly the phase-2 tree.
  - Seed: a destroyed seed does not burst.
    - Done: `garden_heart_seed_destroyed`: seed killed before its telegraph, fuse time passes, outcome `killed` and the player is unhurt.
  - Reaction: a player inside a Pod Mortar telegraph is paused at the frame, acts, spends 1 Reflex; after a round it has 1 again.
    - Done: `garden_heart_reaction`: only the player in the telegraph is paused, acting spends 1 Reflex, round 2 restores it to 1.
  - Co-op claim: a second player claims during the attack, both act, the plane resumes after both orders.
    - Done: `garden_heart_coop_claim`: claim applied engine-side via `applyReactionClaim` (mesh/host round trip is not expressible in the headless harness; covered by `reactionClaimController.test.ts`); plane stays open after the first order, resumes after the second, both spend 1 Reflex.
- [x] Run the new scenarios and `npm run test:sim`.
  - The five `garden_heart_*` scenarios pass (`npx vitest run --project sim .../SimulationRunner.test.ts -t garden_heart`). The full `npm run test:sim` was not run (user asked for no full-suite runs); run it before merging.
- [x] Run the specific unit test files created by Steps 1–17 in one `npx vitest run <files>` call.
  - 41 files, 701 tests pass (all new files plus the touched BattleNet, reactions, castle mission, Court Magician, tutorial, bootstrap and timing suites).
- [x] `npx tsc --noEmit` (only the known pre-existing error) and `npm run lint:changed`.
  - `tsc`: only the known `defineDirectionalShield.ts` error (fixed one scenario type error). `npm run lint:changed` fails with "command line is too long" on this many files; every worker ran `npx eslint` on its own files instead.
- [ ] Manual browser checklist (two local accounts, see `session-testing`):
  - Fight the Garden Heart start to finish; the Shell numbers read as "not working"; Briar and Tangle shape the arena.
  - First reaction frame shows the tutorial once.
  - Second player claims at a reaction; both see the pending state; the host's result shows on both.
  - Drop the mesh link (disconnect one peer): the claim button disables.
- Follow-ups found during the work (not done):
  - Briar/Tangle health lives in floor tiles and is checkpointed, but is not mixed into the runtime fingerprint (Step 4 note).
  - The nav grid does not know living tethers: paths stall against a Stem instead of re-routing (Step 3 note).
  - Resisted hits skip the daylight sear puff (Step 2).
  - Art: Garden nodes use the `curling_vines` placeholder sprite under the plated overlay; Briar draws as a plain fill.
  - Eruption numbers (3 tiles, 10 damage) and seed burst numbers are placeholders.
  - `ReactionClaimControls` polls every 100 ms rather than subscribing to `reaction-claims-changed`.
- [ ] Mark finished items in the browser plan 0008 (items done, decisions recorded) and move this file to `docs/plans/done/`.
