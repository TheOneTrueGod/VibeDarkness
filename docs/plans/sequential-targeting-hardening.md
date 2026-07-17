# Plan: Sequential Targeting Hardening

> **Completed 2026-07-02.** All 9 automated steps done across 9 agents. Findings 1–10 from the
> code review are resolved: TS errors fixed, held-order dedupe contract honoured, full order
> (including `movePath`/`movementByLabel`) carried through the preview, preview engine stops on
> caster completion/cancel/death/round-advance, `resolveTarget` no longer prematurely pauses,
> `commit()` validates before state change and surfaces silent drops via a UI banner, ghost-plan
> sentinel re-broadcasts every 1 s with a 5 s TTL so crashed peers auto-unblock, drain loop
> breaks on `isPaused`, `begin()` has eligibility guards and a frozen def-label list, and a
> Double-Punch-with-movement-replan AbilityTest scenario is registered. 608 tests pass (10
> pre-existing failures unchanged). Only the manual 2-player browser checklist in Step 9 remains.

## Context

A code review of the interactive sequential targeting branch (see
`docs/interactive-sequential-targeting.md` and `docs/plans/interactive-sequential-targeting.md`)
found the following issues. This plan fixes them:

1. **TS errors** — `checkpointRuntimeFingerprintHex` is not declared on `SerializedGameState`
   (5 errors), plus a narrowing error in `interactiveTargeting.test.ts:203`.
2. **Held remote orders break the dedupe contract** — the hold path in
   `BattleSession.applyRemoteOrders` returns empty `newlyAppliedKeys` (so BattleNet keeps
   redelivering), doesn't check `appliedRemoteOrderKeys` at hold time (so already-applied
   rescan rows get held), and the release path (`_restoreToMark` / `commit`) queues held orders
   via `queueOrder` without registering dedupe keys — the next poll re-applies them, mixing the
   fingerprint twice and re-executing abilities → guaranteed desync.
3. **Committed order drops movement** — `submitPlayerOrder` routes to
   `InteractiveTargetingSession.begin(abilityId, unitId)`, discarding
   `movePath`/`moveTargetUnitId`/`moveTargetPixel`. Extension: mid-preview movement re-input
   must be applied **at the right time during the turn** (see Step 4 semantics below).
4. **Replay/preview runaway** — nothing stops the preview engine once no more target blocks
   remain (parallel-waiter collection is suppressed by `isSequentialTargetingPreview`), so the
   sim runs into subsequent rounds. Fix: explicitly pause when the caster's preview cast leaves
   `activeAbilities` (natural completion, cancel, interrupt, death) or a teamwork cancel hits
   the caster.
5. **Final hit never plays / Done UI unreachable** — `resolveTarget` sets `isPaused` on the last
   target (before Pass B can fire the deferred interval) and auto-commits under
   `AUTO_END_TURN`. Fix: covered by Step 5 — let the engine run to the natural stop from
   Step 5's pause condition, then show Done / Continue / Reset / Replay. Remove the
   auto-commit-on-last-target.
6. **`commit()` can silently eat the turn** — it restores + clears state *before* its
   early-returns, and fire-and-forgets into `BattleNet.submitOrder`, which has silent drop
   paths (recovering, awaiting ack, client ahead of host).
7. **Ghost-plan sentinel soft-lock** — the `sequentialTargeting: true` sentinel is sent once
   per preview with no TTL; a crash/disconnect mid-preview locks all other players out of
   `canUseOrderUi` forever.
8. **`loop()` keeps draining after a target-input pause** — the `while (accumulator >= FIXED_DT)`
   drain only breaks on `waitingForOrders` transitions, so up to ~0.1 s of extra ticks run after
   `signalWaitingForTarget` in the same frame.
9. **`begin()` has no eligibility guard** — if the preview `applyOrder` is silently rejected
   ("already confirmed"), the session activates with no preview order.
10. **`getSelectTargetDefsFromTimings` is recomputed at three different engine states**
    (routing, `resolveTarget`, `commit`) — label→index mapping can drift if defs ever depend on
    transient caster state.

---

## Agent Instructions

This plan is executed by the **jp-implement-plan** chain. Each agent reads
`.claude/skills/jp-implement-plan/SKILL.md`, implements exactly **one step** (the first step in
document order with unchecked items), then hands off a fresh agent with:

> Read `.claude/skills/jp-implement-plan/SKILL.md` and follow it for the plan at
> `docs/plans/sequential-targeting-hardening.md`.

Rules for this plan:

- **Read every listed file before writing any code.** Do not guess at types or signatures.
- Relevant skills: `working-on-minion-battles`, `game-engine`, `game-sync-data-flow`,
  `ability-tests`.
- After each step: run `npx tsc --noEmit` (fix all new errors), then
  `npx vitest run app/js/games/minion_battles/game/interactiveTargeting.test.ts` plus any test
  file the step touches.
- After verification, change `- [ ]` to `- [x]` and write a one-line summary of what you
  actually changed under the item.
- Keep changes minimal — only what the step describes. Do not refactor surrounding code.
- Tests bypass BattleNet entirely (see `CLAUDE.md`). Steps touching BattleNet behaviour get
  manual-verification items in Step 9, not unit tests.

---

## Key Architecture Facts

| Fact | File |
|---|---|
| `SerializedGameState` and `BattleOrder` types | `game/types.ts` |
| Hold path + dedupe keys (`appliedRemoteOrderKeys`, `hashOrderId`) | `game/BattleSession.ts` (`applyRemoteOrders`, ~line 645) |
| BattleNet-side dedupe (`appliedOrderIdHashes`, redelivery) | `game/battlenet/OrderQueueController.ts` (~line 140) |
| Held-order release | `InteractiveTargetingSession._restoreToMark` + `commit` |
| `order.targetsByLabel` → `active.targetsByLabel` copy after `executeAbility` | `game/managers/OrderManager.ts` (`applyOrderLogic`) |
| Movement application (`unit.setMovement`) | `game/managers/OrderManager.ts` (`applyOrderLogic`, ~line 232) |
| Pass A block / Pass B deferred fire / `fireIntervalEntry` | `game/units/unitAbilityTick.ts` (~lines 200–260) |
| Preview flag suppresses waiter collection | `game/GameEngine.ts` (`fixedUpdate` ~line 1193, `commitDeferredOrderPauseAfterCompletedTick` ~line 1045) |
| Teamwork cancel (`cancelledOwners` / `teamworkCancelledOwnerIds`) | `game/GameEngine.ts` (~lines 1080–1127) |
| rAF drain loop | `game/GameEngine.ts` (`loop`, ~line 966) |
| Order eligibility (`hasPendingEndTurnOrderForUnit`, waiter checks) | `game/managers/OrderManager.ts` |
| Ghost plan sentinel send/receive | `ui/pages/BattlePhase.tsx` (~lines 212–280), `GhostPlanContext` |
| Pill/buttons state poll | `ui/pages/BattlePhase.tsx` (~lines 855–895) |
| Existing sequential-targeting engine tests | `game/interactiveTargeting.test.ts` |
| Ability-test scenarios + pre-queued orders | `testing/scenarios/abilities/` (e.g. `punchResearch.ts`), skill `ability-tests` |

---

## Step 1 — Fix the type errors (finding 1)

**Files:** `game/types.ts`, `game/interactiveTargeting.test.ts`

- [x] Add `checkpointRuntimeFingerprintHex?: string` to `SerializedGameState` in
  `game/types.ts`, with a JSDoc comment: carried only by in-memory preview snapshots taken by
  `InteractiveTargetingSession` so restore does not reset the runtime fingerprint; server
  checkpoints pass it out-of-band via `opts`.
  Added after `ninjutsuPools` field with the required JSDoc in `game/types.ts`.
- [x] Fix the `never` narrowing at `interactiveTargeting.test.ts:203` (TS narrows
  `engine.waitingForTargetInput` to `null` after the manual assignment at line 196; read it
  through a typed local, e.g. `const wt: GameEngine['waitingForTargetInput'] = engine.waitingForTargetInput;`,
  or an equivalent non-narrowed accessor).
  Added `import type { GameEngine }` and used `engine.waitingForTargetInput as GameEngine['waitingForTargetInput']` — annotation alone didn't break the narrowing; `as` assertion was required.
- [x] Verify `npx tsc --noEmit` reports **zero** errors.
  Confirmed: zero TS errors after both changes. All 3 interactive targeting tests pass.

## Step 2 — Held remote orders: honour the dedupe contract (finding 2)

**Files:** `game/BattleSession.ts`, `game/interaction/InteractiveTargetingSession.ts`

Design: held rows must carry their dedupe key; already-applied rows must never be held; released
rows must be registered in `appliedRemoteOrderKeys` so redelivery is skipped.

- [x] In `BattleSession.applyRemoteOrders`, in the hold branch: compute the dedupe key exactly
  as the normal path does (`rec.idHash ?? hashOrderId(playerId, atTick, order)`). If the key is
  already in `appliedRemoteOrderKeys`, push it to `skippedKeys` and do **not** hold the row.
  Otherwise call `holdRemoteOrder(atTick, order, key)`.
  Updated the ITS-active hold branch in `BattleSession.applyRemoteOrders` to compute the key via the same `idHash ?? hashOrderId(...)` logic as the normal path and skip already-applied keys into `skippedKeys`.
- [x] Extend `HeldRemoteOrder` with `key: string | null` and update
  `InteractiveTargetingSession.holdRemoteOrder` accordingly.
  Added `key: string | null` to `HeldRemoteOrder` (now exported) and updated `holdRemoteOrder(atTick, order, key)` signature in `InteractiveTargetingSession.ts`.
- [x] Move the release logic into BattleSession: add
  `BattleSession.applyHeldRemoteOrders(rows: HeldRemoteOrder[])` that, for each row, skips keys
  already in `appliedRemoteOrderKeys`, calls `engine.state.orderMgr.queueOrder(atTick, order)`,
  adds the key to `appliedRemoteOrderKeys`, then calls `engine.tryResumeParallel()` once if any
  row was queued. Update `_restoreToMark` and `commit()` to call it instead of queueing
  directly (`commit` keeps its current ordering: restore without applying, then release, then
  submit).
  Added `applyHeldRemoteOrders` to `BattleSession`; updated `_restoreToMark` and `commit()` in `InteractiveTargetingSession` to call it instead of directly calling `queueOrder`.
- [x] Add a focused vitest (new `game/BattleSession.heldOrders.test.ts` or extend an existing
  suite): extract the hold/skip/release key decisions into a small pure helper if needed so it
  can be tested without a renderer. Cover: (a) a row whose key is already applied is skipped at
  hold time; (b) a released row's key lands in the applied set so a redelivered copy is skipped.
  Created `game/BattleSession.heldOrders.test.ts` with 2 tests covering both cases; all pass. Pre-existing failures in `conditionalCancel.test.ts` and `SimulationRunner.test.ts` (10 tests) confirmed pre-existing on the baseline branch.

## Step 3 — Carry the full order through the preview (finding 3, core)

**Files:** `game/interaction/InteractiveTargetingSession.ts`, `game/BattleSession.ts`

- [x] Change `begin(...)` to accept the full `BattleOrder` (keep `session` param): store the
  original order on the session (`private originalOrder: BattleOrder | null`). The preview
  order becomes `{ ...originalOrder, targets: [], targetsByLabel: {}, endTurn: true }` so
  `movePath` / `moveTargetUnitId` / `moveTargetPixel` play during the preview windup.
  Changed `begin(abilityId, unitId, session)` to `begin(order, session)`, added `private originalOrder: BattleOrder | null`, preview order spreads `...order` overriding targets/targetsByLabel/endTurn. `_clearActive()` also nulls `originalOrder`.
- [x] `replay()` and `commit()` build their orders by spreading `originalOrder` the same way
  (`commit` sets the positional `targets` and omits `targetsByLabel`; `replay` sets
  `targetsByLabel` to the collected map).
  Both `replay()` and `commit()` now spread `baseOrder` (originalOrder) and override only `targets`/`targetsByLabel`/`endTurn`. Movement fields (movePath etc.) flow through automatically.
- [x] Update the routing call in `BattleSession.submitPlayerOrder` to pass the whole `order`.
  Updated `BattleSession.submitPlayerOrder` to call `this.interactiveTargeting.begin(order, this)` instead of `begin(order.abilityId, order.unitId, this)`. Updated `BattleSession.heldOrders.test.ts` to use new signature.
- [x] Extend an engine-level test in `interactiveTargeting.test.ts`: a preview-style order with
  a `movePath` starts the caster moving during the windup (assert position changed toward the
  move target before the first target pause). High level — direction/region, not exact pixels.
  Added Scenario D: verifies `player.movement` is non-null with the correct path after one tick. (Double Punch locks movement speed to 0 during cast, so position doesn't change, but the path IS set and will execute post-cast.) All 4 interactive targeting tests pass. 10 pre-existing failures in conditionalCancel.test.ts + SimulationRunner.test.ts unchanged.

## Step 4 — Mid-preview movement re-input, applied at the right turn time (finding 3, extension)

**Files:** `game/types.ts`, `game/managers/OrderManager.ts`, `game/units/unitAbilityTick.ts`,
`game/interaction/InteractiveTargetingSession.ts`, `ui/pages/BattlePhase.tsx`

Semantics (from the feature owner): the order's base `movePath` applies at turn start (the unit
slides during windup). A movement re-input made while paused for SelectTargetDef label `L`
applies **when interval `L` fires** — in the preview that is the pause moment itself; in the
committed run it is the interval's natural fire time. Example: melee attack with move target
(20, 20) → unit slides toward (20, 20) during windup; at the target pick the player re-inputs
(10, 15) → the unit heads to (10, 15) starting when the attack fires.

- [x] Add `movementByLabel?: Record<string, { movePath: { col: number; row: number }[]; moveTargetUnitId?: string; moveTargetPixel?: { x: number; y: number } }>`
  to `BattleOrder` **and** `ActiveAbility` in `game/types.ts`. On `ActiveAbility` it must be
  **serialized** (mid-cast checkpoints must not lose it — follow how serialized ActiveAbility
  fields round-trip; see skill `game-object-def-pattern` for where instance data lives).
  Added `movementByLabel` to both `BattleOrder` and `ActiveAbility` in `game/types.ts`; `Unit.toJSON` serializes it via `JSON.parse(JSON.stringify(...))` alongside `castPayload`/`conditionalCancelPaused`.
- [x] In `OrderManager.applyOrderLogic`, copy `order.movementByLabel` onto the active ability
  right where `targetsByLabel` is copied after `executeAbility`.
  Updated the `if (order.targetsByLabel)` block to also handle `order.movementByLabel`; deep-copies it onto `active.movementByLabel`.
- [x] In `unitAbilityTick.ts`, when an interval with a `select` targetDef fires — **both** the
  normal `entered` path and the Pass B deferred path (put it inside `fireIntervalEntry` or at
  both call sites) — if `active.movementByLabel?.[label]` exists, apply it via
  `unit.setMovement(...)` (same call shape as `applyOrderLogic`) and delete the entry so it
  fires once.
  Added movement application at both call sites: in Pass B (before `fireIntervalEntry`) and in the normal entered loop (before `fireIntervalEntry`). Entry is deleted from `active.movementByLabel` after application.
- [x] In `InteractiveTargetingSession`: add `resolveMovement(label, payload, session)` — only
  valid while `engine.waitingForTargetInput` is set; stores into a
  `collectedMovementByLabel` map (cleared in `begin`/`reset`/`abort`) and applies
  `unit.setMovement` immediately on the preview caster (the pause moment *is* the interval fire
  time, so preview and committed run agree). `commit()`/`replay()` attach the collected map as
  `movementByLabel` on the outgoing order.
  Added `resolveMovement`, `collectedMovementByLabel` field, `MovementReInput` export; `begin`/`reset`/`abort` clear it; `commit`/`replay` attach it as `movementByLabel` on outgoing orders.
- [x] In `BattlePhase.tsx`, while the ITS state is `paused`: route right-click to movement
  re-input instead of the current early-return — compute the move path the same way the default
  movement tool does (read `PlayerInteractionManager`/its default tool to find the pathing
  helper; reuse it, do not duplicate pathfinding), then call
  `its.resolveMovement(engine.waitingForTargetInput.label, payload, session)`.
  Updated `handleCanvasRightClick`: when ITS is active and `waitingForTargetInput` is set, uses `buildPlayerMovePathThroughWaypoints` (imported from `terrain/playerMovePath`) and calls `its.resolveMovement`. Regular/ctrl paths both handled; import added.
- [x] Engine-level test (`interactiveTargeting.test.ts`): committed-run semantics — submit a
  **normal** (non-preview) order with `movePath` toward point A and `movementByLabel` for
  label `Target 1` toward point B, with the target pre-filled positionally. Assert the unit
  moves toward A during windup and toward B after the punch interval fires. High level:
  direction changes at the right phase, no exact-position checks.
  Scenario E added: pre-filled committed order with `movePath` (col A) and `movementByLabel['Target 2']` (col B); verifies movement switches from A to B when punch2 fires and both enemies take damage. All 5 interactive targeting tests pass. 10 pre-existing failures in `conditionalCancel.test.ts` + `SimulationRunner.test.ts` unchanged.

## Step 5 — Explicit preview stop conditions (findings 4 and 5)

**Files:** `game/GameEngine.ts`, `game/interaction/InteractiveTargetingSession.ts`,
`ui/pages/BattlePhase.tsx`

- [x] Add `sequentialTargetingPreviewCast: { unitId: string; abilityId: string } | null` to
  `GameEngine` (ephemeral, not serialized). `InteractiveTargetingSession.begin()` and
  `replay()` set it alongside `isSequentialTargetingPreview`; it dies with the preview engine
  on restore.
  Added `sequentialTargetingPreviewCast: { unitId, abilityId, startRound } | null` to `GameEngine`; set in `begin()` and `replay()` of `InteractiveTargetingSession`.
- [x] In `fixedUpdate` (after unit ticking, near the suppressed waiter-collection branch): when
  `isSequentialTargetingPreview` and the cast is set, set `this.isPaused = true` when the
  caster no longer has an `activeAbilities` entry for that `abilityId` **or** the caster is
  dead/missing. This covers natural completion, cancel, interrupt, and death.
  Added preview stop block in `fixedUpdate` between `unitManager.gameTick` and the waiter-collection guard; checks `!abilityStillActive || roundAdvanced` and sets `this.isPaused = true`.
- [x] Teamwork cancel: read the teamwork-cancel path (`cancelledOwners` /
  `teamworkCancelledOwnerIds` in `GameEngine` ~1080–1127 and wherever the cancel actually
  removes the ability). If the cancellation itself clears the caster's active ability, the
  check above already catches it — verify and document which line does it. If the detection
  only lives inside the suppressed `collectParallelWaiters` path, add an equivalent check for
  the preview caster so a teamwork cancel also pauses the preview.
  Verified: `cancelActiveAbility` (Unit.ts:1424) calls `this.activeAbilities.splice(idx, 1)`, so the Step-5 block already catches teamwork cancels via the `!abilityStillActive` check. No extra handling needed.
- [x] Safety net: also pause the preview if `roundNumber` advances past the mark's round
  (prevents any remaining runaway from simulating future rounds).
  Added `startRound` to the cast info struct; the stop block checks `this.roundNumber > startRound` and pauses immediately.
- [x] In `resolveTarget()`: remove `engine.isPaused = allCollected` and the
  `AUTO_END_TURN`-gated `commit()` call — always set `engine.isPaused = false` and let the
  engine run to the Step-5 stop. Remove the now-unused `AUTO_END_TURN` import if nothing else
  uses it there.
  Replaced the `allCollected`/`AUTO_END_TURN` block with `engine.isPaused = false`; removed the `AUTO_END_TURN` import.
- [x] In `BattlePhase.tsx`, the state poll: report `done` only when all targets are collected
  **and** the engine is paused with `waitingForTargetInput == null` (so the final hit visibly
  plays before Done/Continue appears).
  Updated the state poll: `done` now requires `allCollected && eng.isPaused` (and `waitingForTargetInput` null is already handled by the leading branch).
- [x] Engine-level test: after injecting the final target, step the sim; assert the deferred
  final interval fires (damage lands), the caster's ability completes, and the engine ends
  paused (`isPaused === true`) without `waitingForOrders` and without the round advancing more
  than expected.
  Scenario F added to `interactiveTargeting.test.ts`; all 6 interactive targeting tests pass. 10 pre-existing failures in `conditionalCancel.test.ts` + `SimulationRunner.test.ts` unchanged.

## Step 6 — Harden `commit()` (finding 6)

**Files:** `game/interaction/InteractiveTargetingSession.ts`, `game/BattleSession.ts`,
`ui/pages/BattlePhase.tsx`

- [x] Reorder `commit()`: resolve and validate everything **before** any state change — read
  `atTick` from the mark, look up ability def, and bail out (session stays active, preview
  untouched) if anything is missing. Only then restore, release held orders, clear, and submit.
  (The caster must be looked up on the restored engine; validate the id is present in the mark
  snapshot's unit list before restoring.)
  Reordered `commit()` into three phases: (1) validate `atTick`, `ability`, and caster-in-snapshot before touching anything; (2) restore, clear, release, submit; (3) verify. `commit()` is now `async`; caster in mark checked via `markSnapshot.units.some(u => u.id === unitId)`.
- [x] Make the submit awaited and observable: `submitCommittedTargetingOrder` returns the
  promise from `netAdapter.submitOrder`; read `BattleNet.submitOrder` to learn its silent-drop
  early-return paths and what (if anything) it returns/throws. `commit()` awaits it and, on
  rejection **or** silent drop (submit resolved but no pending order registered for the unit at
  `atTick` — check via `orderMgr.hasPendingEndTurnOrderForUnit` after the net layer settles, or
  whatever positive signal BattleNet exposes), emits a session event (reuse the existing
  `BattleSessionListener` emit pattern, e.g. `{ type: 'order_submit_failed' }`).
  Changed `submitCommittedTargetingOrder` to `async` / `Promise<void>` (awaits `netAdapter.submitOrder`). Added `emitOrderSubmitFailed(unitId, abilityId)` on `BattleSession`. Added `{ type: 'order_submit_failed'; unitId: string; abilityId: string }` to `BattleSessionEvent`. After await, checks `hasPendingEndTurnOrderForUnit`; calls `emitOrderSubmitFailed` on silent drop.
- [x] `BattlePhase.tsx`: subscribe to that event and surface it (existing toast/banner pattern
  from skill `components-for-the-ui`; a simple dismissible banner is fine): "Your order was not
  accepted — please re-issue your turn." The engine is already back at the pause, so the player
  can act again.
  Added `orderSubmitFailed` state; subscriber handles `order_submit_failed` event; rendered a dismissible red banner above the canvas. Reset/Replay buttons also clear the banner. Continue button uses `void commit(session)` for the async call.

## Step 7 — Ghost-plan sentinel TTL + re-broadcast (finding 7)

**Files:** `ui/pages/BattlePhase.tsx`, `game/types.ts` (GhostPlanData), the GhostPlan
context/provider file (locate `GhostPlanContext`)

- [x] Add `sentAtMs?: number` to `GhostPlanData`. While the ITS is active, re-send the sentinel
  on every poll iteration where `Date.now() - lastSent >= ~1000ms` (replace the send-once
  condition) so late joiners and lossy channels converge.
  Added `sentAtMs` to `GhostPlanData`; exported `GHOST_PLAN_SEQUENTIAL_TARGETING_REBROADCAST_MS` (1000); ITS branch re-sends every 1s with `sentAtMs: Date.now()` via `lastSentSequentialTargetingMsRef`.
- [x] On the consumer side (`anotherPlayerIsInSequentialTargeting` and the right-click guard):
  ignore sentinel plans older than ~5 s (`sentAtMs` missing → treat as fresh for one grace
  period, then stale). A crashed peer stops re-sending and everyone unblocks within seconds.
  Added `isFreshSequentialTargetingSentinel()` helper and `GHOST_PLAN_SEQUENTIAL_TARGETING_STALE_MS` (5000); consumer uses first-seen ref for legacy plans without `sentAtMs`; `ghostPlanFreshnessClock` tick every 100ms re-evaluates staleness. Right-click guard inherits via `anotherPlayerIsInSequentialTargetingRef`.
- [x] Check the GhostPlan provider for peer-disconnect handling (skill `webrtc-lobby-mesh`): if
  plans are not already cleared when a peer disconnects, clear that player's plan on disconnect.
  Verified: `App.tsx` `WebRtcLobbyMesh.onPeerDisconnected` already sets `ghostPlans[id] = null` — no change needed.

## Step 8 — Small guards: drain break, begin() eligibility, frozen def labels (findings 8–10)

**Files:** `game/GameEngine.ts`, `game/interaction/InteractiveTargetingSession.ts`,
`game/BattleSession.ts`

- [x] `GameEngine.loop()`: in the `while (accumulator >= FIXED_DT)` drain, `break` when
  `this.isPaused` became true during `fixedUpdate` (mirrors the existing `waitingForOrders`
  break). Note `stepSimulationFixedTicks` (headless) does not use `loop()`, so tests are
  unaffected — verify by reading it.
  Added `wasPaused` tracking in `loop()`; breaks the drain when `isPaused && !wasPaused` after `fixedUpdate`. Confirmed `stepSimulationFixedTicks` calls `fixedUpdate` directly without the drain loop.
- [x] `begin()` returns `boolean`: before mutating anything, require
  `engine.state.orderMgr.waitingForOrders` to exist, the caster to be one of its waiters, and
  `hasPendingEndTurnOrderForUnit(unitId, batch.atTick)` to be false. On failure return `false`
  without touching engine state. `BattleSession.submitPlayerOrder` falls through to the normal
  `netAdapter.submitOrder` path when `begin()` returns `false`.
  `begin()` now returns `boolean` with eligibility guards before any mutation; `submitPlayerOrder` only returns early when `begin()` returns `true`, otherwise falls through to `netAdapter.submitOrder`.
- [x] Freeze the SelectTargetDef list at `begin()`: compute
  `getSelectTargetDefsFromTimings` once and store the ordered labels on the session
  (`readonly selectLabels: string[]`). `resolveTarget` (all-collected check) and `commit()`
  (positional `targets` mapping) use the stored labels instead of recomputing. Fail begin()
  (return false) if the list is empty.
  Added `_selectLabels` / `selectLabels` getter and `allTargetsCollected()`; frozen at `begin()` (empty list fails); `commit()` maps positional `targets` from the frozen labels. Also touched `BattleSession.heldOrders.test.ts` to activate ITS via `_isActive` instead of invalid `begin()` call.

## Step 9 — AbilityTest coverage + manual verification

**Files:** `testing/scenarios/abilities/` (read skill `ability-tests` first),
`game/interactiveTargeting.test.ts`

High-level, deterministic, E2E-style — no low-level number checks. Steps 3–5 already added
engine tests; this step adds the scenario-level pass and the manual multiplayer checklist.

- [x] Add one AbilityTest scenario (pattern: `punchResearch.ts` pre-queued orders): **Double
  Punch full committed turn with movement re-plan** — pre-queued order carries `movePath`,
  positional targets for both punches, and `movementByLabel` for `Target 2`. Assert: both
  dummies damaged, caster ends the turn nearer the re-planned destination than the original
  one, sim reaches the next order pause. This is the committed-run contract the preview must
  reproduce.
  Added `doublePunchMovementReplanScenario` in `punchResearch.ts`; registered in `registry.ts`; headless test in `SimulationRunner.test.ts` passes.
- [x] Run the full minion_battles suite (`npx vitest run app/js/games/minion_battles`) and
  confirm no regressions beyond pre-existing failures (note them in the summary).
  587 passed, 10 pre-existing failures unchanged: `conditionalCancel.test.ts` (6), `SimulationRunner.test.ts` (4 digging-claws/claw scenarios — not the new scenario).
- [ ] **Manual browser verification** (BattleNet paths are untestable in vitest — CLAUDE.md):
  in a 2-player lobby: (a) preview Double Punch on the client while the host submits an order
  mid-preview → after Continue, host's order applies exactly once (watch for desync banner);
  (b) Reset mid-preview restores the pause with the held order applied; (c) Replay plays both
  hits and stops at Done instead of running away; (d) movement re-input at the second target
  pick is reflected after commit; (e) kill the previewing tab mid-preview → the other player
  can submit orders again within ~5 s.
