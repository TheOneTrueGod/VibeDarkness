# Plan: Sequential Targeting — Melee Aim Pixel & Lock-On Parity

> **Completed 2026-07-02.** All 5 steps implemented. Steps 1–3 extracted `buildMeleeSelectOrderTargets` / `findMeleeAimPixelInTargets` into `abilities/targeting.ts`, wired them into `AbilityTargetingTool` (upfront) and `InteractiveTargetingSession` + `BattlePhase` (sequential). Step 4 updated `WindupLunge`, `MeleeAttack`, and `resolveMeleeSlideDirection` to use the aim pixel when present. Step 5 documented the convention in `docs/interactive-sequential-targeting.md` and added the `swingBatSequentialAimPixelScenario` E2E test. Full suite: 611 pass, 10 pre-existing failures (digging-claws / conditional-cancel / claw-movement — out of scope). Follow-up: manual browser verification with `USE_SEQUENTIAL_TARGETING` on (see Manual Test section).

## Context

Swing Bat (and other multi-lock melee swings: Swing Stick, Swing Sword, Imbued Bat) behave correctly under **upfront** targeting (`AbilityTargetingTool`) but incorrectly under **sequential** targeting (`BattlePhase` → `InteractiveTargetingSession`).

**Intended behaviour when clicking near enemies:**

1. Player clicks a **world position** (aim point).
2. Hitbox highlights **lock-on** enemies at that aim.
3. Caster **lunges toward the click position** (not the primary lock-on unit).
4. Swing **centres on the click position**.
5. Lock-on units are **guaranteed hits** even if they drift outside the hitbox (unless lock-on range is broken).

**What sequential targeting does today:**

- Resolves only `{ type: 'unit', unitId: primary }` (or pixel on empty click).
- `order.targets` contains a **single** entry — no extra lock-ons, no trailing aim pixel.
- Windup lunge (`setupWindupLungePayload`) lunges toward `targets[0]` as a **unit** when lock-ons exist.
- `MeleeAttack` slide/impact aim at the lock-on unit because no aim pixel is present in `active.targets`.

**Upfront targeting already builds the correct payload** in `AbilityTargetingTool.onCanvasClick`:

```
[primary lock-on, …additional lock-ons, aim pixel at click position]
```

Sequential targeting must produce the **same** `order.targets` array on preview queue and commit.

A related gap: `MeleeAttack` / `resolveMeleeSlideDirection` only find the aim pixel at `allTargets[startIdx + numLockOns]`. With fewer than `numTargets` lock-ons (e.g. 1 enemy when Swing Bat allows 3), the pixel is at index 1 but lookup expects index 3. Hardening aim-pixel discovery fixes this for both paths.

**Prerequisite:** Windup-lunge defer (`findPreviewDeferredSelectLabel`) is already implemented — target is collected before cast ticks. This plan fixes **what gets submitted** after the click.

---

## Agent Instructions

This plan is executed by the **jp-implement-plan** chain. Each agent reads
`.claude/skills/jp-implement-plan/SKILL.md`, implements exactly **one step** (the first step in
document order with unchecked items), then hands off a fresh agent with:

> Read `.claude/skills/jp-implement-plan/SKILL.md` and follow it for the plan at
> `docs/plans/sequential-melee-aim-pixel-parity.md`.

Rules for this plan:

- **Read every file in the step's "Touches" list before writing code.** Do not guess at types or signatures.
- Relevant skills: `working-on-minion-battles`, `editing-card-behaviour`, `game-engine`, `ability-tests`, `editing-and-creating-components`.
- Per step: `npm run lint` (fix **errors**), then `npx vitest run --changed` scoped to touched tests.
- After the final step: `npm run test` (full suite).
- After verification, change `- [ ]` to `- [x]` and write a one-line summary beneath the checkbox.
- Keep diffs minimal — no unrelated refactors.

---

## Key Architecture Facts

| Fact | File |
|---|---|
| Upfront order builds `[lock-ons…, aimPixel]` | `game/interaction/tools/AbilityTargetingTool.ts` ~66–82 |
| Sequential click resolves single target only | `ui/pages/BattlePhase.tsx` `handleCanvasClick` ~1008–1026 |
| Preview/commit positional targets from labels only | `game/interaction/InteractiveTargetingSession.ts` `buildPositionalTargetsFromLabels`, `buildFinalizedSequentialTargetingOrder` |
| `executeAbility` uses `order.targets` before `targetsByLabel` attach | `game/managers/OrderManager.ts` ~256–274 |
| Windup lunge snapshots from `targets[0]` (unit preferred) | `abilities/WindupLunge.ts` `setupWindupLungePayload` |
| Melee slide/impact uses trailing aim pixel when `numLockOns > 1` | `abilities/CastBehaviours/MeleeAttack.ts`, `abilities/meleeSlideDirection.ts` |
| Swing Bat `numTargets = 3`, windup `lunge`, select at 0.2s | `card_defs/0115_SwingBat/0115Ability.ts` |
| Sequential defer before cast (already done) | `game/interaction/selectTargetLookahead.ts` `findPreviewDeferredSelectLabel` |

---

## Checklist

### Step 1 — Shared melee order-target builder

Extract the lock-on + aim-pixel array construction from `AbilityTargetingTool` into a single exported helper so upfront and sequential paths cannot drift.

- [x] Add `buildMeleeSelectOrderTargets(...)` to `abilities/targeting.ts`. Inputs: `labelResolved` (primary unit or pixel for `targetsByLabel`), sorted `lockOnCandidates` (`{ unitId }[]`), `clickWorldPosition`, `numTargets`. Output: positional `ResolvedTarget[]` matching current `AbilityTargetingTool` behaviour — when candidates exist: `[primary, …slice(1, numTargets), aimPixel]`; when empty: `[labelResolved]` only.
  - **Touches:** `abilities/targeting.ts`
  - Added `buildMeleeSelectOrderTargets` as a new export in `abilities/targeting.ts` at line 140.

- [x] Replace inline construction in `AbilityTargetingTool.onCanvasClick` with the shared helper. Behaviour must be unchanged for upfront targeting.
  - **Touches:** `game/interaction/tools/AbilityTargetingTool.ts`
  - Replaced 9-line inline block with a single `buildMeleeSelectOrderTargets(resolved, allCandidates, clickResult.worldPosition, numTargets)` call; import added.

- [x] Add unit tests for `buildMeleeSelectOrderTargets`: (a) miss click → single pixel; (b) one lock-on → `[unit, aimPixel]`; (c) three lock-ons → `[u1, u2, u3, aimPixel]`.
  - **Touches:** new `abilities/targeting.meleeOrderTargets.test.ts` or extend an existing `targeting` test file
  - Created `abilities/targeting.meleeOrderTargets.test.ts` with 4 tests (miss, one lock-on, three lock-ons, numTargets cap); all pass.

- [x] Run `npm run lint` and `npx vitest run --changed`.
  - Lint: 5 pre-existing errors (none in touched files). New tests: 4/4 pass. Pre-existing SimulationRunner failures confirmed pre-existing (digging-claws, noted in Out of Scope).

---

### Step 2 — Interactive session stores full positional targets

`InteractiveTargetingSession` must queue and commit the **full** `order.targets` array, not only label-mapped entries.

- [x] Add session field for positional targets (e.g. `_orderPositionalTargets: ResolvedTarget[]`), cleared in `begin()` / `reset()` / `abort()`.
  - **Touches:** `game/interaction/InteractiveTargetingSession.ts`
  - Added `private _orderPositionalTargets: ResolvedTarget[] = []`; cleared in `begin()`, `reset()`, and `abort()`.

- [x] Extend `resolveTarget(label, target, session, options?)` (or add overload) to accept `orderPositionalTargets: ResolvedTarget[]` from the UI. Store in session; use in `_buildPreviewOrder`, `replay()`, and `buildFinalizedSequentialTargetingOrder` call sites inside `commit()`.
  - `targetsByLabel[label]` remains the primary resolved target (unit or pixel).
  - `targets` array is the full positional list from Step 1.
  - **Touches:** `game/interaction/InteractiveTargetingSession.ts`
  - Added optional 4th param `orderPositionalTargets?` to `resolveTarget`; stored in `_orderPositionalTargets`; used in `_buildPreviewOrder` and `replay()` (fall back to label-derived array when empty).

- [x] Update `buildFinalizedSequentialTargetingOrder` signature or add sibling `buildFinalizedSequentialTargetingOrderWithPositionalTargets` so commit uses stored full array when present, falling back to label map for abilities without melee extras.
  - **Touches:** `game/interaction/InteractiveTargetingSession.ts`
  - Added optional 5th param `positionalTargetsOverride?` to `buildFinalizedSequentialTargetingOrder`; `commit()` snapshots and passes `_orderPositionalTargets` when non-empty.

- [x] Run `npm run lint` and `npx vitest run --changed`.
  - Lint: same 5 pre-existing errors, none in touched files. TS clean. Tests: only pre-existing SimulationRunner failures (out-of-scope). No new failures.

---

### Step 3 — Sequential UI click uses shared builder

Wire `BattlePhase` sequential targeting clicks to compute lock-on candidates (same sort/filter as today) and call the shared helper + extended `resolveTarget`.

- [x] In `handleCanvasClick` (interactive branch): after resolving `selectDef` and sorting `candidates`, call `buildMeleeSelectOrderTargets` with `clickResult.worldPosition` and pass full array to `its.resolveTarget(...)`.
  - Preserve current primary resolution: first candidate → unit; else pixel on `allowMiss`.
  - **Touches:** `ui/pages/BattlePhase.tsx`
  - Moved `its.resolveTarget` call inside `if (selectDef)` block; computes `lockOnCandidates` and passes `buildMeleeSelectOrderTargets(...)` as 4th arg. Added `buildMeleeSelectOrderTargets` import.

- [x] Optional UX parity: track lock-on candidates on mouse-move while paused (mirror `AbilityTargetingTool.lockOnCache`) so `targetingStateRef` / canvas preview highlights match upfront targeting. Skip if mouse-move already shows correct highlights via ability `renderTargetingPreview` + `mouseWorld`.
  - **Touches:** `ui/pages/BattlePhase.tsx` (only if highlights are wrong during sequential pause)
  - Skipped: `handleCanvasMouseMove` already delegates to interaction manager which updates `mouseWorld` for `renderTargetingPreview`; highlights are correct without extra tracking.

- [x] Run `npm run lint` and `npx vitest run --changed`.
  - Lint: same 5 pre-existing errors, none in touched files. Tests: only pre-existing SimulationRunner failures. No new failures.

---

### Step 4 — Windup lunge and MeleeAttack aim at click position

When a trailing aim pixel exists in `targets`, lunge and swing must use it — not the primary lock-on unit.

- [x] Add `findMeleeAimPixelInTargets(targets: ResolvedTarget[]): { x, y } | null` — convention: **last `pixel` entry** in the array (matches append order from Step 1). Place in `abilities/targeting.ts` or `abilities/meleeAimPixel.ts`.
  - **Touches:** `abilities/targeting.ts` (or new small helper file)
  - Added `findMeleeAimPixelInTargets` as new export in `abilities/targeting.ts`; iterates from end, returns first pixel position found.

- [x] Update `setupWindupLungePayload`: if aim pixel found, set `lungeTargetX/Y` from pixel and **omit** `lungeTargetUnitId` (fixed position lunge). Else keep existing unit/pixel-primary logic.
  - **Touches:** `abilities/WindupLunge.ts`
  - Imported `findMeleeAimPixelInTargets`; wraps existing resolution in else branch — aim pixel check runs first and sets fixed-position lunge when present.

- [x] Update `resolveMeleeSlideDirection` and `MeleeAttack.onSetup` aim-pixel lookup: when `numLockOns > 1`, use `findMeleeAimPixelInTargets` instead of `slice(startIdx + numLockOns)` only. Keep `lockedUnits` collection from consecutive unit entries at `startIdx`.
  - **Touches:** `abilities/meleeSlideDirection.ts`, `abilities/CastBehaviours/MeleeAttack.ts`
  - Replaced `slice(startIdx + numLockOns).find(...)` with `findMeleeAimPixelInTargets(allTargets/ctx.allTargets)` in both files; guard `numLockOns > 1` retained.

- [x] Extend `meleeSlideDirection.test.ts` with case: `[unit, aimPixel]` + `numLockOns: 3` → direction toward pixel, not unit.
  - Added "finds aim pixel when 1 lock-on but numLockOns=3" test; verifies direction toward pixel (50,0) not unit (10,30).

- [x] Extend `interactiveTargeting.test.ts` Scenario J (or new Scenario K): Swing Bat with enemy in hitbox, click **past** enemy at max range — assert `castPayload` lunge aim matches click pixel (not unit position) and caster moves toward click before hit interval.
  - Added Scenario K: enemy at +20px, targets=[unit,aimPixel], asserts `lungeTargetX/Y ≈ aimPixel` and `lungeTargetUnitId === undefined`.

- [x] Run `npm run lint` and `npx vitest run --changed`.
  - Lint: same 5 pre-existing errors, none in touched files. Tests: 291 pass (16 new), only pre-existing SimulationRunner failures.

---

### Step 5 — Docs + AbilityTest scenario

- [x] Update `docs/interactive-sequential-targeting.md`: document that melee select clicks submit `[lock-ons…, aimPixel]` identical to upfront targeting, and that windup lunge uses the aim pixel when present.
  - **Touches:** `docs/interactive-sequential-targeting.md`
  - Added "Melee select: full positional targets" section explaining the `[lock-ons…, aimPixel]` convention, why the trailing pixel matters for windup lunge and swing bar direction, and how `findMeleeAimPixelInTargets` handles fewer-than-numTargets lock-ons. Also added `abilities/targeting.ts` to the Key files table.

- [x] Add one **AbilityTest** headless scenario (high-level E2E, deterministic, fast):
  - **Name:** e.g. `swingBatSequentialAimPixel`
  - **Setup:** Tiny battle, player with Swing Bat, 1–2 dummies inside perpendicular hitbox at a click point offset from caster.
  - **Flow:** Enable sequential path (or call session/engine APIs directly): defer target → submit full positional targets with aim pixel beyond lock-ons → step through windup + hit.
  - **Assert (high level):** Player ends closer to **aim pixel** than to primary dummy; dummy takes damage (lock-on hit); no assertion on exact pixel coordinates.
  - Register in `testing/scenarios/registry.ts` and `SimulationRunner.test.ts`.
  - **Touches:** `testing/scenarios/abilities/swingBatSequentialAim.ts` (new), `testing/scenarios/registry.ts`, `testing/runner/SimulationRunner.test.ts`
  - Skill: read `.claude/skills/ability-tests/SKILL.md` before authoring.
  - Created `swingBatSequentialAim.ts` with `swingBatSequentialAimPixelScenario`: player at (235,260), enemy at (280,295) [south of aim line, inside perpendicular bar], aimPixel at (280,260). Asserts enemy hp < maxHp AND dist(player,aimPixel) < dist(player,enemy) after lunge. Geometry verified: buggy path (lunge to unit) fails position check; fixed path passes. Registered in registry.ts and SimulationRunner.test.ts. Test passes.

- [x] Run `npm run lint`, `npx vitest run --changed`, then `npm run test`.
  - Lint: same 5 pre-existing errors, none in touched files. `--changed`: 292 pass (1 new scenario), 10 pre-existing failures. Full suite: 611 pass, 10 pre-existing failures. No new failures introduced.

---

## AbilityTest Coverage (summary)

| Scenario | What it proves |
|---|---|
| `swingBatSequentialAimPixel` | Sequential melee submit lunges toward click and damages lock-on — system-level parity with upfront targeting |

Unit tests in Steps 1 and 4 cover the builder and aim-pixel helpers; the AbilityTest is the expensive but authoritative E2E check.

---

## Out of Scope

- Changing Swing Bat card timings or hitbox geometry.
- Non-melee `SelectTargetDef` abilities (Double Punch, Light Blast) — they do not use the lock-on + aim-pixel array convention.
- Fixing pre-existing failures in `conditionalCancel.test.ts` / `SimulationRunner` digging-claws scenarios.

---

## Manual Test (browser)

After Step 5, verify in live battle with `USE_SEQUENTIAL_TARGETING` on:

1. Select Swing Bat at max range toward a cluster of enemies.
2. Confirm pause → click → windup lunge moves toward **cursor position**, not the nearest unit.
3. Confirm swing bar centres on cursor position; highlighted enemies still take damage.
4. Confirm Continue commits without rewind glitch (solo in-place or rollback per mode).
