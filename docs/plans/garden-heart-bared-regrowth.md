# Garden Heart: Bared windows, regrowth, the Gloam Lily and wild attacks — Implementation Plan

**Implemented 2026-11-20 (awaiting browser test):** Steps 1–13 and Step 14's scenarios and automated verification are done. The Heart is CC immune, Bared for 5 s at ×1.5 when its tree is gone, then regrows; node kills deal Severance; health comes from per-phase pools (35/60/160/240); Bloom Burst in P1, Gentle Pinwheel (1607) in P2–P3, Doubled (1609) in P4; the Gloam Lily (1606) drains light for good in P3–P4; dark wolves spawn by dark share from P2; every plant attack is Wild. Open: the manual browser checklist below and the open decisions. Follow-ups: (1) ~~engine bug: a cast opened between ticks could skip its start-0 interval on float rounding~~ fixed 2026-11-20: `enteredTimingIds`'s first-tick rule for start-0 intervals now allows 1e-9 of drift (`FIRST_TICK_EPSILON`); the Wild scenario's cast-before-tick-0 workaround is gone (Bloom Burst keeps its 0.2 s swell as a telegraph). Still open, rarer: a one-tick interval later in a mid-fight cast can be skipped when one tick's `nextElapsed` and the next tick's recomputed `prevElapsed` drift apart around its start (about 4 in 1200 start ticks in the test sweep; Spike Ring's 1/60 s fire window has that shape); (2) `garden_thorn` cannot spare Hive swarmlings/slimes, since thorn terrain filters by creature type, not kin; (3) a Bud whose Knot dies first can be regrown twice (Step 4 note).

Goal: make the stretch of each Garden Heart phase where the Heart is open worth fighting. When the last node of its tree dies, the Heart is **Bared** for 5 s and takes extra damage, while it spins a **Pinwheel** of thorns. Then the whole tree regrows. Killing nodes is the main way the Heart loses health (**Severance**), and hitting the Bared Heart is the bonus on top. A new node, the **Gloam Lily**, drinks the garden's light for good, and darkness lets a light trickle of dark wolves in. Every attack the plant makes is **Wild**: it hits the wolves too.

Design came out of a brainstorm on 2026-11-19. Background design: browser plan **0008 The Garden Heart: Reactions** (`docs/ideas/plans/0008_2026-11-15_garden-boss.md`) and the shipped plan `docs/plans/garden-heart-and-reactions.md`. This plan changes some of 0008's decisions (Briar during a phase, the Spike Ring's escalation); Step 13 records that in 0008.

**Working tree note:** several Garden Heart files have uncommitted edits at the time of writing (`growGardenTree.ts`, `phaseDef.ts`, `62_47_queens_garden.ts`, `020_garden_heart.ts`, `castleBosses.ts`, `gardenHeartMission.test.ts`, `TerrainManager.ts`). Build on the working tree as it is; do not revert or stash them.

## Plan-level decisions (locked)

**Vocabulary** (new terms; existing ones are Heart, Knot, Bud, Stem, Shell, Briar, Tangle)

- **Bared**: the Heart's state after its last node dies and before the tree regrows. Not "Exposed": `ExposedBuff` is the existing CC armour-break state (cannot act, +20% damage) and must never apply to the Heart.
- **Regrowth**: the whole tree coming back when a Bared window ends. **Trickle regrowth**: one missing node coming back on a slow timer while the Heart is still shelled.
- **Severance**: the damage the Heart takes when one of its nodes is killed.
- **Pinwheel**: rotating arms of thorns fired while Bared. Its settings are **presets** (Gentle, Doubled, Swift, Weave).
- **Wild**: an attack that hits every unit except the attacker's own kin (here, the plant).
- **Gloam Lily**: the new node kind that drinks light. **Drink Light** is its ability.

**The loop.** Shelled (cut nodes; each kill is Severance; trickle regrowth) → last node dies → Bared 5 s (+50% damage taken, Pinwheel or opening burst, timer ring, banner) → regrowth of the whole tree → Shelled. When the phase's health pool is gone the existing burrow retreat runs; it cancels any Bared window or pending regrowth.

**Assumption behind the health numbers:** a typical player hit is about 10 (Swing Sword 10, Strong Punch 10, SMG / Shotgun 10, Pistol 15), so about 15 on the Bared Heart. One player who gets to the Heart quickly lands about 3 Bared hits in the window (~45). A slow one lands 1–2 (~15–30). Every number below is a **base value for one player**; anything that is health or damage to the Heart scales with `getEnemyHealthMultiplier(playerCount)` (×N for N players), the same as the rest of the fight.

**Numbers**

| Thing | Value |
|---|---|
| Bared window | 5 s world time |
| Bared damage taken | ×1.5 (after attacker modifiers, before shields; Shell does not apply since nothing is alive) |
| Severance | 10 per node killed (×player multiplier); ignores the Shell and the Bared bonus; goes through the phase threshold clamp |
| Trickle regrowth | 1 missing node per 10 s while the Heart has at least one living node and at least one missing; parents before children |
| Heart CC | immune to stun, stagger, lift, knockback, interrupt-by-CC; never gains `ExposedBuff` |
| Spike Ring | no escalation; fires at the phase base rate only while shelled (P2 1, P3 1.5, P4 2 per round), never while Bared |

**Per-phase health pools** (base, one player; the Heart's max HP is the sum, 495, and the thresholds are worked out from the pools, not written by hand)

| Phase | Nodes per tree | Severance per tree | Pool | Bared attack | Efficient party | Slow party |
|---|---|---|---|---|---|---|
| 1 | 1 | 10 | **35** | Bloom Burst: one ring of 10 thorns, no Pinwheel | dies in window 1 (10 + 2 hits) | window 2 |
| 2 | 2 | 20 | **60** | Pinwheel **Gentle** | dies in window 1 (20 + ~40) | survives window 1, dies in tree 2 or window 2 |
| 3 | 5 (adds the Lily) | 50 | **160** | Pinwheel **Gentle** | 95 after window 1, 145 after tree 2, dies in window 2 | dies to tree 3's Severance |
| 4 | 8 (Lily replaces a Pod Mortar) | 80 | **240** | Pinwheel **Doubled** | 125 after window 1, 205 after tree 2, dies in window 2 | ~100 per wave, dies to tree 3's Severance (3 waves at most) |

Trickle regrowth in phase 4 adds a few extra nodes per tree, which is extra Severance, so it shortens the fight rather than stretching it. Mender Bloom still heals the Heart (12 per Mend, unscaled); that is a small push-back at higher player counts.

**Pinwheel presets** (all thorns: damage 3, radius 5, range 480 px, Wild; arms start at a random whole-degree angle from the engine RNG; one full Bared window = 5 s of firing)

| Preset | Arms | Turn rate | Fire interval per arm | Thorn speed | Counter-rotating arms | Used in |
|---|---|---|---|---|---|---|
| Gentle | 1 | 72°/s (1 turn per window) | 0.2 s | 110 px/s | 0 | P2, P3 |
| Doubled | 2, 180° apart | 72°/s | 0.25 s | 110 px/s | 0 | P4 |
| Swift | 1 | 144°/s | 0.15 s | 140 px/s | 0 | tuning only |
| Weave | 1 clockwise + 1 anticlockwise, start 180° apart | 72°/s each | 0.25 s | 110 px/s | 1 | tuning only |

**Bloom Burst** (phase 1's opening): one ring of 10 thorns as the Heart is Bared, speed 100 px/s, damage 3, range 480 px, Wild. Phase 1 only.

**Feedback**

- Timer ring: a thin (2 px) lilac (`NIGHTBLOOM_SECONDARY`, alpha 0.6) arc just outside the Heart's body, full at Bared start and draining clockwise from the top to empty when the tree regrows. Hidden otherwise.
- Banners (the same bold boss HUD text as "The Heart sinks into the ground..."): **"The Heart is bared!"** when the window opens and **"The Heart regrows..."** when it ends, 1.5 s each.

**Briar during a phase.** A node killed while its Heart can still regrow the tree **withers** (its Stem fades out, no Briar). Only the retreat (`dismissGardenTree`) turns Stems into Briar. Reason: with the tree regrowing every 5 s, Briar spokes would wall the Heart in within one phase. The old sites still keep their Briar and Tangle.

**Gloam Lily**

| Thing | Value |
|---|---|
| Unit | `gloam_lily`, hp 45, rooted (speed 0, no burrow hop, like the Mender Bloom), Shell + nodeTree like every node, Nightbloom look |
| Drink Light (`1606`) | windup 0.8 s (a lilac stream from the light to the Lily shows from the start), drinks at the end, cooldown 2.7 s: one drink per 3.5 s |
| Per drink | 1 light strength from the nearest lit light on the map (special-tile light or free light source, not `DarkLight`), any range |
| Lights | a light drained to 0 is out **for the rest of the battle**; no light comes back when the Lily dies |
| Budget | garden crystals are about strength 5 after `GARDEN_LIGHT_BOOST`, 14 lights in all; a Lily left alive for ~17.5 s puts one out |
| Layouts | P3: a fifth node, a Lily Bud on the Heart at 45°, `HEART_BUD_DISTANCE`. P4: the Lily replaces `heartMortarB` (225°) |

**Darkness spawns (kept light)**

- From phase 2 on (gated on the `gardenGrowthPhase` battle variable ≥ 2), a continuous spawn of `dark_wolf` (`hunt` AI) on fully dark tiles (`spawnBehaviour: 'anywhere', inDarkness: true`).
- Let `d` be the share of the arena's passable tiles that are fully dark, sampled when the spawn checks (not every tick).
- No spawns while `d < 0.15`. Otherwise one wolf every `lerp(2, 1, d)` rounds (2 rounds at the gate, 1 round fully dark), at most `1 + floor(2 * d)` alive (1–3).
- The bright garden of phase 2 spawns almost nothing; the wolves matter only once the Lily has put lights out.

**Wild attacks.** Every damaging attack the plant makes hits every unit that is not plant kin, on any team: Thorn Fans (1601), the Pod seed's burst, Spike Ring (1605), Pinwheel, Bloom Burst, the node hop eruption, the resprout eruption, and the Creeper's dark thorns if they are team-filtered today. **Plant kin** = units with a new `UnitTag.GardenKin`: the Heart, every node kind, the Pod seed, and the Hive Gourd's swarmlings and slimes (the spawner tags its children). Heals (Mend) are unchanged. Darkness wolves do not attack the plant (one-way; no new team).

## Key existing code index

Paths under `app/js/games/minion_battles/`.

| Concern | Location |
|---|---|
| Heart and node defs | `game/units/unit_defs/unitDef.ts` (`garden_heart` ~l.770 and the node kinds after it) |
| Family numbers, ids | `card_defs/16_enemy_garden_heart/gardenHeartConstants.ts` |
| Phases, sprout points, burrow | `card_defs/16_enemy_garden_heart/gardenHeartPhases.ts`, `game/units/components/phaseDef.ts`, `phaseBurrow.ts`, `phaseRuntime.ts` (`clampHitAtPhaseThreshold`) |
| Callbacks and rules registered for the family | `card_defs/16_enemy_garden_heart/gardenHeartRegistrations.ts` |
| Tree layouts, grow / dismiss | `game/gardenHeart/gardenTreeLayouts.ts`, `game/gardenHeart/growGardenTree.ts` |
| Node trees and Stems | `game/units/components/nodeTree.ts`, `nodeTreeHooks.ts`, `nodeTreeSpawn.ts`, `game/tethers/tether.ts` |
| Flat reduction + condition registry | `game/units/flatDamageReduction.ts` (`registerFlatReductionCondition`), damage order documented there |
| Hard CC | `crowdControl/hardCcGate.ts`, `tryApplyHardCcStun.ts`, `tryApplyStagger.ts`, `tryApplyLift.ts`, `knockbackKeywords.ts`, `ccInterrupt.ts`; `buffs/ExposedBuff.ts` |
| Unit tags | `game/units/unitTag.ts` |
| Projectile team filter | `game/projectiles/Projectile.ts` (`areEnemies(this.sourceTeamId, unit.teamId)` at ~l.780, 794, 918) |
| Area damage helpers | `abilities/targetHelpers.ts` (`damageEnemiesInCircle`) |
| Fused body burst | `game/units/components/fusedBodyHooks.ts` (`areaDamage` effect) |
| Ring of projectiles | `abilities/projectileRing.ts` (`fireProjectileRing`) |
| Spike Ring + cadence | `card_defs/16_enemy_garden_heart/1605_SpikeRing/1605Ability.ts`, `game/units/components/cadenceCast.ts`, `cadenceCastHooks.ts` (`registerCastRateRule`) |
| Circular ring painter | `game/GameRenderer/renderers/castStateRingVisual.ts`, `game/units/castStateRing.ts` |
| Plated look / render options | `game/units/unitRenderOptions.ts`, `game/GameRenderer/renderers/unitRenderOptionsVisual.ts` |
| Boss banner (phase transition text) | `phaseDef.ts` `banner`; find the HUD path that draws it |
| Light draining precedent | `card_defs/dark_animals/0018_LightEater/0018Ability.ts` (`devourLight`, `devourLightSource`, `findNearestLightTile`) |
| Light level | `GameEngine.getLightLevelAt`, `game/lighting/LightingSystem.ts` |
| Continuous spawns | `storylines/types.ts` (`continuousSpawn`, `afterTrigger`), `game/managers/LevelEventManager.ts` |
| Mission triggers | `game/triggers/triggerTypes.ts`, `TriggerManager.ts`, `missionConditions.ts` |
| Battle variables | `game/battleVariables.ts`, `GARDEN_GROWTH_PHASE_VARIABLE` |
| Mission + boss setup | `storylines/WorldOfDarkness/missions/020_garden_heart.ts`, `.../castle/castleBosses.ts`, `.../castle/gardenHeartMission.test.ts` |
| Garden ability test scenarios | `testing/scenarios/general/gardenHeart.ts`, `testing/scenarios/registry.ts` |

## Agent Instructions

This plan is executed by `/jp-implement-plan` (see `.claude/skills/jp-implement-plan/SKILL.md`; do not restate its workflow here). The **invoking agent is the sole orchestrator**: it spawns one worker per step **synchronously** (never in the background), waits for each worker to finish, then moves to the next step, and finally reports plan completion to the user. Each worker implements **exactly one step**, checks off that step's checklist items with a one-line summary under each, and **stops without spawning the next agent**.

Every worker reads "Build the engine, not the feature" in `app/js/games/minion_battles/AGENTS.md` first. Steps 1–10 build reusable pieces with no Garden Heart knowledge in engine code; Steps 11–12 apply them to the Garden Heart as data and registered callbacks.

Project skills relevant to this plan (workers invoke the ones matching their step):

- `working-on-minion-battles` — always.
- `game-engine`, `game-object-def-pattern` — any step adding serialized state or def fields (Steps 2–6, 9–11).
- `creating-an-ability`, `editing-card-behaviour`, `card_defs/SKILL.md` (AbilityRegistry) — Steps 8, 9, 11, 12.
- `abilities/AGENTS.md` (CastBehaviours) — Steps 7, 8, 9.
- `crowdControl/AGENTS.md` — Step 1.
- `game/effects/AGENTS.md`, `hud-effects` — Step 6.
- `terrain/AGENTS.md` — Step 3 (wither vs Briar).
- `modifying-spawn-definitions`, `missions` — Steps 10, 12.
- `working-on-ai-controllers` — Step 12 (Lily AI).
- `time-dilation` — Steps 4, 8 (which clock the window and the Pinwheel use: world time).
- `writing-style-abilities` (`.claude/skills/narrative/writing-style-abilities/STYLE.md`) — any player-facing text (banners, tooltips, uiDescription).
- `ability-tests` — Step 14.
- `scoped-testing` — per-step Vitest scope.

**Verification cadence:** per step, at most `npm run lint:changed`, `npx tsc --noEmit` when the step crosses an interface boundary, and only the specific test files the step touches or creates. No full-suite, whole-directory, or AbilityTest/E2E runs in regular steps; Step 14 runs the expensive things once. Tests use Vitest, never Jest.

---

## Part A — Reusable engine pieces

### Step 1 — CC immunity tag

Files: `game/units/unitTag.ts`, `crowdControl/hardCcGate.ts` and the other CC entry points it does not cover (`tryApplyLift.ts`, `knockbackKeywords.ts` / knockback application, `ccInterrupt.ts`), new `crowdControl/ccImmune.test.ts`.

- [x] Add `UnitTag.CcImmune`: a unit with it ignores every hard CC (stun, stagger, lift), forced movement (knockback, pull, shove) and CC interrupts, before armour is consulted, so boss CC armour is never used up and `ExposedBuff` is never applied.
  - Put the check at the top of each shared gate (beside the juggernaut-window check in `hardCcGate`), not at call sites. If one helper (`isCcImmune(unit)`) covers all gates, use it everywhere.
  - Done: `UnitTag.CcImmune` + `isCcImmune()` in `unitTag.ts`; checked at the top of `applyCcThroughArmourGate` (stun, stagger), `tryApplyLift`, `_tryApplyTierForcedMovement` (knockback/pull), `canCcInterrupt` (so `tryCcInterruptAbilities` too) and `applyKnockbackToUnit`. Separate from `isImmuneToForcedMovement` (Structure) on purpose; nudge/crowd-spacing untouched.
- [x] Tests: a CcImmune boss hit by a stun keeps its armour and gains no Exposed; a knockback does not move it; a lift does not lift it; a unit without the tag is unchanged.
  - Done: new `crowdControl/ccImmune.test.ts` (6 tests: stun, stagger, knockback, lift, interrupt, untagged control).

### Step 2 — Conditional damage-taken multiplier

Files: `game/units/flatDamageReduction.ts` (or a sibling `game/units/conditionalVulnerability.ts` if the module would get muddled), the unit damage entry point (`applyDamageToUnitDetailed`), `game/units/components/nodeTree.ts` (new condition), the unit def type, new `game/conditionalVulnerability.test.ts`.

- [x] A per-unit `damageTakenMultipliers: { multiplier, condition }[]` (def field copied to the unit, like `flatDamageReductions`), using the same named condition registry. Order: after attacker modifiers and `exposed`, before the flat reduction, shields and armour. Document the order in the module comment.
  - A source can opt out (for Severance, Step 3) with a damage option such as `ignoreTargetModifiers: true`; reuse an existing option if one exists.
  - Done: `DamageTakenMultiplier` + `applyUnitDamageTakenMultipliers` in `flatDamageReduction.ts` (shared condition registry, rounded product); `Unit.damageTakenMultipliers`, def field + `getUnitDamageTakenMultipliers`, serialized when non-empty; applied in `applyDamageToUnitDetailed` after exposed, before flat reduction/shields. New damage option `ignoreTargetModifiers` skips both the multipliers and flat reductions; order documented in the module comment.
- [x] Register condition `noLivingChildren` (the inverse of `hasLivingChildren`) in `nodeTree.ts`.
  - Done: `noLivingChildren` (`NODE_TREE_NO_LIVING_CHILDREN`, `hasNoLivingChildren`) registered in `nodeTree.ts`.
- [x] Report the bonus on the damage event (e.g. `amplified`), mirroring `resisted`, so later feedback can read it. No new visual in this plan.
  - Done: `amplified` added to `DamageTakenEvent` and `DamageBreakdown`, omitted when 0.
- [x] Tests: ×1.5 with the condition true; unchanged when false; order with a flat reduction on the same unit; serialization round-trip of the unit field if it is serialized.
  - Done: new `game/conditionalVulnerability.test.ts` (6 tests: x1.5, false condition, order with flat reduction, ignoreTargetModifiers, noLivingChildren link/unlink, serialization). lint:changed clean; tsc only the known allowMiss error.

### Step 3 — Severance and withering Stems

Files: `game/units/components/nodeTree.ts`, `nodeTreeHooks.ts`, `game/tethers/tether.ts`, `game/gardenHeart/growGardenTree.ts` (`dismissGardenTree`), `game/nodeTree.test.ts`.

- [x] Node-tree option on the **root** (declared in its `nodeTree` component spec): `severance?: { damage: number; scaleWithEnemyHealth?: boolean }`. When any descendant dies to a kill, the root takes that damage, through the phase threshold clamp, ignoring target modifiers (Step 2's opt-out) and the Shell. Severance from a dismissal or an unlink never fires.
  - The damage source is the killer when there is one (credit), else the node.
  - `scaleWithEnemyHealth` multiplies by `getEnemyHealthMultiplier(engine.enemyScalingPlayerCount)`.
  - Done: `NodeTreeOptions.severance` in `nodeTree.ts`; `resolveNodeDeath` (`nodeTreeHooks.ts`) walks to the tree root (`findNodeTreeRoot`) and calls `root.takeDamage(..., { ignoreTargetModifiers: true })` after the parent's `onLastChildDied`. Phase clamp applies via the normal `damage_taken` path. Killer id now flows `unit_died` -> `runUnitComponentDeath(unit, ctx, killerUnitId)` -> hook `onDeath(unit, ctx, killerUnitId)`. Dismissals are excluded by a transient `dismissed` flag on the node state (`markNodeDismissed`, set by `dismissGardenTree`); unlinking never emits a death.
- [x] Node-tree option on the root: `stemDeath?: 'briar' | 'witherWhileRegrowing'` (default `'briar'`, today's behaviour). With `'witherWhileRegrowing'`, a node killed while its root is alive and has regrowth (Step 4) lays no Briar; its Stem plays a short fade instead (render-only effect at the vine points). `dismissGardenTree` always lays Briar (pass an explicit flag through the death path rather than reading global state).
  - Done: `NodeTreeOptions.stemDeath`. "Root has regrowth" = `rootHasRegrowth(root)` in `nodeTree.ts`, true when the root carries a component with id `NODE_REGROWTH_COMPONENT_ID` (`'nodeRegrowth'`), so Step 4's component plugs in just by existing (it should keep that id; refine `rootHasRegrowth` if it must also be false during a retreat). A wither plays a new render-only `StemWither` effect (`effect_defs/stemEffects.ts`, type const in `tethers/tether.ts` so the engine imports no Pixi, registered in `effect_defs/index.ts`).
- [x] Tests: killing a Bud damages the root by the severance amount; Severance does not skip a phase (clamped); dismiss deals no Severance and lays Briar; a wither kill lays no Briar; the default is unchanged.
  - Done: 7 new tests in `game/nodeTree.test.ts` (kill damages root and credits killer; ignores Shell and multipliers; scaleWithEnemyHealth; phase clamp; dismiss = no Severance + Briar; wither kill vs default Briar, with a stub `nodeRegrowth` component; wither root without regrowth lays Briar). Step 11 must set `severance` / `stemDeath` on the `garden_heart` def's `nodeTree` spec.

### Step 4 — Regrowth on node trees

Files: new `game/units/components/nodeRegrowth.ts` (+ hooks, registered in `builtinComponents.ts` and the hook table), `game/units/components/nodeTree.ts` (each node remembers its layout key), `game/gardenHeart/growGardenTree.ts` (grow only missing keys), new `game/nodeRegrowth.test.ts`.

- [x] A root component `nodeRegrowth` with options `{ openSeconds, trickleSeconds?, regrowCallback, callbacks?: { opened?, regrown? } }`. State (serialized): `openUntil` (world time) or null, `nextTrickleAt` or null.
  - When the root's last child dies, it opens for `openSeconds` and fires `opened`. When the window ends it calls `regrowCallback` (full regrowth) and fires `regrown`.
  - While the root has ≥ 1 living child and ≥ 1 layout key is missing, every `trickleSeconds` it calls `regrowCallback` with `{ only: 1 }` (parents before children; a Bud waits for its missing Knot).
  - The burrow retreat cancels both (on `unit_phase_entered` / burrow start), and a dead root does nothing.
  - Callbacks are registered by id (`registerNodeRegrowthCallback`), like node-tree callbacks; the component never names the Garden Heart.
  - Expose `getNodeRegrowthStatus(unit, time)` → `{ open, fraction }` for the ring and tests.
  - Done: `nodeRegrowth.ts` (state, options, `getNodeRegrowthStatus`; id `NODE_REGROWTH_COMPONENT_ID`) and `nodeRegrowthHooks.ts` (tick, `registerNodeRegrowthCallback`, `openNodeRegrowth`, `cancelNodeRegrowth`), registered in `builtinComponents.ts` and the hook table (after node trees). One callback signature serves every id: `(root, ctx, { event: 'regrow', only? } | { event: 'missing' } | 'opened' | 'regrown') => number`; `missing` returns how many slots are missing and arms the trickle timer, `regrow` returns how many it grew. The window opens from `resolveNodeDeath` (after Severance, never for a dismissal, only when the dying node's parent is the root); world time (`ctx.gameTime`). `rootHasRegrowth` is now false while the root's phase burrow runs, and the tick cancels the window and trickle then.
- [x] Nodes record their layout key on the node-tree slice (serialized; omitted when absent). `growGardenTree` gains `{ onlyMissing?: boolean; limit?: number }`: it grows only keys with no living node, in table order, up to `limit`, placed and turned as today (facing the nearest player).
  - Done: `layoutKey` on the node-tree slice (`nodeLayoutKey`, `setNodeLayoutKey` / `getNodeLayoutKey`); `growGardenTree(..., { onlyMissing, limit })` grows only keys with no living node under the Heart (returns just the newly grown units, skips the growth-phase variable, a Bud whose Knot is missing waits), plus `missingGardenNodeKeys(engine, heart, phase)`. Turning is the caller's `faceToward`: Step 11's regrow callback must pass it (an orphaned Bud whose Knot died is unreachable from the Heart, so its key counts as missing).
- [x] Tests: last child dies → open → after `openSeconds` the full layout is back; trickle restores one node per interval and none while open; retreat cancels a pending regrowth; status fraction goes 1 → 0; serialization round-trip mid-window.
  - Done: new `game/nodeRegrowth.test.ts` (11 tests: id, open then full regrow with cues, fraction 1 to 0, trickle and no trickle while open, retreat cancels, dismissal never opens, dead root, round-trip mid-window, layout keys, onlyMissing order and limit, Bud waits for Knot). lint, tsc (only the known error), nodeTree and gardenHeart tests green.

### Step 5 — Phase health pools

Files: `game/units/components/phaseDef.ts`, `game/phase.test.ts` (or `game/phaseBurrow.test.ts`).

- [x] Helper `phasesFromHealthPools(pools: number[], makePhase: (index, threshold) => UnitPhaseDef): { maxHp: number; phases: UnitPhaseDef[] }`. `maxHp` is the sum; phase `i` (1-based, from 2) enters at `health_below_percent` with threshold `remaining / maxHp`, where `remaining` is the sum of pools from `i` on. Pure data; no runtime change.
  - Done: `phasesFromHealthPools` added to `phaseDef.ts` (pure; `makePhase(index, threshold)` with index 2..N; Step 11 sets `clampHitAtThreshold` inside `makePhase`).
- [x] Tests: pools `[35, 60, 160, 240]` give max 495 and thresholds 460/495, 400/495, 240/495; with the clamp, a big hit at full health stops at exactly 460/495 of max.
  - Done: 2 new tests in `game/units/components/phase.test.ts` (sum and thresholds; clamped 9999 hit at 495 HP stops at 460 and enters phase index 1). 30/30 pass, eslint clean on both files.

### Step 6 — Timer ring and state banners

Files: `game/units/unitRenderOptions.ts` (new `timerRing` option), `game/GameRenderer/renderers/castStateRingVisual.ts` or a sibling painter, `UnitRenderer` wiring, the boss banner HUD path, `game/unitRenderOptions.test.ts`.

- [x] Render option `timerRing?: { source: 'nodeRegrowth'; color; width; alpha; offsetPx }`: drawn from `getNodeRegrowthStatus` (Step 4) as a thin arc just outside the body, draining clockwise from the top, hidden when not open. Reuse the cast-state ring's drawing code (extract a shared arc painter if needed). Generic: `source` is a small registry of status readers, so other timers can drive it later.
  - Done: `TimerRingDef` / `renderOptions.timerRing` + `registerTimerRingSource` / `resolveTimerRing` in `units/unitRenderOptions.ts` (source `nodeRegrowth` registered; reader returns the draining fraction while open, null otherwise). Shared `strokeClockwiseArc` extracted in `castStateRingVisual.ts`; `syncTimerRing` in `unitRenderOptionsVisual.ts`, called from `UnitRenderer` with `engine.gameTime`. Ring sits `offsetPx` outside the body. Not yet set on the `garden_heart` def (Step 11: `{ source: 'nodeRegrowth', color: NIGHTBLOOM_SECONDARY, width: 2, alpha: 0.6, offsetPx: 1 }`).
- [x] A reusable way to show the bold boss HUD banner on demand: `showUnitBanner(engine, unitId, text, seconds)`, using the same HUD element as phase-transition banners. Deterministic engine event, rendered by the UI (no Pixi in the engine).
  - Done: `showUnitBanner(engine, unitId, text, seconds)` / `getActiveUnitBanner` in new `game/unitBanner.ts`: emits new `unit_banner` event and remembers the banner (WeakMap per engine, world time, not serialized). `BossHudSlice` gains top-level `banner`, filled by `useBossHudPolling`; `BossFightHud` shows `phase.banner ?? banner` in the existing banner element, so it matches the burrow banner style.
- [x] Tests: the pure resolver returns the ring fraction while open and nothing otherwise; the banner call emits the event with text and duration.
  - Done: 2 new describes in `game/unitRenderOptions.test.ts` (timer ring hidden / drains 1 to 0 with def style / null without option; unit banner event, expiry, replacement). 10/10 pass, eslint clean, tsc only the known allowMiss error.

### Step 7 — Wild hit rule

Files: `game/units/unitTag.ts` (`GardenKin`), `game/projectiles/Projectile.ts`, `abilities/targetHelpers.ts`, `game/units/components/fusedBodyHooks.ts`, `game/units/components/phaseBurrow.ts` (eruption damage), the burrow-hop eruption, `game/terrainEffects/thorns.ts` if team-filtered, new `game/wildHits.test.ts`.

- [x] A hit rule type `HitRule = { kind: 'hostile' } | { kind: 'allExceptKin'; kinTag: UnitTag }`, default `hostile` (today's behaviour). One helper `canHit(rule, sourceTeamId, target)` replaces the three `areEnemies` checks in `Projectile.ts`; projectiles carry an optional serialized `hitRule`.
  - Done: new `game/hitRule.ts` (`HitRule`, `canHit`, `wildHitRule`, `cloneHitRule`, `parseHitRuleFromJSON`); `Projectile.hitRule` replaces the three `areEnemies` checks, serialized only when not hostile; `ProjectileLaunchBehaviour.withHitRule(rule)` forwards it. Ring projectiles pass `hitRule` in their own `new Projectile` config.
- [x] Area damage helpers take an optional hit rule (`damageUnitsInCircle(..., { hitRule })`, keeping `damageEnemiesInCircle` as the hostile wrapper). The fused body `areaDamage` effect, the burrow eruption and the hop eruption read an optional `hitRule` from their options. Thorn terrain: check how it picks victims and give it the same option if it filters by team.
  - Done: `damageUnitsInCircle` in `targetHelpers.ts` (`CircleHitbox.getUnitsInHitbox` takes an optional 6th `hitRule` arg); `FusedBodyEffectSpec.hitRule` (spec level, not `params`, which is numeric); `BurrowEruptionDef.hitRule`, which covers both the phase burrow and the hop (hop `options.burrow` is the same def type, landed by `landEruption`). Thorn terrain NOT changed: its victim filter is a per-terrain-effect-def `hurts` value (`standingDamage.ts`: `'enemiesOfOwner'` or a creature filter), not per-attack, and the plant's attacks are not terrain; Step 12 should check whether the Creeper's dark thorns are a projectile (pass `hitRule`) or a terrain def (a `hurts` creature filter would be the existing lever).
- [x] Add `UnitTag.GardenKin` (plain tag; the engine does not know what it means beyond the rule).
  - Done: `UnitTag.GardenKin = 'gardenKin'` in `unitTag.ts` (no def tags applied yet; Steps 11-12).
- [x] Spawner component option `childTags?: UnitTag[]` (added to every unit it spawns).
  - Done: `SpawnerComponentOptions.childTags`; `spawnerHooks.ts` tags each child as it is added (wraps the spawn context's `addUnit`). Step 12 sets `childTags: [UnitTag.GardenKin]` on the Hive spec's component options.
- [x] Tests: a Wild projectile from an enemy hits another enemy-team unit, skips a kin unit and still hits a player; a default projectile is unchanged; Wild area damage likewise; spawner children get `childTags`; serialization round-trip of `hitRule`.
  - Done: new `game/wildHits.test.ts` (10 tests: `canHit`, Wild/default projectile, hitRule round-trip, Wild circle damage, fused body burst Wild/default, burrow eruption Wild/default, spawner `childTags`). Also green: fusedBody, phaseBurrow, projectiles, targetHelpers, spawnerCore, nodeTree, nodeRegrowth, gardenHeart, light_core, dark_animals, hitboxes, contentLayering (27 files, 245 tests).

### Step 8 — Pinwheel emitter and presets

Files: new `abilities/CastBehaviours/PinwheelBehaviour.ts` (registered in `CastBehaviours`), new `abilities/pinwheelPresets.ts`, new `abilities/CastBehaviours/pinwheel.test.ts`.

- [x] Cast behaviour `CastBehaviours.Pinwheel(config)` over a timing interval: `{ arms, counterArms, turnDegPerSec, fireIntervalSec, startAngle: 'random' | number, projectile: { speed, damage, radius, range, type, hitRule } }`. Arms are evenly spaced; counter arms turn the other way, starting offset by half the arm spacing. Fires on world time; deterministic (engine RNG for the random start, stored in the cast payload); survives save/load mid-cast.
  - Done: `abilities/CastBehaviours/PinwheelBehaviour.ts`, registered as `CastBehaviours.Pinwheel`. Shot k of every arm leaves the caster at `k * fireIntervalSec` (shot 0 on the first tick; 25 shots in 5 s at 0.2 s). Start angle and window length are stored in the behaviour payload at setup (`'random'` = whole-degree `generateRandomInteger(0, 359)`; window from `ctx.windowSeconds`, or optional `windowSeconds` in the config). The schedule is a pure function of window progress, so a payload round-trip replays the same thorns. `projectile.hitRule` goes onto each `Projectile`; Step 11 supplies `wildHitRule(UnitTag.GardenKin)`.
- [x] Presets as data in `pinwheelPresets.ts`: Gentle, Doubled, Swift, Weave with the numbers in the decisions table. Presets hold only the arm settings; the ability supplies the projectile.
  - Done: `abilities/pinwheelPresets.ts` (`PINWHEEL_PRESETS` gentle/doubled/swift/weave, `PinwheelPresetId`). Thorn speed is a preset field (`projectileSpeed`) since the plan table makes it per-preset; `pinwheelConfig(presetId, projectileWithoutSpeed, startAngle = 'random')` joins a preset with the ability's projectile for Step 11's 1607.
- [x] Tests: Gentle fires 25 thorns over 5 s along one turning line; Doubled fires two opposite lines; Weave's two arms turn in opposite directions; replay after a mid-cast round-trip gives the same projectiles.
  - Done: new `abilities/CastBehaviours/pinwheel.test.ts` (9 tests: preset numbers, `pinwheelConfig`, Gentle 25 thorns on a turning line, RNG start kept, Doubled opposite lines, Weave opposite turn directions, hit rule carried, replay after a payload round-trip, no window = no shots). eslint clean, tsc only the known allowMiss error.

### Step 9 — Drain Light cast behaviour

Files: `card_defs/dark_animals/0018_LightEater/0018Ability.ts` (move the shared light helpers out), new `abilities/lightDrain.ts`, new `abilities/CastBehaviours/DrainLightBehaviour.ts`, new `abilities/lightDrain.test.ts`.

- [x] Move `devourLight` / `devourLightSource` / `findNearestLightTile` into `abilities/lightDrain.ts` with the amount as a parameter; Light Eater calls them with its own amount (behaviour unchanged, its tests still pass).
  - Done: new `abilities/lightDrain.ts` holds the helpers (tile and free-source finders, `devourLight(engine, tile, amount)`, `devourLightSource(ls, amount)`, `findNearestLitLight`, `drainPickedLight`). `0018Ability.ts` keeps its exported `devourLight(engine, tile)` / `devourLightSource(ls)` / `findNearestLightTile` / `lightTileCenter` / `anyDevourableLight` as thin wrappers or re-exports bound to `LIGHT_EATER_LIGHT_REDUCTION`, so its tests and callers are unchanged.
- [x] `CastBehaviours.DrainLight({ amount, target: 'nearestLit', range?: number, stream?: { color } })`: picks its light at cast start (stored in the payload), shows a stream effect from the light to the caster for the interval, and drains at the end. A drained-out light stays out.
  - Done: `abilities/CastBehaviours/DrainLightBehaviour.ts`, registered as `CastBehaviours.DrainLight`. Picks the nearest lit tile or free light source (within `range` if given) at setup into the payload and spawns a render-only `LightStream` effect (`game/effects/lightStream.ts` type const, painter `effect_defs/lightStreamEffects.ts`, registered in `effect_defs/index.ts`) at the light, flowing to the caster. Drains on the last tick; if the picked light went out meanwhile it drains the nearest lit one instead. Interrupted casts drain nothing. Step 12's 1606 supplies `{ amount: 1, target: 'nearestLit', stream: { color: NIGHTBLOOM_SECONDARY } }`.
- [x] Tests: drains 1 from the nearest lit light; picks the next light once one is out; does nothing when no light is lit; Light Eater's existing tests still pass.
  - Done: new `abilities/lightDrain.test.ts` (8 tests: helper reduce/eliminate, decay baseline, dark light and range, nearest drain plus stream, next light once one is out and stays out, free source, no lit light, mid-window fallback). Light Eater: dark_animals, displacerKit and 006d_displacer tests green; eslint clean; tsc only the known allowMiss error.

### Step 10 — Darkness-scaled continuous spawns and a battle-variable trigger

Files: `storylines/types.ts` (`continuousSpawn` options), `game/managers/LevelEventManager.ts`, a darkness sampler beside `LightingSystem` (e.g. `game/lighting/darkShare.ts`), `game/triggers/triggerTypes.ts` + `missionConditions.ts`, `LevelEventManager.continuousSpawnStart.test.ts` (extend) and `TriggerManager.test.ts` (extend).

- [x] `darkShare(engine)`: the share of passable tiles in full darkness (the same test `inDarkness` placement uses). Sampled only when a spawn check runs.
  - Done: new `game/lighting/darkShare.ts` (`darkShare(ctx)` scans passable tiles with `getLightAt <= FULL_DARKNESS`, 0 when light is off; `lerpByShare`). Called only from the continuous-spawn check, never per tick.
- [x] `continuousSpawn` gains `darknessScaling?: { minShare, intervalRounds: { atMin, atFull }, maxUnits: { base, perShare } }`: below `minShare` it spawns nothing; otherwise the interval is `lerp(atMin, atFull, share)` and the cap is `base + floor(perShare * share)`. Absent = today's behaviour.
  - Done: `LevelEventContinuousSpawn.darknessScaling` (`storylines/types.ts`), handled in `LevelEventManager.processContinuousSpawnEvent`. It checks only every 10th tick (`gameTick % 10`, deterministic) and only samples darkness once the shortest interval has passed. The interval is lerped from `atMin` at `minShare` to `atFull` at share 1 (so 2 rounds at the gate, 1 fully dark; `trigger.intervalRounds` is ignored when scaling is set); the cap is `base + floor(perShare * share)` living units of each entry's `characterId`.
- [x] Trigger condition `{ type: 'battleVariableAtLeast'; variable; value }` so an event can gate on `afterTrigger` for a trigger that fires when a battle variable reaches a value.
  - Done: condition added to `TriggerCondition` and `evaluateTriggerCondition` (`MissionConditionContext` now also picks `battleVariables`). Triggers had only a region event, so a new `{ type: 'everyTick' }` event fires each tick; Step 12's trigger is `events: [{ type: 'everyTick' }]` + `conditions: [{ type: 'battleVariableAtLeast', variable: GARDEN_GROWTH_PHASE_VARIABLE, value: 2 }]`. The two mission-overview files that read `event.region` now handle `everyTick`. Documented in `game/triggers/AGENTS.md`.
- [x] Tests: no spawns below the gate; the interval and cap follow the share; the trigger fires when the variable reaches the value and not before.
  - Done: 5 new tests in `LevelEventManager.continuousSpawnStart.test.ts` (share sampling, gate, interval, cap, no sampling between checks) and 2 in `TriggerManager.test.ts`.

## Part B — The Garden Heart

### Step 11 — The Heart: Bared windows, Severance, pools, Pinwheel

Files: `gardenHeartConstants.ts`, `gardenHeartPhases.ts`, `gardenHeartRegistrations.ts`, `game/units/unit_defs/unitDef.ts` (`garden_heart`), new `card_defs/16_enemy_garden_heart/1607_Pinwheel/1607Ability.ts`, new `1608_BloomBurst/1608Ability.ts`, `1605_SpikeRing/1605Ability.ts`, `abilities/AbilityRegistry.ts`, `card_defs/index.ts`, `game/gardenHeart/gardenHeart.test.ts`.

- [x] Constants for every number in the decisions tables (window, ×1.5, Severance 10, trickle 10 s, pools, Pinwheel presets per phase `{1: none, 2: Gentle, 3: Gentle, 4: Doubled}`, Bloom Burst, banner text).
  - Done: constants added to `gardenHeartConstants.ts` (Bared window and x1.5, Severance, trickle, `GARDEN_HEART_HEALTH_POOLS`, banner texts and callback ids, `GARDEN_BARED_TIMER_RING`, thorn numbers, `GARDEN_PINWHEEL_PRESET_BY_PHASE` / `GARDEN_PINWHEEL_ABILITY_BY_PRESET`, Bloom Burst, flat `SPIKE_RING_RATES`). Ids: 1607 Pinwheel (Gentle), 1608 Bloom Burst, 1609 Pinwheel (Doubled: a preset is fixed per ability, so each preset in play is its own ability; 1606 stays free for Step 12's Drink Light). `gardenHeartPhases.ts` now builds the Heart's phases from `phasesFromHealthPools` (`GARDEN_HEART_MAX_HP` = 495, `GARDEN_HEART_PHASES`, clamp on every phase).
- [x] `garden_heart` def: tags add `CcImmune` and `GardenKin`; `damageTakenMultipliers: [{ multiplier: 1.5, condition: 'noLivingChildren' }]`; `nodeTree` with `severance: { damage: 10, scaleWithEnemyHealth: true }` and `stemDeath: 'witherWhileRegrowing'`; `nodeRegrowth` (5 s, trickle 10 s, regrow callback → `growGardenTree(..., { onlyMissing: true, limit })` for the current phase); `timerRing` render option; `hp` and `phases` from `phasesFromHealthPools([35, 60, 160, 240], retreatPhase)`. Keep the retreat burrow as today.
  - Done: def has tags `CcImmune` + `GardenKin`, `damageTakenMultipliers` (1.5, `noLivingChildren`), `nodeTree` with `severance` and `stemDeath: 'witherWhileRegrowing'`, `nodeRegrowth` (5 s, trickle 10 s, regrow callback, opened/regrown cues), `renderOptions.timerRing`, `hp = GARDEN_HEART_MAX_HP`, phases from the pools; retreat burrow unchanged. Registered callback `gardenRegrow` grows only missing keys for the current phase (`growGardenTree(..., { onlyMissing, limit: only, faceToward: nearest living player })`) and answers `missing` with `missingGardenNodeKeys(...).length`.
- [x] Registered regrowth callbacks: `opened` shows "The Heart is bared!" and casts that phase's Bared attack (Bloom Burst in P1, Pinwheel preset by `gardenGrowthPhase` otherwise) through the cadence/forced-cast path the Spike Ring uses; `regrown` shows "The Heart regrows...".
  - Done: in `gardenHeartRegistrations.ts`, `gardenBaredOpened` shows the banner and force-casts (`grantAbilityUses` + `executeUnitAbility`, as the cadence cast does) Bloom Burst in P1 or the Pinwheel for the phase preset; `gardenRegrown` shows the regrow banner. `gardenGrowthPhaseOf(heart)` = phase state index + 1.
- [x] Ability `1607` Pinwheel: one 5 s Active interval using `CastBehaviours.Pinwheel` with the phase's preset, thorns Wild (`GardenKin`). Ability `1608` Bloom Burst: `fireProjectileRing` of 10, Wild. Neither on the Heart's ability list (forced casts only); both in the bestiary.
  - Done: `1607_Pinwheel/1607Ability.ts` (factory `definePinwheelAbility`; 1607 Gentle, 1609 Doubled; one 5 s Active interval, `CastBehaviours.Pinwheel` over it, thorns Wild) and `1608_BloomBurst/1608Ability.ts` (0.2 s swell then one ring of 10; an Instant at time 0 never fired, hence the short windup). Shared Wild ring helper `card_defs/16_enemy_garden_heart/thornRing.ts` (`fireGardenThornRing`, `GARDEN_WILD_HIT_RULE`). Registered in `AbilityRegistry.ts` and `card_defs/index.ts`; all in the Heart's bestiary, none on its ability list.
- [x] Spike Ring: rate rule returns the phase base rate while the Heart has a living node and 0 while Bared (escalation removed; drop `SPIKE_RING_CURVE` / `max` if nothing else reads them); thorns Wild.
  - Done: `gardenSpikeRingRate(phase)` is the flat base rate; the rate rule returns it while `hasLivingChildren(heart)` and 0 otherwise (so never while Bared); `SPIKE_RING_CURVE`, `max` and `countLivingTreeNodes` removed; thorns go through `fireGardenThornRing` (Wild).
- [x] Update `uiDescription` and tooltips (writing style guide).
  - Done: Heart `uiDescription` rewritten (Severance, Bared, CC immunity, Wild thorns); Spike Ring, Pinwheel and Bloom Burst tooltips updated.
- [x] Tests (one behaviour each, no number tuning): the Heart is CC immune; Bared takes more damage; killing the last node opens a 5 s window then the whole tree regrows; Severance lands on a node kill; P1's opening is a Bloom Burst and P2's a Gentle Pinwheel.
  - Done: `game/gardenHeart/gardenHeart.test.ts` Spike Ring describe rewritten (flat rate, Wild ring, none in P1, no escalation while shelled, silent while Bared) and a new 'Bared windows, Severance and regrowth' describe (CC immune and kin tags, Bared takes more, Severance, window then full regrowth with banners, P1 Bloom Burst, P2 Gentle Pinwheel, P4 Doubled Pinwheel). `gardenHeartMission.test.ts` now derives retreat fractions from the pools (460/495, 400/495, 240/495) and checks max HP; the `garden_heart` scenarios in `testing/scenarios/general/gardenHeart.ts` follow the new thresholds and the shelled 2-rings-a-round rule (not run: sim project is Step 14). Green: gardenHeart, gardenHeartMission, nodeRegrowth, nodeTree, phase, AbilityRegistry, unitDefRegistry; eslint clean; tsc only the known allowMiss error.

### Step 12 — Gloam Lily, Wild nodes and the darkness spawns

Files: `gardenHeartConstants.ts`, `unitDef.ts` (new `gloam_lily`; tag `GardenKin` on every node kind and `pod_seed`), new `card_defs/16_enemy_garden_heart/1606_DrinkLight/1606Ability.ts`, `gardenTreeLayouts.ts`, `gardenHeartRegistrations.ts` (Hive spec `childTags: [GardenKin]`), `1601_ThornFans`, `pod_seed` fused-body options, `GARDEN_NODE_HOP` eruption, `GARDEN_BURROW_BASE` eruption, `game/units/unitAI/gardenNode/`, `020_garden_heart.ts` (level event + trigger), `castle/castleMission.ts` if it must forward `levelEvents`/`triggers`, `game/gardenHeart/gardenHeart.test.ts`, `castle/gardenHeartMission.test.ts`.

- [x] `gloam_lily` def and ability `1606` Drink Light (`CastBehaviours.DrainLight`, numbers from the decisions table); the `gardenNode` AI casts it whenever a lit light exists; it never moves.
  - Done: `gloam_lily` def (hp 45, rooted, no hop, Shell + nodeTree, `GardenKin`, `ENEMY_GLOAM_LILY` in `enemyConstants.ts`, bestiary) and `1606_DrinkLight/1606Ability.ts` (0.8 s Windup interval carrying `DrainLight({ amount: 1, target: 'nearestLit', stream })`, 2.7 s cooldown; registered in `AbilityRegistry` and `card_defs/index.ts`). New engine option `aiSettings.castWithoutEnemies` (a zero-target ability may be picked with an empty enemy pool, `canUse` still gates it; `pickBestAbility` in `unitAI/utils.ts`); `gardenNode_idle` and the no-sight branch of `gardenNode_attack` offer an empty-pool pick so the Lily drinks with no player around. `AIAbilityGateContext` gained optional `getLightSources`. Constants `GLOAM_LILY_ID`, `GLOAM_LILY_HP`, `DRINK_LIGHT_*`.
- [x] Layouts: P3 adds the Lily Bud on the Heart at 45°; P4 replaces `heartMortarB` with the Lily. Update the layout comment and the layout tests.
  - Done: `gardenTreeLayouts.ts` (`GLOAM_LILY_ID` joins `GardenNodeKind`; P3 key `heartLily` at 45°, P4 `heartMortarB` became `heartLily` at 225°; header comment updated); layout test in `gardenHeart.test.ts` now checks the Lily Bud in P3, one Pod Mortar plus one Lily on the Heart in P4, six kinds.
- [x] Wild everywhere the plant deals damage: Thorn Fans thorns, the seed burst, the node hop eruption, the resprout eruption, the Creeper's dark thorns (if Step 7 made them filterable). All use `{ kind: 'allExceptKin', kinTag: GardenKin }`.
  - Done: `GARDEN_WILD_HIT_RULE` now lives in `gardenHeartConstants.ts` (`thornRing.ts` re-exports it). Applied to Thorn Fans (`.withHitRule`), the Pod seed `onExpiry`, `GARDEN_NODE_HOP.burrow.eruption` and `GARDEN_BURROW_BASE.eruption`. `GardenKin` is on every node kind, the Lily, `pod_seed`, and the Hive spawner's `childTags`. The Creeper's thorns were not team-filtered but a creature filter (`dark_thorn` spares `dark_creature`, so wolves walked over them), so there is a new terrain effect `garden_thorn` (`hurts: { except: ['nature'] }`, same damage and look as `dark_thorn`, visual alias in `GameRenderer/terrainEffectDefs.ts`) laid by Runner Vine. Side effect: the Hive's swarmlings and slimes are dark creatures, so Creeper thorns hurt them too (a creature filter cannot express kin).
- [x] Mission: a `battleVariableAtLeast` trigger (`gardenGrowthPhase` ≥ 2) and a `continuousSpawn` of `dark_wolf` gated on it with `darknessScaling: { minShare: 0.15, intervalRounds: { atMin: 2, atFull: 1 }, maxUnits: { base: 1, perShare: 2 } }`.
  - Done: `defineCastleMission` now forwards `levelEvents` (inserted before the victory check) and `triggers` (`CastleMission.triggers`). `020_garden_heart.ts` exports `GARDEN_DARKNESS_TRIGGER_ID`, `GARDEN_HEART_TRIGGERS` (everyTick + `battleVariableAtLeast` >= 2, no actions) and `GARDEN_DARKNESS_SPAWN` (`darknessSpawn(ENEMY_DARK_WOLF, 1)` with the scaling above, `afterTrigger`).
- [x] Tests: the Lily drains a crystal and the crystal stays out after the Lily dies; a Thornspitter thorn damages a dark wolf and not a node; Hive children are kin; the mission has the gated spawn; P3/P4 layouts include the Lily.
  - Done: `gardenHeart.test.ts` gained 'Gloam Lily' (drain, stays out after death, AI drinks with no player in sight, rooted and shelled) and 'Wild garden attacks' (Thorn Fans hit a wolf and spare a Mender Bloom on a thorn's line, Hive children are kin, seed and eruptions carry the Wild rule, Creeper thorns hurt a wolf not a plant); `gardenHeartMission.test.ts` checks the trigger and gated spawn (and the phase-4 tree count now counts plant kin, since wolves can be in play). Note: a battle with no player unit does not advance game time, so tests need a player unit.

### Step 13 — Design record

Files: `docs/ideas/plans/0008_2026-11-15_garden-boss.md`, `app/js/components/minionBattlesHomePage/Ideas/storybook/` only if an entry lists Garden Heart behaviour that is now wrong.

- [x] In 0008, add a "Bared windows and the Gloam Lily" section (short; link this plan) and mark what it replaces: Spike Ring escalation, Briar on every kill during a phase, fixed 75/50/25% thresholds. Add Bared, Regrowth, Severance, Pinwheel, Wild and Gloam Lily to the Vocabulary list.
  - Done: 0008 has a new "Bared windows and the Gloam Lily" section (what was built: Bared, Severance, CC immunity, pools, Pinwheel 1607/1609 and Bloom Burst 1608, flat Spike Ring, Wild, `garden_thorn` Creeper terrain, the Lily and Drink Light 1606, six node kinds in P4, darkness spawns, engine pieces, open decisions). Marked **Replaced** inline: Spike Ring escalation, Briar on every kill, fixed thresholds. Six Vocabulary entries added and a Gloam Lily node-kind bullet. User's uncommitted edits kept (additions only). Storybook entries test covers only the Garden Heart palettes and Heart styles, not behaviour, so no storybook change.

## Part C — Verification

### Step 14 — Verification and AbilityTests

Files: `testing/scenarios/general/gardenHeart.ts`, `testing/scenarios/registry.ts`.

- [x] AbilityTest scenarios (high level, deterministic, quick):
  - **Bared and regrowth:** a party kills the phase-2 tree; the Heart is Bared, a Pinwheel fires, and after the window the whole tree is back.
  - **Severance moves the fight:** killing nodes alone, without touching the Heart, eventually takes the Heart through a phase retreat.
  - **Light and darkness:** a Gloam Lily left alone puts a light out; once enough of the arena is dark a dark wolf spawns there.
  - **Wild:** a Pinwheel thorn hits a dark wolf standing in its path; a node in its path is untouched.
  - Done: four scenarios in `testing/scenarios/general/gardenHeart.ts` (`garden_heart_bared_regrowth`, `garden_heart_severance` on the real mission, `garden_heart_light_and_darkness` using `GARDEN_DARKNESS_SPAWN` without its trigger gate, `garden_heart_wild` with a Mender Bloom as the plant in the path), added to `GARDEN_HEART_SCENARIOS` (already spread into `registry.ts`). All 11 `garden_heart` sim tests pass; eslint clean; tsc only the known allowMiss error. Finding: a cast with a start-0 interval opened between ticks (e.g. from `assertPass`) can miss `enteredTimingIds` on float rounding (`prevElapsed` ~3e-18 > 0), so the cast never sets up; the Wild scenario casts before tick 0 to avoid it.
- [x] Run `npm run test:sim` once, plus `npx tsc --noEmit` and `npm run lint:changed`. Fix anything this plan broke; list unrelated failures.
  - Done (orchestrator, 2026-11-20): `test:sim` 195/195; `lint:changed` clean; tsc only the known allowMiss error; 2033 unit tests across 227 touched/adjacent files green. Unrelated, pre-existing on HEAD: 15 tests in `game/units/unitAbilityLifecycle.interrupt.test.ts` and `unitNudge.test.ts` "continues path following while nudge is active".
- [ ] Manual browser checklist (one player, then two):
  - The timer ring is thin and subtle; the banners read like the burrow banner.
  - Phase 1: kill the Thornspitter, Bloom Burst fires, two hits kill the phase.
  - Phase 2: Gentle Pinwheel is dodged once and then stood beside; a slow party sees the tree regrow.
  - Phase 3: the Lily's stream is visible; crystals go out and stay out; wolves show up only once it is dark.
  - Phase 4: Doubled Pinwheel; the fight ends within three Bared windows.
  - Stuns, staggers and knockbacks do nothing to the Heart and never show Exposed.

## Open decisions

- [ ] Phase 4 Pinwheel: Doubled (planned) or Weave? Swap the preset constant after the browser pass.
- [ ] Should killing Knots give more Severance than Buds? Planned: same for all.
- [ ] Do Hive Gourd spawns count as kin (spared by Wild)? Planned: yes.
- [ ] Is withering Stems during a phase right, or should regrown nodes clear the Briar instead? Planned: wither.
