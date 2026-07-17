# Plan: Interactive Sequential Targeting

> **COMPLETED 2026-06-22.** All 5 steps implemented and verified. Summary: added `USE_SEQUENTIAL_TARGETING` flag + `waitingForTargetInput`/`signalWaitingForTarget` to `GameEngine`, extended `ActiveAbility` with ephemeral `waitingForTargetIntervals`, refactored `unitAbilityTick.ts` with Pass A/B blocking and `fireIntervalEntry` helper (keyed on `targetsByLabel !== undefined` sentinel to avoid breaking normal ability flow), created `InteractiveTargetingSession` managing mark/restore/hold-remote-orders lifecycle, wired `BattleSession` with `restoreFromInMemorySnapshot` and routing in `applyRemoteOrders`/`submitPlayerOrder`, added targeting cursor + Reset/Replay/Confirm buttons to `BattlePhase.tsx`, and wrote 3 unit-test scenarios in `interactiveTargeting.test.ts`. Final suite: 556 pass, 4 pre-existing failures (unchanged). **Manual browser testing still required** for the Double Punch interactive flow.

## Context

Abilities with `SelectTargetDef` entries (e.g., Double Punch) currently require **all targets selected upfront** via `AbilityTargetingTool` before any animation plays. The goal is an interactive flow: the simulation plays out locally until each target selection point, pauses for the player's click, then continues. The player sees the windup before choosing a target, the first punch fires, then the second windup plays before choosing the second target.

The feature also adds a **Reset** button (go back to ability selection) and a **Replay** button (replay animation with targets chosen so far), and correctly holds remote orders from other players during the local preview.

**This is a local preview.** Only the selecting player's engine runs the preview. Other players' engines stay paused at `waitingForOrders`. Remote orders that arrive during preview are held and applied when the preview ends. Once all targets are set, the real order is submitted to the server from the marked (pre-preview) state.

**Feature flag:** `USE_SEQUENTIAL_TARGETING` in `featureFlags.ts`. When `false`, the existing upfront `AbilityTargetingTool` flow is used unchanged.

### Flow summary (Double Punch)

```
Game pauses (waitingForOrders)
  ↓
Player clicks Double Punch → InteractiveTargetingSession.begin()
  → mark = engine.toJSON()           // snapshot the pause state
  → queue preview order (no targets, endTurn: true)
  → tryResumeParallel() → engine runs locally
  ↓
Engine plays 0–0.2s windup animation
  ↓
punch1 interval enters at 0.2s → target "Target 1" missing from targetsByLabel
  → unitAbilityTick blocks the interval → engine.signalWaitingForTarget("Target 1", ...)
  → engine.isPaused = true  (gameTime FROZEN — fixedUpdate stops)
  ↓
UI shows targeting cursor for "Target 1"
Player clicks → resolveTarget("Target 1", target)
  → active.targetsByLabel["Target 1"] = target
  → engine.isPaused = false → fixedUpdate resumes
  ↓
Next tick: Pass B in unitAbilityTick sees interval in waitingForTargetIntervals + target resolved
  → fireIntervalEntry(punch1) → emitter + onSetup fires (one frame late, imperceptible)
Engine plays 0.2–0.5s (punch hits + windup2)
  ↓
punch2 interval enters at 0.5s → same pause flow for "Target 2"
  ↓
All targets collected → InteractiveTargetingSession.commit()
  → restoreFromInMemorySnapshot(mark)   // rewind engine
  → apply heldRemoteOrders
  → submit real order via BattleNet (normal flow)
```

---

## Agent Instructions

This plan is executed by the **jp-implement-plan** chain. Each agent reads
`.claude/skills/jp-implement-plan/SKILL.md`, implements exactly **one step** (the first step in
document order with unchecked items), then hands off a fresh agent with:

> Read `.claude/skills/jp-implement-plan/SKILL.md` and follow it for the plan at
> `docs/plans/interactive-sequential-targeting.md`.

Rules for this plan:

- **Read every listed file before writing any code.** Do not guess at types or signatures.
- Relevant skills: `working-on-minion-battles`, `game-engine`, `editing-card-behaviour`, `ability-tests`.
- After each step: run `npx tsc --noEmit` (fix all new errors), then `npx vitest run --changed`.
- After verification, change `- [ ]` to `- [x]` and write a one-line summary of what you actually changed.
- Keep changes minimal — only what the step describes. Do not refactor surrounding code.

---

## Key Architecture Facts

| Fact | File |
|---|---|
| `SelectTargetDef` shape + `getSelectTargetDefsFromTimings` | `abilities/targeting.ts`, `abilities/timingTargetDef.ts` |
| Timing interval entry/exit detection (`enteredTimingIds`) | `game/units/unitAbilityTick.ts` (top of per-ability loop) |
| `onSetup` is called once per behaviourKey via `setupFiredBehaviourKeys` | `game/units/unitAbilityTick.ts` ~line 164–168 |
| `ActiveAbility` interface (targets, targetsByLabel, setupFiredBehaviourKeys) | `game/types.ts` |
| `isPaused` freezes `fixedUpdate` (gameTime stops advancing) | `game/GameEngine.ts` |
| `loadFromSnapshot` tears down engine, rewires all callbacks | `game/BattleSession.ts:357` |
| `submitPlayerOrder` delegates to BattleNet | `game/BattleSession.ts:648` |
| `applyRemoteOrders` applies remote orders to engine | `game/BattleSession.ts:569` |
| `AbilityTargetingTool` handles current upfront selection | `game/interaction/tools/AbilityTargetingTool.ts` |
| `PlayerInteractionManager` wires tools to `BattlePhase` | `game/interaction/PlayerInteractionManager.ts` |
| Double Punch ability (two SelectTargetDef at 0.2s and 0.5s) | `card_defs/0116_DoublePunch/0116Ability.ts` |
| Existing Double Punch scenario (regression baseline) | `testing/scenarios/abilities/doublePunchScenario.ts` |

---

## Checklist

---

### Step 1 — Feature flag + engine `waitingForTargetInput` signal + `ActiveAbility` type

Pure additions only. No behavioral changes. Sets up the surface area that Steps 2–4 build on.

**Touches:** `app/js/games/minion_battles/featureFlags.ts` (NEW),
`app/js/games/minion_battles/game/GameEngine.ts`,
`app/js/games/minion_battles/game/types.ts`

- [x] Create `app/js/games/minion_battles/featureFlags.ts` with:
  ```ts
  export const USE_SEQUENTIAL_TARGETING = false;
  ```
  Start with `false` so nothing changes in game yet; Step 4 will flip it on after UI is wired.
  Created `app/js/games/minion_battles/featureFlags.ts` exporting `USE_SEQUENTIAL_TARGETING = false`.

- [x] In `GameEngine.ts`, add a non-serialized runtime field and a helper:
  ```ts
  waitingForTargetInput: { label: string; unitId: string; abilityId: string } | null = null;

  signalWaitingForTarget(label: string, unitId: string, abilityId: string): void {
      this.waitingForTargetInput = { label, unitId, abilityId };
      this.isPaused = true;
  }
  ```
  Do NOT include `waitingForTargetInput` in `toJSON`/`fromJSON` — it is ephemeral.
  Added `waitingForTargetInput` field (after `cellOccupancyManager`) and `signalWaitingForTarget` method (after `interruptUnitAndRefundAbilities`) to `GameEngine.ts`; not included in toJSON/fromJSON.

- [x] In `game/types.ts`, add an optional field to `ActiveAbility`:
  ```ts
  /** Intervals blocked waiting for a SelectTargetDef target. Ephemeral — not serialized. */
  waitingForTargetIntervals?: Set<string>;
  ```
  In `ActiveAbility` serialization (within `Unit.toJSON`), omit this field (serialize as nothing or empty). In `fromJSON` deserialization, default to `undefined`.
  Added `waitingForTargetIntervals?: Set<string>` to `ActiveAbility` in `game/types.ts`; Unit.toJSON already excludes ephemeral fields by explicit mapping so no serialization change needed.

- [x] Run `npx tsc --noEmit`. Run `npx vitest run --changed`. No failures expected — these are pure additions.
  tsc: no new errors from Step 1 changes (pre-existing errors in other files unchanged). vitest --changed: 16 pass, 1 pre-existing fail (conditionalCancel.test.ts `ticksInRockDuringThrowRockCooldown`).

---

### Step 2 — `unitAbilityTick.ts`: blocking & deferred re-entry

The core engine mechanism. When an ability interval is entered but its `SelectTargetDef` target is not yet in `active.targetsByLabel`, block the interval from firing and record it in `waitingForTargetIntervals`. On subsequent ticks, re-fire those intervals once their target is resolved.

**Touches:** `app/js/games/minion_battles/game/units/unitAbilityTick.ts`

Read the full file before editing. The existing structure has two separate loops over `intervals`: an **emitter loop** (lines ~75–135) and a **castBehaviours loop** (lines ~137+), both iterated after `entered`/`exited` sets are computed. There is also an **exited loop**. The changes below add two new passes and guards to the existing loops.

- [x] **Extract `fireIntervalEntry` helper.** Move the emitter-creation block (currently inside the emitter loop when `entered.has(interval.id)`) and the castBehaviour `onSetup` + `activeCastBehaviours` registration block (currently inside the castBehaviours loop when `entered.has(interval.id)`) into a shared function:
  ```ts
  function fireIntervalEntry(interval, active, unit, ability, engine, dt): void
  ```
  Both the existing `entered`-based loop paths and the new deferred-resume path in Pass B will call this helper. This step should produce identical runtime behavior — zero functional change, just restructuring.
  Extracted `fireIntervalEntry` as a module-level function at the top of `unitAbilityTick.ts`; collapsed the original two-loop emitter+castBehaviours enter path into a single loop calling the helper. Also re-applied Step 1 changes to `GameEngine.ts` and `types.ts` that were lost to a git stash.

- [x] **Pass B — resume waiting intervals.** Insert BEFORE the emitter loop:
  ```ts
  if (active.waitingForTargetIntervals?.size) {
      for (const waitingId of [...active.waitingForTargetIntervals]) {
          const interval = intervals.find(i => i.id === waitingId);
          if (!interval?.targetDef || interval.targetDef.kind !== 'select') continue;
          if (!active.targetsByLabel?.[interval.targetDef.label]) continue; // still waiting
          active.waitingForTargetIntervals!.delete(waitingId);
          fireIntervalEntry(interval, active, unit, ability, engine, dt);
      }
  }
  ```
  Inserted Pass B before the entry/exit loop; iterates `waitingForTargetIntervals` and fires `fireIntervalEntry` for each resolved label.

- [x] **Pass A — detect newly-blocking intervals.** Insert AFTER Pass B, still before the emitter loop. Build `newlyBlockedIntervals: Set<string>` for intervals that (a) are in `entered`, (b) have a `SelectTargetDef`, and (c) have no resolved target yet and haven't already fired setup:
  Inserted Pass A after Pass B. KEY DEVIATION from plan pseudo-code: Pass A only runs when `active.targetsByLabel !== undefined` (i.e., the order was submitted via the interactive preview path with `targetsByLabel: {}`). Normal pre-filled orders leave `targetsByLabel` as `undefined`, so Pass A is a no-op for them. This was required because many abilities (e.g., Heel, defineMeleeStrike-based punches) declare `SelectTargetDef` on their intervals but rely on `active.targets[]` for normal operation — blocking them unconditionally broke 31 tests.

- [x] **Guard the emitter loop.** In the emitter loop, at the top of the interval iteration: `if (newlyBlockedIntervals.has(interval.id)) continue;` — prevents emitter firing before target is selected.
  Guard applied to the combined emitter+castBehaviour entry loop.

- [x] **Guard the castBehaviours loop.** In the castBehaviours loop (the existing `onSetup` / `activeCastBehaviours` path), at the top: `if (newlyBlockedIntervals.has(interval.id)) continue;` — prevents `onSetup` before target is selected.
  The separate castBehaviours enter loop was merged into `fireIntervalEntry`; the guard is applied via `newlyBlockedIntervals` check before calling `fireIntervalEntry` in the entry/exit loop.

- [x] **Guard the exited loop.** In the exited / cleanup loop, skip any interval in `active.waitingForTargetIntervals` (which never entered `activeCastBehaviours` so exit processing is meaningless):
  `if (active.waitingForTargetIntervals?.has(interval.id)) continue;`
  Guard added to both the emitter-exit path and the castBehaviours-exit loop.

- [x] Run `npx tsc --noEmit`. Run `npx vitest run --changed`. The existing `doublePunchDeathFallbackScenario` must still pass. Other ability scenarios must be unaffected (they all have targets pre-filled in `targetsByLabel`, so `newlyBlockedIntervals` will always be empty for them).
  tsc: no new errors (pre-existing `Unit.ts(893)` unchanged). vitest --changed: 216 pass, 4 pre-existing failures (3 shield maxUses, 1 conditionalCancel). Full suite: 553 pass, 4 pre-existing failures. Also added `signalWaitingForTarget` to `EngineContext` interface.

---

### Step 3 — `InteractiveTargetingSession` + `BattleSession` routing

Implement the session object that manages mark/restore/hold-remote-orders, and wire it into `BattleSession`.

**Touches:**
`app/js/games/minion_battles/game/interaction/InteractiveTargetingSession.ts` (NEW),
`app/js/games/minion_battles/game/BattleSession.ts`

Read `BattleSession.ts` in full — especially `loadFromSnapshot`, `applyRemoteOrders`, and `submitPlayerOrder` — before editing.

- [x] Create `app/js/games/minion_battles/game/interaction/InteractiveTargetingSession.ts`.
  The class manages:
  - `mark: SerializedGameState` — snapshot taken at `begin()`
  - `collectedTargets: Record<string, ResolvedTarget>` — filled per `resolveTarget()` call
  - `heldRemoteOrders: Map<string, { atTick: number; order: BattleOrder }>` — latest per `unitId`
  - `currentLabel: string | null` — the label waiting for input right now
  - `savedOnParallelBatchResolved` — saved callback, replaced with no-op during preview

  Key methods:
  - **`begin(abilityId, unitId, session)`**: snapshot engine (`engine.toJSON()`), save & replace `onParallelBatchResolved` with a no-op, queue preview order `{ unitId, abilityId, targets: [], targetsByLabel: {}, endTurn: true }` via `engine.state.orderMgr.applyOrder(...)`, which triggers `tryResumeParallel()` and starts the engine running. Set `currentLabel` to the first unresolved SelectTargetDef label.
  - **`resolveTarget(label, target)`**: store in `collectedTargets`, set `active.targetsByLabel[label]` on the caster's active ability in the engine, clear `engine.waitingForTargetInput`, set `engine.isPaused = false`.
  - **`_restoreToMark(session)`**: call `session.restoreFromInMemorySnapshot(mark)` (see below), then for each held order apply it via `engine.state.orderMgr.applyOrder()`, then restore the saved `onParallelBatchResolved` callback.
  - **`reset()`**: call `_restoreToMark()`, clear all state.
  - **`replay()`**: call `_restoreToMark()`, queue the ability order pre-filled with all `collectedTargets`, let engine run (no target pauses since targets are present).
  - **`commit()`**: call `_restoreToMark()`, then submit the real order via `session.netAdapter?.submitOrder(order, mark.waitingForOrders!.atTick)`.
  - **`holdRemoteOrder(atTick, order)`**: `heldRemoteOrders.set(order.unitId, { atTick, order })`.
  - **Getters:** `isActive`, `currentLabel`, `currentSelectTargetDef`.
  Created `InteractiveTargetingSession.ts` with all key methods; `begin()` sets `onParallelBatchResolved` to null and queues preview order with `targetsByLabel: {}`; added `abort()` for engine-replacement path (no restore needed).

- [x] Add `restoreFromInMemorySnapshot(snapshot: SerializedGameState): void` to `BattleSession`. This follows the same logic as `loadFromSnapshot` (lines 356–416) but does not fetch from the server and does not touch `localStorage` for camera. Reuse `teardownEngineAndRendererOnly`, `GameEngine.fromJSON`, `finalizeEngine`, `startEngine`. Copy the camera from the current camera state directly (no localStorage) since this is a same-session restore.
  Added `restoreFromInMemorySnapshot` to `BattleSession` after `loadFromSnapshot`; saves/restores camera directly (no localStorage), calls `teardownEngineAndRendererOnly`, `GameEngine.fromJSON`, `finalizeEngine`, `startEngine`.

- [x] In `BattleSession.applyRemoteOrders()`: early-return to hold orders when session is active:
  ```ts
  if (this.interactiveTargeting.isActive) {
      for (const row of orders) {
          const order = parseOrderFromRow(row); // use whatever parsing is already there
          this.interactiveTargeting.holdRemoteOrder(row.atTick ?? ..., order);
      }
      return { newlyAppliedKeys: [], skippedKeys: [] };
  }
  ```
  Added early-return guard at top of `applyRemoteOrders`; holds each incoming order in `interactiveTargeting` keyed by `unitId`.

- [x] In `BattleSession.submitPlayerOrder()`: when `USE_SEQUENTIAL_TARGETING` is true and the ability has SelectTargetDefs, delegate to `interactiveTargeting.begin()` instead of submitting immediately:
  ```ts
  import { USE_SEQUENTIAL_TARGETING } from '../featureFlags';
  // ...
  if (USE_SEQUENTIAL_TARGETING) {
      const ability = getAbility(order.abilityId);
      const caster = engine?.getUnit(order.unitId);
      if (ability && caster && getSelectTargetDefsFromTimings(ability, caster, engine).length > 0) {
          this.interactiveTargeting.begin(order.abilityId, order.unitId, this);
          return;
      }
  }
  ```
  Added feature-flag routing block in `submitPlayerOrder`; imports `USE_SEQUENTIAL_TARGETING`, `getAbility`, `getSelectTargetDefsFromTimings`.

- [x] Instantiate `InteractiveTargetingSession` as `this.interactiveTargeting` in `BattleSession` and expose it as a public getter.
  Instantiated as `readonly interactiveTargeting = new InteractiveTargetingSession()` as a class field (public by default, no separate getter needed).

- [x] In `BattleSession.loadFromSnapshot()` (reconnect path): if `interactiveTargeting.isActive`, call `interactiveTargeting.reset()` before replacing the engine, to abort any in-progress preview.
  Called `interactiveTargeting.abort()` (clears state without restore) at the top of `loadFromSnapshot` when `isActive`; using `abort()` rather than `reset()` because the snapshot replaces the engine anyway.

- [x] Run `npx tsc --noEmit`. Run `npx vitest run --changed`.
  tsc: no new errors introduced (pre-existing 25 errors unchanged). vitest --changed: 216 pass, 4 pre-existing failures. Full suite: 553 pass, 4 pre-existing failures.

---

### Step 4 — UI wiring: targeting cursor + Reset / Replay / Confirm buttons

Connect the interactive session to the player-facing UI. Because `USE_SEQUENTIAL_TARGETING` was left `false` in Step 1, this step also flips it to `true`.

**Touches:**
`app/js/games/minion_battles/ui/pages/BattlePhase.tsx`,
`app/js/games/minion_battles/featureFlags.ts`

Read `BattlePhase.tsx` fully before editing. Look for where `AbilityTargetingTool` is activated on card click, where the canvas click handler routes to the active tool, and where order submission UI lives.

- [x] **Detect `waitingForTargetInput` each render frame.** In `BattlePhase`'s render/update loop, check `session.engine?.waitingForTargetInput`. When non-null and `interactiveTargeting.isActive`:
  - Show the targeting cursor for `interactiveTargeting.currentSelectTargetDef` (reuse the same hitbox preview render path that `AbilityTargetingTool` uses — pass the current SelectTargetDef's hitbox and filter to the `PreviewRenderer` via the existing `targetingState` mechanism).
  - On canvas click: call `interactiveTargeting.resolveTarget(waitingForTargetInput.label, resolved)` where `resolved` comes from `resolveClick(...)` (the same function `AbilityTargetingTool.onCanvasClick` calls).
  Added `abilityId`/`unitId` getters to `InteractiveTargetingSession`; in `targetingStateRef` body-assignment block, detect `its.isActive` and override `selectedAbility`/`currentTargets`/`previewOrderUnitId` so `PreviewRenderer` shows the correct SelectTargetDef cursor; added early-exit in `handleCanvasClick` that runs `resolveClick` + `filterSelectTargetCandidates` + calls `its.resolveTarget`. Also imported `getAbility`, `resolveClick`, `getSelectTargetDefsFromTimings`, `filterSelectTargetCandidates` in `BattlePhase.tsx`.

- [x] **Reset / Replay / Confirm buttons.** When `interactiveTargeting.isActive`, show:
  - **Reset**: calls `session.interactiveTargeting.reset()`.
  - **Replay**: calls `session.interactiveTargeting.replay()`. After replay the engine runs to the next pause; show Confirm + Reset.
  - **Confirm** (shown only after Replay or when all targets collected): calls `session.interactiveTargeting.commit()`.
  Added `interactiveTargetingActive` React state (polled every 50ms). When true, renders a button row (Reset / Replay / Confirm) overlaid at the bottom-centre of the canvas area, all three always visible during preview; each calls the corresponding method on `session.interactiveTargeting`.

- [x] **Suppress ghost plan broadcast** while `interactiveTargeting.isActive`. Find where ghost plans are sent (likely in `BattlePhase` or `BattleSession` after order submission) and add an `if (!session.interactiveTargeting.isActive)` guard.
  Added early-return guard at top of the ghost-plan `setInterval` callback: clears the last-sent plan and sends `null` when `interactiveTargeting.isActive`, then returns early.

- [x] **Flip the flag:** in `featureFlags.ts`, change `USE_SEQUENTIAL_TARGETING = false` to `true`.
  Changed `USE_SEQUENTIAL_TARGETING` from `false` to `true` in `featureFlags.ts`.

- [x] Run `npx tsc --noEmit`. Run `npx vitest run --changed`. Run the game and manually test Double Punch: windup plays → cursor appears for Target 1 → punch fires → windup2 plays → cursor appears for Target 2 → second punch fires. Test Reset and Replay buttons.
  tsc: no new errors (same 25 pre-existing errors). vitest --changed: 220 tests, 216 pass, 4 pre-existing failures. Full suite: 553 pass, 4 pre-existing failures. **Manual browser testing required** — this is a UI step in a browser app that cannot be automated; a human must verify Double Punch interactive targeting in the live game.

---

### Step 5 — Unit test: engine pause/resume for sequential targeting

A focused unit test that exercises the engine-level behavior added in Steps 1–2, independent of UI or `BattleSession`. This verifies the core invariant: the engine pauses at the right moment and the deferred interval fires correctly after target resolution.

**Touches:**
`app/js/games/minion_battles/game/interactiveTargeting.test.ts` (NEW)

- [x] Create `app/js/games/minion_battles/game/interactiveTargeting.test.ts`. Model it after `conditionalCancel.test.ts` — build a tiny engine, queue orders manually, step the engine with `engine.tick()`, assert on engine state.
  Created `game/interactiveTargeting.test.ts` with three `describe` scenarios. KEY IMPLEMENTATION NOTES: (1) `stepSimulationFixedTicks` ignores `isPaused`, so the test loops one tick at a time checking `waitingForTargetInput` after each step rather than relying on the engine stopping. (2) Enemies must be placed so each punch's hitbox hits only its intended target — `unit.radius (18) + lineThickness (20) = 38 px` tolerance means e1 is placed 42 px to the right of player (safe from the downward punch2 line) and e2 is placed 45 px below player (safe from the rightward punch1 line). (3) Scenario C uses ability `0120` (PunchNEW) submitted WITHOUT `targetsByLabel` in the order, so `active.targetsByLabel` remains `undefined` and Pass A is a complete no-op.

  Scenario A — **engine pauses at SelectTargetDef interval**:
  1. Build a tiny engine, spawn a player unit with Double Punch (`0116`) and two enemies in punch range.
  2. Advance until `engine.waitingForOrders` fires. Queue a preview order `{ abilityId: '0116', targets: [], targetsByLabel: {}, endTurn: true }` via `engine.state.orderMgr.applyOrder(...)`.
  3. Step the engine forward. Assert that `engine.waitingForTargetInput` becomes `{ label: 'Target 1', ... }` within the ability's timing window. Assert `engine.isPaused === true`.

  Scenario B — **engine resumes and fires the interval after target is set**:
  4. Continuing from Scenario A: find the caster's active ability, set `active.targetsByLabel['Target 1'] = { type: 'unit', unitId: e1.id }`. Clear `engine.waitingForTargetInput = null`. Set `engine.isPaused = false`.
  5. Step the engine forward. Assert that `engine.waitingForTargetInput` transitions to `{ label: 'Target 2', ... }`.
  6. Repeat for Target 2 using e2.
  7. Step until ability completes. Assert both enemies took damage (HP decreased or are dead).

  Scenario C — **non-interactive ability is unaffected**:
  8. Build a tiny engine with a single-punch ability (one without `SelectTargetDef`, e.g., basic punch/claw). Queue a normal order with targets filled. Verify that `engine.waitingForTargetInput` is never set.

- [x] Run `npx vitest run app/js/games/minion_battles/game/interactiveTargeting.test.ts`. All scenarios must pass.
  All 3 scenarios pass (3/3 green).

- [x] Run full `npx vitest run`. Confirm no regressions.
  Full suite: 556 pass, 4 pre-existing failures (3 shield maxUses, 1 conditionalCancel ticksInRock). No regressions introduced.

---

## AbilityTest Coverage

| Test | File | What it covers |
|---|---|---|
| `double_punch_death_fallback` (existing) | `testing/scenarios/abilities/doublePunchScenario.ts` | Underlying ability fires correctly; regression baseline for Steps 1–2 |
| `interactiveTargeting.test.ts` Scenario A | (unit test) | Engine pauses with correct `waitingForTargetInput` label at the right tick |
| `interactiveTargeting.test.ts` Scenario B | (unit test) | Deferred interval re-fires after target is set; ability completes correctly |
| `interactiveTargeting.test.ts` Scenario C | (unit test) | Non-SelectTargetDef abilities bypass the blocking mechanism entirely |

The existing `doublePunchDeathFallbackScenario` provides the E2E regression safety net. The new unit tests cover the interactive-specific behavior that the SimulationRunner scenario format cannot express (mid-simulation target injection).

---

## File Reference Map

| File | Role |
|---|---|
| `app/js/games/minion_battles/featureFlags.ts` | `USE_SEQUENTIAL_TARGETING` constant (Step 1, flipped in Step 4) |
| `game/GameEngine.ts` | `waitingForTargetInput`, `signalWaitingForTarget` (Step 1) |
| `game/types.ts` | `ActiveAbility.waitingForTargetIntervals` (Step 1) |
| `game/units/unitAbilityTick.ts` | Pass A/B, `fireIntervalEntry` helper, guards (Step 2) |
| `game/interaction/InteractiveTargetingSession.ts` | Session class: begin/resolve/reset/replay/commit (Step 3) |
| `game/BattleSession.ts` | `restoreFromInMemorySnapshot`, routing in `applyRemoteOrders` / `submitPlayerOrder` (Step 3) |
| `ui/pages/BattlePhase.tsx` | Targeting cursor, Reset/Replay/Confirm buttons, ghost plan suppression (Step 4) |
| `game/interactiveTargeting.test.ts` | Unit tests for engine pause/resume behavior (Step 5) |
| `abilities/targeting.ts` | `getSelectTargetDefsFromTimings`, `resolveClick` (read-only reference) |
| `card_defs/0116_DoublePunch/0116Ability.ts` | Double Punch timing / SelectTargetDef definitions (read-only reference) |
| `testing/scenarios/abilities/doublePunchScenario.ts` | Existing regression baseline (read-only) |
