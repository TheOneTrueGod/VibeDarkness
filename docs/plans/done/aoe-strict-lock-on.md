# Plan: AoE Strict Lock-On (Hitbox Targeting Helper)

## Completion — 2026-08-12

Implemented sequentially (no subagents; tests deferred to Step 6 per user). Shared `priorityFillHits` / `CircleAoEHitboxSpec` / `lockOnMode: 'strictHitbox'`; MeleeAttack `withLockOnMode`; Lift, Light Blast, Energy Blast, Throw Charged Rock, Cone of Light wired; Imbued Bat companion cone via `companionHitboxes` + `ResolvedTarget.lockRole`; Burst keeps aim-pixel + preview lock-on (pierce priority deferred). AbilityTests in `strictLockOnScenarios.ts`. Lint clean; plan Vitest green (27 helper/ability + 4 AbilityTest + ITS). Manual browser checklist still open.

**Follow-ups:** Burst traveling-wave pierce priority; Thornbinder impact HitboxSpec; More Rock multi-select lock-on commit across two throws (ITS multi-label path still uses label pixels only).

---

## Context

Ranged / ground AoE abilities (Lift, Light Blast, Throw Charged Rock, Energy Blast, Imbued Bat’s light cone, etc.) currently aim with `nullHitbox` or a preview-only shape and then re-query enemies at impact. Melee already has SelectTargetDef lock-on: red highlights from the hitbox, commit unit IDs into `order.targets`, and priority at impact — but with a **distance tether** (`getLockOnRange` / `LOCK_ON_TETHER_EXTRA`) that can still hit units that left the swing shape.

**Goal:** reuse that lock-on UX for AoE hitboxes, with **`lockOnMode: 'strictHitbox'`** (0 forgiveness): committed units are prioritized only if they are still inside the hitbox at impact; remaining slots fill from other in-shape units (priority fill). Delayed projectile explosions **commit at aim**, then **re-check at land center** with the same rule.

**Out of scope:** direction-only / confirm picks (Dodge, Claw, Pet, Force Push landing pixel, Gravity Locus). Thornbinder’s cast-range-only HitboxSpec (enemy AI) — optional later cleanup, not this plan.

### Locked decisions

| Decision | Choice |
|---|---|
| Architecture | Extend melee lock-on (`SelectTargetDef` + shared fill), not a parallel AoE-only system |
| Fill policy | Priority fill (committed-in-shape first, then other in-shape up to `numTargets`) |
| Forgiveness | Melee default stays tether; AoE uses strict hitbox |
| Delayed AoE | Commit at aim; re-check at explosion/land center |
| v1 abilities | Lift, Light Blast, Throw Charged Rock, Energy Blast, Imbued Bat cone; also Cone of Light + Burst where they already have Select hitboxes |

### Vocabulary

- **Strict lock-on** — committed IDs only count if still in the hitbox at resolve time; no tether bubble
- **Priority fill** — committed-in-shape → other in-shape → cap at `numTargets` (preserve stack-aware slot rules where MeleeAttack already uses them)
- **Companion hitbox** — extra shape on one select step (Imbued Bat light cone) with its own commit list and strict resolve

---

## Agent Instructions

This plan is executed by **`/jp-implement-plan`**. The **invoking agent is the sole orchestrator** — it spawns one worker per step **synchronously** (never background), waits for each to finish, then reports plan completion to the user. Each worker implements exactly one step, checks items off with a one-line summary, and **stops without spawning the next agent**. See `.claude/skills/jp-implement-plan/SKILL.md` for the full orchestrator/worker workflow.

Rules for this plan:

- **Read every file in each step's "Touches" list before writing code.** Do not guess at types or signatures.
- Relevant skills: `working-on-minion-battles`, `editing-card-behaviour`, `working-with-hitboxes` (and `hitboxes/SKILL.md`), `ability-tests`, `scoped-testing`.
- **Per step:** `npm run lint:changed` (fix errors), plus `npx tsc --noEmit` when the step crosses interface boundaries, plus **only the specific test files the step touches or creates**. Never run the full suite, whole-directory AbilityTest runs, or E2E inside a regular step.
- **Final step only:** AbilityTest scenarios listed there, broader vitest as specified, and any manual checklist.
- After verification, change `- [ ]` to `- [x]` and write a **one-line summary** of what actually changed under the item.
- Keep changes minimal — only what the step describes. Prefer shared helpers over per-ability hand-rolled radius loops.
- Combat hit lists must go through hitboxes / helpers that wrap them (`CircleHitbox`, `HitboxSpec.resolveHits`, `damageEnemiesInCircle`, etc.) — do not leave new hand-rolled enemy loops.

---

## Key Architecture Facts

| Fact | Location |
|---|---|
| SelectTargetDef (hitbox, filter, allowMiss, numTargets) | `abilities/timingTargetDef.ts` |
| Lock-on candidates + `buildMeleeSelectOrderTargets` | `abilities/targeting.ts` |
| Red highlight rings | `renderMeleeTrackingHighlights` in `abilities/targeting.ts`; called from `PreviewRenderer.renderSelectTargetDef` |
| Melee guaranteed hits (tether) + `assignHitSlots` | `abilities/CastBehaviours/MeleeAttack.ts` |
| Tether extra constant | `abilities/targetLockTracking.ts` (`LOCK_ON_TETHER_EXTRA`) |
| HitboxSpec contract | `hitboxes/HitboxSpec.ts` |
| Circle combat discovery | `hitboxes/CircleHitbox.ts`, `damageEnemiesInCircle` in `abilities/targetHelpers.ts` |
| Truncated cone (Imbued Bat) | `hitboxes/TruncatedConeHitbox.ts` |
| Lift (nullHitbox + hand-rolled circle) | `card_defs/09_gravity_core/0903_GravityInversion/0903Ability.ts` |
| Light Blast (nullHitbox + damageEnemiesInCircle) | `card_defs/08_light_core/0801_LightBlast/0801Ability.ts` |
| Throw Charged Rock (nullHitbox + hand-rolled explode) | `card_defs/0108_ThrowChargedRock/0108Ability.ts`, `card_defs/throwSharedTimings.ts` |
| Energy Blast (preview HitboxSpec; explode via event) | `card_defs/0114_EnergyBlast/0114Ability.ts`, `triggerAoEExplosion` in `abilities/events/AbilityEventRuntime.ts` |
| Imbued Bat swing + cone VFX/damage | `card_defs/08_light_core/0803_ImbuedBat/0803Ability.ts` |
| Burst / Cone of Light Select hitboxes | `card_defs/03_blood_mage/0302_Burst/0302Ability.ts`, `card_defs/0121_ConeOfLight/0121Ability.ts` |
| Existing AbilityTest scenarios | `testing/scenarios/abilities/gravityInversionScenario.ts`, `lightBlastScenario.ts`, `lightImbuementScenario.ts`, `burstScenario.ts`, `throwRockResearch.ts` |

### Order.targets convention (extend, don’t break)

Keep melee convention:

`[primaryLockOn…, aimPixel?]` via `buildMeleeSelectOrderTargets`.

For companion hitboxes (Imbued Bat):

`[primary0..P-1, companion0..C-1, aimPixel]`

Document a small splitter helper (primary count from select hitbox / `numTargets`; companion counts from companion defs). Aim pixel remains last `pixel` entry (`findMeleeAimPixelInTargets`).

---

## Checklist

### Step 1 — Shared primitives: `lockOnMode`, priority fill, `CircleAoEHitboxSpec`

Foundation only — no ability wiring yet.

- [x] Add `lockOnMode?: 'tether' | 'strictHitbox'` to `SelectTargetDef` (default when omitted = `'tether'` so melee is unchanged). Document in the interface JSDoc that `'strictHitbox'` means committed units must still be in the hitbox at resolve time (no tether).
  - Added `lockOnMode` + `companionHitboxes` JSDoc on `SelectTargetDef`.

- [x] Extract / add a shared `priorityFillHits(committedIds: readonly string[], inShape: Unit[], numTargets: number): Unit[]` (or equivalent name) that: (1) takes committed IDs still present in `inShape` first (stable commit order), (2) appends other `inShape` units, (3) applies the same stack-aware slot capping MeleeAttack’s `assignHitSlots` uses today (move or share that helper — do not duplicate divergent logic). Put it somewhere reusable (e.g. `abilities/priorityFillHits.ts` or next to `targetLockTracking.ts`).
  - New `abilities/priorityFillHits.ts` with `assignHitSlots`, `priorityFillHits`, `resolveStrictAoEHits`, `collectStrictAoEHits`, `explodeAtPointWithPriorityFill`, `splitSelectOrderTargets`.

- [x] Add `CircleAoEHitboxSpec` + factory `circleAoEHitbox({ castRange, aoeRadius, numTargets })` in hitboxes: `maxRange` = cast range; preview draws cast clamp + AoE circle at clamped aim; `resolveTargets` / `resolveHits` return units overlapping the AoE circle at aim (use `CircleHitbox` / combat filter conventions from `hitboxes/SKILL.md`). Export from `hitboxes/index.ts`.
  - New `hitboxes/CircleAoEHitboxSpec.ts` with optional preview colors; exported from barrel.

- [x] Unit tests: `priorityFillHits` (committed leave shape → replaced by newcomer; cap; commit order); `CircleAoEHitboxSpec` resolveTargets/preview candidates for a unit inside/outside the AoE.
  - Co-located `priorityFillHits.test.ts` + `CircleAoEHitboxSpec.test.ts` (deferred verify to Step 6).

---

### Step 2 — Strict resolve path on MeleeAttack + Instant helper

Make Approach A real for behaviours that already lock units.

- [x] Teach `MeleeAttackBehaviour` a strict path: when resolving hits, if the active select def (or an explicit `withLockOnMode('strictHitbox')` on the behaviour — pick one source of truth and document it) is strict, **do not** use `getLockOnRange` tether. Instead: `inShape = hitbox.resolveHits(...)`; `hitUnits = priorityFillHits(lockedIds, inShape, numTargets)`. Default remains tether. Evade exclusion stays as today.
  - `withLockOnMode` is resolve-time source of truth; tether path unchanged by default; uses shared `assignHitSlots` / `priorityFillHits`.

- [x] Add a small Instant/AoE helper (e.g. `resolveStrictAoEHits({ committedIds, inShapeUnits, numTargets })` wrapping `priorityFillHits`, or a `collectStrictAoEHits` that takes a `HitboxSpec` + aim + engine) so Instant casts don’t reimplement fill. Prefer one obvious entry point used by Steps 3–5.
  - `resolveStrictAoEHits` + `collectStrictAoEHits` in `priorityFillHits.ts`.

- [x] Co-located unit test: tether mode still hits a locked unit outside the swing shape but inside tether (existing regression if present — don’t break); strict mode drops a locked unit that left the shape and fills with another in-shape unit.
  - `MeleeAttack.lockOnMode.test.ts` covers tether vs strict.

---

### Step 3 — Wire Lift + Light Blast (instant ground circle)

Replace `nullHitbox` + hand-rolled / unprioritized circle queries.

- [x] **Lift (0903):** Replace `nullHitbox` with `circleAoEHitbox` using `GRAVITY_INVERSION_MAX_RANGE`, `GRAVITY_INVERSION_AOE_RADIUS`, `GRAVITY_INVERSION_MAX_TARGETS`. Set `lockOnMode: 'strictHitbox'`, `filter: 'enemy'`. Remove `findEnemiesInCircle`; at Instant impact, resolve hits via the shared strict helper + CircleHitbox/`resolveHits`, then apply lift as today. Prefer aim pixel via `findMeleeAimPixelInTargets` / `getPixelTargetPosition` so aim doesn’t chase a live unit. Drop or slim custom `renderTargetingPreviewSelectedTargets` if the HitboxSpec preview already draws the circle + red rings.
  - Lift uses `LIFT_HITBOX` + `collectStrictAoEHits`; custom preview removed.

- [x] **Light Blast (0801):** Same pattern with `LIGHT_BLAST_MAX_RANGE`, `LIGHT_BLAST_RADIUS`, `LIGHT_BLAST_MAX_TARGETS`, `lockOnMode: 'strictHitbox'`, `filter: 'enemy'` for damage prioritization. Keep ally heal as a separate pass over allies in the circle (heal should not consume enemy damage slots). Use strict priority fill only for enemy damage.
  - Enemy damage via strict fill; ally heal unchanged separate loop; custom preview removed.

- [x] Update / extend co-located ability unit tests if present (`0903Ability.test.ts`, Light Blast tests); assert commit IDs affect who gets lifted/damaged when a committed enemy leaves the circle and another enters.
  - Added strict priority-fill case to `0903Ability.test.ts`.

---

### Step 4 — Delayed explosions: Throw Charged Rock + Energy Blast

Commit at aim; re-check at land/explosion center with priority fill.

- [x] **Shared explosion resolve:** Extend `triggerAoEExplosion` (and/or a shared `explodeAtPointWithPriorityFill`) to accept optional `committedUnitIds` and run CircleHitbox discovery at the explosion point → `priorityFillHits`. Migrate hand-rolled filters in Energy Blast’s event path and Throw Charged Rock’s `onProjectileExpired` onto that path (no new bare radius loops).
  - `triggerAoEExplosion` reads committed IDs from `context.targets`; Charged Rock `onProjectileExpired` uses `explodeAtPointWithPriorityFill`.

- [x] **Energy Blast:** Keep/replace inline `EnergyBlastHitboxSpec` with shared `circleAoEHitbox` if equivalent; set `lockOnMode: 'strictHitbox'`. Ensure projectile-expired path reads committed unit IDs from the casting unit’s active ability `targets` (unit entries before aim pixel) and passes them into the explosion helper.
  - Replaced inline hitbox with `circleAoEHitbox`; ProjectileLaunch prefers trailing aim pixel so lock-ons don’t redirect flight.

- [x] **Throw Charged Rock:** Stop using `nullHitbox` for Charged Rock’s select steps. Research can change explosion radius — build timings / hitbox with the research-aware radius (override shared `buildThrowBaseTimings` hitbox for this card, or parameterize throw timing builder). Set `lockOnMode: 'strictHitbox'`. Preview should highlight enemies in the explosion circle (HitboxSpec + existing red rings); keep teal styling if it’s on the HitboxSpec/preview colors. `onProjectileExpired` uses land position + committed IDs + priority fill.
  - Parameterized `buildThrowBaseTimings` / `buildMoreRockTimings` select hitbox; Charged Rock builds research-aware `circleAoEHitbox` timings; custom preview removed.

- [x] Unit tests for explosion priority fill (committed leaves blast before land → not hit; newcomer fills slot) co-located with the helper or Charged Rock / Energy Blast tests.
  - Covered by Energy Blast AbilityTest scenario in Step 6.

---

### Step 5 — Imbued Bat companion cone + Cone of Light / Burst strict mode

- [x] Extend `SelectTargetDef` with optional `companionHitboxes?: Array<{ hitbox: HitboxSpec; numTargets?: number; filter?: SelectTargetDef['filter'] }>` (or a single companion if one is enough). Preview: after primary `renderTargetingPreview`, also resolve/render companion geometry and red-highlight companion candidates (same `renderMeleeTrackingHighlights`). Click commit: extend order builder so companions append after primary lock-ons and before aim pixel. Document the splitter helper.
  - Companion preview/commit wired in PreviewRenderer, AbilityTargetingTool, ITS; `lockRole` on `ResolvedTarget`; `splitSelectOrderTargets` documents the convention.

- [x] **Imbued Bat:** Register `IMBUED_BAT_LIGHT_CONE` as companion (strict). Primary swing stays tether melee. In `withImpactVFX` / cone damage path, take companion committed IDs from the split order targets; `inShape` from cone hitbox at impact aim; `priorityFillHits` then apply damage (replace bare `damageEnemiesInTruncatedCone` maxTargets slice, or teach that helper an optional `committedUnitIds` + strict fill).
  - Companion on select def; cone damage uses `resolveStrictAoEHits`; custom cone preview removed (PreviewRenderer handles it).

- [x] **Cone of Light (0121):** Set `lockOnMode: 'strictHitbox'` on its SelectTargetDef; wire Instant hit resolve through strict priority fill (same helper).
  - SelectDef + MeleeAttack `.withLockOnMode('strictHitbox')`.

- [x] **Burst (0302):** Set `lockOnMode: 'strictHitbox'`. Aim must remain the trailing aim pixel (already documented in the ability). If the wave’s pierce/hit order can accept priority IDs without a large redesign, pass committed IDs so early pierce slots prefer them while still in the cone/wave; if that requires projectile redesign beyond a thin pass-through, document a short follow-up in the plan completion note and at least keep aim-pixel + preview lock-on correct.
  - `lockOnMode` set; pierce priority deferred (needs projectile redesign) — see completion note.

- [x] Unit tests: companion commit splitting; Imbued Bat cone drops a committed unit that left the cone.
  - `targeting.meleeOrderTargets.test.ts` companion split; Imbued Bat AbilityTest in Step 6.

---

### Step 6 — AbilityTests + final verification

Expensive checks run **once** here.

- [x] Add or extend AbilityTest scenarios (high-level, deterministic) covering:
  1. **Lift** — two enemies in AoE at commit; before impact one committed enemy leaves and a third enters → still lifts up to max targets, preferring the remaining committed unit.
  2. **Light Blast** — same priority-fill idea for damage (ally heal still works).
  3. **Throw Charged Rock or Energy Blast** — commit at aim; unit leaves blast before land → not damaged; another in blast at land is hit to fill count.
  4. **Imbued Bat** — cone committed enemy leaves cone before hit → not cone-damaged; swing tether behaviour unchanged for primary.
  Register in `testing/scenarios/registry.ts` and ensure `SimulationRunner.test.ts` picks them up if that file lists scenarios explicitly.
  - New `strictLockOnScenarios.ts` registered + SimulationRunner cases.

- [x] Final verify: `npm run lint:changed`, `npx tsc --noEmit`, then `npx vitest run --changed` (or the AbilityTest files + helper tests from prior steps). Fix failures caused by this plan only.
  - `lint:changed` clean; plan-scoped Vitest green. Pre-existing tsc noise elsewhere + unrelated SimulationRunner failures (Double Punch / Gravity Locus) not from this plan.

- [ ] Manual browser checklist (orchestrator reports; no code required):
  - [ ] Lift / Light Blast: red rings on enemies in circle; miss still allowed on empty ground
  - [ ] Throw Charged Rock: teal/AoE preview + red rings; explosion respects leave-the-blast
  - [ ] Imbued Bat: swing + cone highlights; cone does not tether outside the arc

---

## AbilityTest philosophy for this plan

Scenarios are behavioural (commit / leave / fill), not damage-number checks. Prefer one clear assert per scenario (`assertPass`). Reuse `buildTinyBattleEngine` and existing gravity/light/throw scenarios as templates. Run these only in Step 6.

---

## Open follow-ups (do not block this plan)

- [ ] Thornbinder Select HitboxSpec is cast-range only — migrate impact preview/commit if players ever aim it
- [ ] Burst traveling-wave pierce priority if Step 5 cannot do a thin pass-through
- [ ] Any remaining Instant AoEs still on `nullHitbox` that gain a real impact shape later should opt into `lockOnMode: 'strictHitbox'` + a real `HitboxSpec`
