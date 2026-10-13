# Gravity: Collapse (0905) + Stagger status — Implementation Plan

Adds the **Collapse** research node and ability to the Gravity tree, plus the engine pieces it needs: a weak-stun **Stagger** status and a reusable **cone-gather** targeting/landing preset.

## Agent Instructions

This plan is executed by `/jp-implement-plan docs/plans/gravity-collapse.plan.md`. The **invoking agent is the sole orchestrator**: it spawns one worker per step **synchronously** (never in the background), waits for each to finish, then reports plan completion to the user. Each worker implements exactly one step, checks its items off with a one-line summary, and **stops without spawning the next agent**. See `.claude/skills/jp-implement-plan/SKILL.md` for the workflow — do not restate it here.

Relevant project skills: `working-on-minion-battles`, `creating-an-ability`, `editing-card-behaviour`, `game-object-def-pattern`, `working-with-hitboxes`, `research-trees`, `ability-tests`, `scoped-testing`, `hud-effects` (only if a HUD effect is needed), `working-with-skills`.

Rules for every worker:

- Read "Build the engine, not the feature" in `app/js/games/minion_battles/AGENTS.md` first. Prefer reusable properties/defs/presets over one-off ability code.
- The working tree already has unrelated uncommitted edits (ComboMeter, Projectile, SlimeShot, `BattlePhase.tsx`, etc.). Do not touch or revert them.
- Per-step verification is limited to `npm run lint` (plus `npx tsc --noEmit` when the step adds or changes interfaces) and **only the test files the step creates or touches**. Never run the full suite or AbilityTests in a regular step.
- Vitest, not Jest.

---

## Locked design

### Collapse (card id `0905`, group 09)

| Aspect | Decision |
|---|---|
| Name | **Collapse** (research node id `gravity_collapse`) |
| Aim | Single click. Cone from caster toward the cursor. |
| Targets | Up to **3** enemies inside the cone, the **nearest to the cursor** |
| Landing | An **arc** in front of the caster; the target nearest the cursor takes the centre slot |
| Movement | Forceful pull — aimed knockback, tier 3 gate (same as Force Push), duration ≈ 0.2s |
| Damage | **8** flat when flung (not collision damage) |
| Timing | Windup **0.3s** → release → cooldown phase ends **0.1s before** the fling lands (so the cast is over while enemies are still arriving) |
| Uses | **3** uses, all 3 recharged each round |
| Cost | Gravity **10** (medium, matches Gravity Shield) |
| Colour | `GRAVITY_VIOLET` for every effect |
| Camera | **Untouched** — no shake, zoom or pan |
| Windup juice | Violet cone telegraph tightening inward + faint particle streams from cone edge toward caster |
| Release juice | Collapsing cone shockwave, violet tether ribbon per target (target → slot), motion streaks / afterimages |
| Arrival juice | Ground ring + dust at each slot, then Stagger |
| Dropped | Hitstop, collision spark, gravity gain, gathered mark, Push/Pull mode flip, camera effects |

Starter numbers: cone length 110 px, cone width 70° total, arc radius = caster edge + 20 px (reuse the `GRAVITY_INVERSION_PULL_SLAM_SPACING` idea), arc spread ±25° around aim, knockback tier 3, stagger linger 0.4s after landing. Fling 0.2s; follow-up overlap 0.1s, so release → cast end = 0.1s.

### Stagger (new weak-stun status)

- **`StaggeredBuff`** (`'staggered'`): a timed buff that blocks acting and movement, interrupts the target's active ability on apply, and is registered in `buffRegistry` + `buffVisuals` (lighter violet-tinged variant of the stunned visual so it reads as "weak stun").
- **Engine flag**: a `blocksActing` property on `Buff`, read by `Unit.canAct()` and the `unitMovementTick` stun guard, replacing growth of hardcoded type-string checks. Existing stunned / exposed / lifted keep working (migrating them is optional cleanup).
- **CC armour interaction (important):** Stagger goes through the **same armour gate as stun**, but with a **weak charge of 0**:
  - Target with armour (`getEffectiveHardCcThreshold > 0`, e.g. bosses): **absorbed** — not affected, armour **not consumed**, no Exposed, no chain stacking.
  - Target with no armour: `StaggeredBuff` lands. Does not count toward hard-CC chain stacking.
  - Target **Exposed**: Stagger is *not* absorbed silently — it is treated like any hard CC on an exposed unit: its duration is **added to the Exposed buff** via `ExposedBuff.extendDuration` (and `boss_exposed_cc_suppressed` is emitted), exactly as stun does today.
  - Respects iFrames and the juggernaut window (absorbed, no effect). No-op on targets already stunned or lifted. `Structure` units fully resist.
  - Duration goes through `resolveCcDuration` with a new `'STAGGER'` CC type key. Refreshes to the longer duration, never extends.
- Preferred implementation: extract the shared gate from `tryApplyHardCcStun` rather than copy-pasting it (e.g. options `{ armourCharges, buildBuff }`), and add a thin `tryApplyStagger`.

---

## Steps

### Step 1 — Stagger engine (status + armour-aware apply)

Files (expected): `buffs/Buff.ts`, `buffs/StaggeredBuff.ts` (new), `buffs/buffRegistry.ts`, `buffs/buffVisuals.ts`, `game/units/Unit.ts`, `game/units/unitMovementTick.ts`, `crowdControl/ccTypes.ts`, `crowdControl/ccConstants.ts`, `crowdControl/tryApplyHardCcStun.ts` and/or new `crowdControl/tryApplyStagger.ts`, `crowdControl/index.ts`, `crowdControl/AGENTS.md`, new `crowdControl/tryApplyStagger.test.ts`.

- [ ] Add a `blocksActing` flag to `Buff`; make `Unit.canAct()` and the `unitMovementTick` guard honour it (keep existing stunned/exposed/lifted checks intact).
- [ ] Add `StaggeredBuff` + registry entry + buff visual (violet-tinged lighter stunned visual).
- [ ] Add `'STAGGER'` to `CcType` (soft-tier, weak) and wire `resolveCcDuration`; add default stagger constants to `ccConstants.ts`.
- [ ] Implement `tryApplyStagger` sharing the armour/exposed/iFrame/juggernaut gate with `tryApplyHardCcStun` per the "CC armour interaction" rules above (weak charge 0; armoured → absorbed without consuming; Exposed → extend exposed duration; interrupts active ability on apply).
- [ ] Add `tryApplyStagger.test.ts` covering: unarmoured unit staggers and cannot act/move; armoured boss absorbs and `hardConsumed` unchanged; Exposed target gets duration extended and no `StaggeredBuff`; iFrames/juggernaut absorbed; refresh-not-extend; `Structure` resists.
- [ ] Document Stagger in `crowdControl/AGENTS.md` (folder map + a short "weak CC" section).
- [ ] Run `npm run lint`, `npx tsc --noEmit`, and `npx vitest run app/js/games/minion_battles/crowdControl/tryApplyStagger.test.ts`.

### Step 2 — Cone-gather engine (selection + arc landing slots + duration-driven aimed knockback)

Files (expected): `abilities/targetHelpers.ts` and/or new `abilities/gatherHelpers.ts`, `abilities/coneGeometry.ts` (reuse `pointInCone`), `crowdControl/knockbackKeywords.ts`, new co-located `gatherHelpers.test.ts`, `knockbackKeywords.test.ts` (extend).

- [ ] Add a reusable `selectNearestToPointInCone({ caster, aim, cursor, length, widthDeg, maxTargets, filter })` that returns up to N enemies inside the cone sorted by distance to the cursor (deterministic tie-break by unit id).
- [ ] Add `computeArcLandingSlots({ caster, aim, count, radiusFromEdge, spreadDeg })` returning ordered slot points (centre slot first for the nearest target, then alternating sides) — a reusable "gather formation" preset, not Collapse-specific.
- [ ] Verify whether `tryApplyAimedKnockbackByTier` can take a **fixed duration** (air time) instead of deriving it from distance; if not, add an optional `durationOverride` and test it. Keep existing callers (Force Push) unchanged.
- [ ] Unit-test the helpers: cone membership edges, nearest-to-cursor ordering, cap of N, slot geometry for 1/2/3 targets, duration override.
- [ ] Run `npm run lint`, `npx tsc --noEmit`, and only the test files created/touched above.

### Step 3 — Collapse visual effect defs

Files (expected): `game/effect_defs/aoeEffects.ts` and/or `movementEffects.ts`, `game/effect_defs/index.ts` (registry), new `game/effect_defs/*.test.ts` only if an existing pattern for effect-def tests exists.

- [ ] Add a parameterized **cone-collapse** effect def (shockwave wedge that converges on the caster; params: `color`, `length`, `widthDeg`, `direction`) and register it. Windup telegraph may reuse the existing cone telegraph helpers (`previewHelpers.ts`: `drawConeSlice` / `createConeTargetPreview`) tinted violet.
- [ ] Add a parameterized **tether ribbon** effect def (line/ribbon from `from` → `to` that snaps taut over its duration; params: `color`, `from`, `to`) and register it.
- [ ] Add (or reuse `howlShockwaveEffectDef` with violet `colors`, as Lift does) a **ground ring + dust** arrival effect; prefer reuse of `impactEffects.ts` dust/ring defs with `effectData` over new code.
- [ ] Ensure none of the defs shake or move the camera.
- [ ] Run `npm run lint`, `npx tsc --noEmit`.

### Step 4 — Collapse ability (0905) + constants + registration

Files (expected): `card_defs/09_gravity_core/gravityConstants.ts`, `card_defs/09_gravity_core/0905_Collapse/0905Ability.ts` (new), `0905Ability.test.ts` (new), `abilities/AbilityRegistry.ts`, `card_defs/index.ts`, `card_defs/09_gravity_core/GravityCore.md`. Use `0902_ForcePush` and `0121_ConeOfLight` / `08_light_core/0803_ImbuedBat` as structural references; follow `card_defs/SKILL.md` for registration.

- [ ] Add `COLLAPSE_*` constants to `gravityConstants.ts`: windup 0.3, fling duration 0.2, follow-up overlap 0.1 (post-release phase = fling − overlap), damage 8, gravity cost 10, max targets 3, max uses 3, cone length 110 / width 70°, arc spacing 20 / spread ±25°, knockback tier 3, stagger linger 0.4. Derive the cooldown phase from fling − overlap rather than hand-tuning.
- [ ] Implement `0905Ability.ts` via `defineAbility`: windup → release (Instant) → cooldown timing intervals; single-click cone targeting (check the timing system's minimum interval for the release beat); on release select targets with Step 2's cone helper, deal 8 damage, aimed-knockback each to its arc slot with the Step 2 duration, then `tryApplyStagger` with duration fling + linger. Spawn Step 3 effects (windup telegraph, collapse wave, tethers, arrival ring + dust) in violet.
- [ ] Configure uses: `maxUses: 3`, round recharge restoring all 3 uses per round (confirm the correct `recoveries` shape against `abilities/abilityUses`; do not assume `chargesPerRecovery: 1` is right), resource cost `{ resourceId: 'gravity', amount: 10 }`, `clearMovementOnComplete: true`, tooltip via tooltip tokens (damage + "pulls up to 3 enemies").
- [ ] Register in `AbilityRegistry.ts` and `card_defs/index.ts`; add the ability row and visual-language notes to `GravityCore.md`.
- [ ] Add `0905Ability.test.ts`: caps at 3 targets; picks nearest-to-cursor; ignores allies/out-of-cone; deals 8 damage; targets end in arc slots; staggered afterward; armoured boss is pulled/damaged per knockback gate but not staggered; cast ends 0.1s before fling lands; interrupt during windup refunds without effect.
- [ ] Run `npm run lint`, `npx tsc --noEmit`, and `npx vitest run app/js/games/minion_battles/card_defs/09_gravity_core/0905_Collapse/0905Ability.test.ts`.

### Step 5 — Research node `gravity_collapse`

Files (expected): `app/js/researchTrees/trees/gravity.ts`, any research-tree test that enumerates gravity nodes (find via grep for `GRAVITY_NODE_GRAVITY_SHIELD`), `testing/scenarios/registry.ts` (tree → ability ids + id prefix mapping only), `card_defs/09_gravity_core/GravityCore.md` (research unlock column).

- [ ] Add `GRAVITY_NODE_COLLAPSE = 'gravity_collapse'` and cost constants (14 crystals / 5 food / 1 metal) to `gravity.ts`.
- [ ] Add the node: title "Collapse", tier 2, prereq `GRAVITY_NODE_CORE`, `anyResearched` requirement, `addCard '0905'`, position `{ x: 420, y: 420 }`, description + flavor text (use `DescriptiveValue`/inline numbers like the Lift/Shield nodes; description must state 3 enemies, pull in front, and brief stagger).
- [ ] Update `testing/scenarios/registry.ts`: add `'0905'` to the gravity tree's `abilityIds` and a `gravity_collapse_` prefix → `'0905'` mapping.
- [ ] Run `npm run lint` and any existing research-tree test file touched or that enumerates gravity nodes (single file).

### Step 6 — AbilityTest scenario

Files (expected): new `testing/scenarios/abilities/gravityCollapseScenario.ts`, `testing/scenarios/registry.ts` (register import + array entry). Follow `gravityInversionScenario.ts` and the **ability-tests** skill. Keep high level, fast and deterministic.

- [ ] Add `gravityCollapseScenario` with two checks as one E2E-style flow: (a) four enemies in a cone around the cursor → exactly the 3 nearest the cursor end up in an arc in front of the caster, took damage, and are unable to act (staggered) shortly after landing; (b) a caster follow-up attack order issued as soon as Collapse's cooldown ends is accepted before the pulled enemies have recovered (validates the 0.1s follow-up window).
- [ ] Add an armoured-boss case to the same scenario (or a second small one): boss is not staggered while armoured; when pre-set to Exposed, its Exposed duration grows instead of gaining `staggered`.
- [ ] Register the scenario in `registry.ts`.
- [ ] Run `npm run lint` and `npx tsc --noEmit` only (scenarios run in the final step).

### Step 7 — Final verification (runs the expensive checks once)

- [ ] Run the new/changed AbilityTests via the headless runner (see **ability-tests** skill): `gravityCollapseScenario` plus the existing gravity scenarios (`gravityInversionScenario`, `gravityShieldScenario`, `gravityLocusScenario`, `gravityGrazeScenario`) to confirm `canAct`/movement-guard changes did not regress Lift.
- [ ] Run `npx vitest run --changed` and fix regressions caused by this plan (note pre-existing unrelated failures rather than fixing them).
- [ ] Run `npm run lint` and `npx tsc --noEmit` once, clean.
- [ ] Manual browser checklist (Gravity Core equipped, Collapse researched): windup shows a tightening violet cone; release shows collapse wave + tethers + violet motion streaks; enemies land in an arc with ground ring + dust; no camera movement or shake; enemies visibly stagger briefly; follow-up attack is possible just before they land; boss with armour is pulled but not staggered; 3 uses, all refilled next round.
- [ ] Report completion to the user, including any deviations from the locked design.

---

## Open items for workers to flag (do not decide silently)

- Whether a "knockback landed" event exists to sync the ground ring/stagger start to landing; the default is to apply Stagger at fling start with duration = fling + 0.4s linger.
- Whether the timing system permits a ~0.02s release interval; if not, use the smallest allowed and shorten the cooldown phase to keep the 0.1s overlap.
- Exact `recoveries` shape for "all 3 uses back each round".
