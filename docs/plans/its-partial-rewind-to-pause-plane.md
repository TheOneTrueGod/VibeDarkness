# ITS commit: rewind to the other player's pause plane, not the mark

## Context

In multiplayer, an ITS (Interactive Targeting Session) preview plays ahead locally. When the playahead reaches a parallel order pause that includes another player (for example, their cast ends partway through mine), the preview **drops** that pause and keeps going, as if the other player passed. `sessionEngineBinding.ts` then calls `noteMultiplayerUncertaintyDuringPreview()`, which sets `assumedRemoteWaitDuringPreview`. That rules out an in-place commit, so `itsCommitImpl` restores the **mark** (the start of the turn), submits the finalized order, and the engine replays the whole turn until it reaches the other player's pause again.

That replay is wasted. Between the mark and the first dropped pause that involves another player, nothing can differ from the preview:

- other players' orders only enter at pause planes, and the first one they get is the dropped pause;
- the local player's picks are the same picks, in the same order, that the finalized order carries.

So the commit only needs to rewind to that pause plane (call it the **uncertainty plane**), form the pause there exactly as a canonical run would, and hand the turn to the other player.

### Existing parts this builds on

- **Forming a dropped pause as canon would:** `OrderPauseController.commitDroppedItsPreviewPauseForStopTick` already rebuilds a dropped pause from its saved `waiters` and `naturalCompletionUnitIds` by setting `deferredOrderPause` and calling `commitDeferredOrderPauseAfterCompletedTick` (that runs teamwork cancels, merges extra waiters, mints `planeId`, fires `onWaitingForOrders` and `onCheckpoint`). The new path reuses it, applied to a restored snapshot instead of the live stop tick.
- **Drop sites:** `scheduleParallelPauseAfterUnitTick` (host / solo, and non-host when the local player is not a waiter) and `commitDeferredOrderPauseAfterCompletedTick` (non-host ally-only). Both call `engine.onItsParallelPauseDecision('drop', …)`.
- **Persisting without re-applying:** in-place commit calls `session.persistInPlaceCommittedTargetingOrder(realOrder, atTick, commitToken)` and then `promotePreview`, which flushes buffered fingerprints, the latest checkpoint and resolved batches (`promotePreviewFor`, `sessionOrders.ts`).
- **Injecting a pick into the running cast:** `InteractiveTargetingSession.resolveTarget` writes `active.targets` and `active.targetsByLabel[label]`; `resolveMovement` writes `active.movementByLabel`.
- **Commit predicate:** `wouldCommitInPlace` (`InteractiveTargetingSession.ts`) and `itsCommitImpl` / `itsRestoreToMark` (`itsCommit.ts`).

### Decisions

- **Three commit modes, one predicate.** Replace the boolean `wouldCommitInPlace` with `getCommitMode(session): 'in_place' | 'plane' | 'rollback'`. Keep `wouldCommitInPlace` as `getCommitMode(...) === 'in_place'`, so the existing callers (Continue label, auto-commit, combo window) keep their behaviour.
- **What counts as an uncertainty plane.** Only the *first* event that set `assumedRemoteWaitDuringPreview`, and only when it was a normal dropped parallel pause with a waiter owned by another player. If the flag was set first by an assumed wait at `begin` / Replay, or by a missing-pick drop, there is no plane and the commit rewinds to the mark, as today. (Missing-pick drops mutate the cast before the drop, so a clean snapshot is not available there. Keep that out of scope.)
- **Capture the snapshot at the end of the dropped tick**, at the point where `commitDeferredOrderPauseAfterCompletedTick` would have formed the pause (after `TICK_END`), never mid-tick. Capture `{ gameTick, snapshot: engine.toJSON(), waiters, naturalCompletionUnitIds }`. One `toJSON` per preview at most.
- **`plane` mode is allowed only when all of these hold:**
  - an uncertainty plane was captured;
  - the playahead is past the plane tick;
  - no held remote row has an `atTick` other than the plane's batch tick (`gameTick + 1`); rows at that tick are applied after the restore, anything else forces rollback;
  - the same persistence and non-host gates as in-place: `isInPlaceCommitPersistenceAvailable()`, and the non-host "playahead past mark ⇒ rollback" rule (lobby 5E0F6B). Move that rule into one helper used by both modes.
- **Consequence of the shared non-host gate:** `plane` mode is effectively **host / solo only** at first, because a plane commit is always past the mark. It unlocks for non-host when that rule is lifted for in-place commits. This is deliberate: both modes keep a preview-built state, and the non-host divergence risk is the same.
- **The snapshot gets the finalized order before restore.** In the cloned plane snapshot: replace the caster's preview order row (`orders`, at the mark batch tick, that `unitId`) with the finalized order, and patch the caster's preview cast (`targets`, `targetsByLabel`, `movementByLabel`) with every collected pick, including the ones made after the plane. Extract the injection code from `resolveTarget` / `resolveMovement` into one helper that works on an `ActiveAbility` and use it in both places, so there is one source of truth.
- **Order persistence is the in-place path:** persist the finalized order at the mark batch tick without local re-apply, then promote at the plane. On promotion, flush only fingerprints at or before the plane tick and the resolved batches, and drop the buffered checkpoint: forming the pause at the plane fires `onCheckpoint` with the correct state.
- **UI:** a plane commit still rewinds (a shorter one), so the Continue button keeps the "Continue ⏪" label and `AUTO_END_TURN` still does not auto-commit it. The rewind overlay's zero-frame check compares against the plane tick. No new controls.
- **Victory / defeat:** if the plane snapshot is terminal, call `reemitSuppressedTerminalOutcome` after the restore (same as in-place). If the terminal latch happened after the plane, the restored state is pre-terminal and the real run reaches it again.

## Agent Instructions

This plan is run by `/jp-implement-plan`. The agent that invokes it is the only orchestrator: it spawns one worker per step **synchronously** (never in the background), waits for each worker to finish, then reports plan completion to the user. Each worker implements exactly one step, checks off its items with a one-line summary, and **stops without spawning the next agent**. Follow `.claude/skills/jp-implement-plan/SKILL.md`.

Relevant project material:
- `app/js/games/minion_battles/AGENTS.md`, especially "Build the engine, not the feature".
- `app/js/games/minion_battles/game/interaction/AGENTS.md` and `docs/interactive-sequential-targeting.md` (ITS lifecycle, commit modes, rewind overlay).
- `game-engine` skill (tick loop, `toJSON` / `fromJSON`).
- `game-sync-data-flow` skill (order persistence, checkpoints; never bypass `BattleNet`).
- `scoped-testing` skill.

Rules:
- **Verification cadence: tests run once, at the end.** Per step, write the step's test files but **do not run Vitest**. Run only `npm run lint:changed`, plus `npx tsc --noEmit` when the step changes an interface or crosses a class boundary. Each step ends with a `Verify:` line naming its test files; the final step runs them all. Never run `npm run test:all`.
- `game/interactiveTargeting.test.ts` is over 4,000 lines. Put new tests in the new file named below and reuse its harness; if the harness has to be shared, move it into a small helper module both files import.
- Don't touch unrelated uncommitted files. Keep each file's existing CRLF or LF line endings.
- Tests use Vitest, never Jest.

## AbilityTest coverage

None new. The headless AbilityTest runner calls `orderMgr` directly and never runs an ITS preview, so it cannot exercise this. Coverage is ITS session tests that compare a plane commit with a canonical run (Step 5). The final step runs `npm run test:sim` once as a regression check, since Step 2 touches `OrderPauseController`.

## Steps

### Step 1: Capture the uncertainty plane during playahead

Files: `game/orderPause/OrderPauseController.ts`, `game/GameEngine.ts`, `game/sessionEngineBinding.ts`, `game/interaction/InteractiveTargetingSession.ts`

- [ ] Add a serializable-free type `ItsUncertaintyPlane { gameTick; snapshot: SerializedGameState; waiters: OrderWaiter[]; naturalCompletionUnitIds: string[] }` (put it next to `OrderPauseController`).
- [ ] Let the drop decision ask for a plane capture: `onItsParallelPauseDecision` gains a return value (or a separate `engine.requestItsPlaneCapture()` call) that the binding uses when `noteMultiplayerUncertaintyDuringPreview()` returns true for a non-missing-pick drop with a non-local waiter.
  - Both drop sites record the dropped waiters and natural-completion ids for the tick (the scheduling site already does, in `droppedItsPreviewPause`; make the `commitDeferred…` ally-only drop do the same).
- [ ] At the tick tail, where `commitDeferredOrderPauseAfterCompletedTick` returns false, if a capture was requested this tick, build the `ItsUncertaintyPlane` from `engine.toJSON()` and pass it to a new `engine.onItsUncertaintyPlane` callback. Clear the request every tick.
- [ ] Store it on `InteractiveTargetingSession` as `uncertaintyPlane` (first one only), clear it in `_clearActive` and at `begin` / Replay, and add it to `getDiagState()` (`uncertaintyPlaneTick`).
- [ ] `npx tsc --noEmit`.
- Verify: `game/interaction/itsPlaneCommit.test.ts` (capture cases, written in Step 5).

### Step 2: Form a saved pause on a restored engine

Files: `game/orderPause/OrderPauseController.ts`, `game/GameEngine.ts`

- [ ] Extract the body of `commitDroppedItsPreviewPauseForStopTick` that sets `deferredOrderPause` and calls `commitDeferredOrderPauseAfterCompletedTick` into `formSavedParallelPause({ waiters, naturalCompletionUnitIds })`, and use it from the existing method (no behaviour change there).
- [ ] Expose it on `GameEngine` as `formItsUncertaintyPlanePause(plane)`: requires `isSequentialTargetingPreview === false` and no `waitingForOrders` / `deferredOrderPause`, runs `runVictoryChecks()`, then forms the pause. Returns whether a pause formed.
- Verify: `game/interaction/itsPlaneCommit.test.ts`.

### Step 3: Finalize the plane snapshot with the committed order

Files: `game/interaction/itsOrderBuilders.ts`, `game/interaction/InteractiveTargetingSession.ts`

- [ ] Extract the cast-injection code from `resolveTarget` and `resolveMovement` into `applyCollectedPickToCast(active, label, target, positionalTargets)` and `applyCollectedMovementToCast(active, label, payload)` in `itsOrderBuilders.ts`; call them from both methods.
- [ ] Add `finalizePlaneSnapshot(snapshot, { unitId, abilityId, markAtTick, realOrder, collected, movementByLabel, positionalTargets })`: works on a `structuredClone`, replaces the caster's order row at `markAtTick` with `realOrder`, and, when the caster still runs the preview cast, applies every collected pick and movement through the helpers above. Returns the patched snapshot.
- Verify: `game/interaction/itsPlaneCommit.test.ts`.

### Step 4: Plane commit mode

Files: `game/interaction/InteractiveTargetingSession.ts`, `game/interaction/itsCommit.ts`, `game/sessionOrders.ts`, `game/BattleSession.ts`

- [ ] Add `getCommitMode(session)` per the Decisions; make `wouldCommitInPlace` a wrapper. Move the non-host past-mark rule into one helper shared by `in_place` and `plane`.
- [ ] Add `promotePreviewAtPlane(runId, plane)` (`promotePreviewAtPlaneFor` in `sessionOrders.ts`): `restoreFromInMemorySnapshot(plane.snapshot)`, set the timeline canonical, clear preview flags, `rebindEngineCallbacks()`, flush buffered fingerprints with `tick <= plane.gameTick` and the resolved batches (host), drop the buffered checkpoint, then `formItsUncertaintyPlanePause(plane)`.
- [ ] In `itsCommitImpl`, add the `plane` branch after the refresh: capture inputs, build `realOrder`, `finalizePlaneSnapshot`, emit the rewind overlay (`turn_committed`; skip when the plane tick equals the current tick), persist with `persistInPlaceCommittedTargetingOrder(realOrder, atTick, commitToken)`, await the overlay, `promotePreviewAtPlane`, apply held rows at the plane batch tick, `reemitSuppressedTerminalOutcome`, `clearNonconfirmedOrder`, `_clearActive`. Re-check `getCommitMode` after the refresh, as the in-place branch does, and fall back to rollback if it changed.
- [ ] Logging: `logItsPreviewEnded(..., 'submitted', 'plane', { commitMode: 'plane', planeTick, markTick })` and a `diag: ITS plane commit` lobby line with the formed pause's `atTick` and waiters. Widen the `commitMode` type in `itsLobbyLog.ts` if needed.
- [ ] `npx tsc --noEmit`.
- Verify: `game/interaction/itsPlaneCommit.test.ts`, `game/interactiveTargeting.test.ts`, `game/BattleSession.submitOrder.test.ts`.

### Step 5: Tests

Files: `game/interaction/itsPlaneCommit.test.ts` (new)

- [ ] **Capture:** host, two players. Local player A previews a two-select ability; B's unit's cast ends partway through. The plane is captured once at the drop tick with B as a waiter; a second later drop does not replace it.
- [ ] **Equivalence (the core test):** commit in plane mode, then compare with a canonical run (restore the mark, apply the same finalized order, run to the first pause): same `waitingForOrders` (`atTick`, waiters, `teamworkCancelledOwnerIds`), same `gameTick`, same state fingerprint. Include a case where A's second pick is made *after* the plane, so the snapshot patch is exercised.
- [ ] **The real run continues:** after the plane commit, B submits an order and the engine resumes and finishes A's cast with A's later pick.
- [ ] **Fallbacks to rollback (mark):** assumed wait at `begin`; a missing-pick drop first; a held remote row at another tick; non-host. Each asserts `getCommitMode` is `rollback` and the engine ends at the mark batch.
- [ ] **Still in place:** solo, and multiplayer with no other-player pause crossed: `getCommitMode` is `in_place`.
- Verify: `game/interaction/itsPlaneCommit.test.ts`.

### Step 6: Docs

Files: `docs/interactive-sequential-targeting.md`, `app/js/games/minion_battles/game/interaction/AGENTS.md`

- [ ] In "Commit-time in-place decision", describe the three modes, the uncertainty plane, the gates and the host-only consequence; update the Controls row for Continue (it may rewind only part of the turn).
- [ ] Update the "ITS commit" paragraph in `interaction/AGENTS.md` to name `getCommitMode` and the plane mode.
- Verify: none (docs only).

### Step 7: Final verification

- [ ] Run once: `npx vitest run app/js/games/minion_battles/game/interaction/itsPlaneCommit.test.ts app/js/games/minion_battles/game/interactiveTargeting.test.ts app/js/games/minion_battles/game/BattleSession.submitOrder.test.ts app/js/games/minion_battles/game/interaction/previewCanonEquivalence.test.ts app/js/games/minion_battles/game/interaction/isITSPreviewComplete.test.ts`. Fix failures in the files of the step that owns them. Note any failures that also fail on a clean checkout instead of fixing them.
- [ ] `npm run test:sim` once (regression for the `OrderPauseController` change).
- [ ] `npm run lint:changed` and `npx tsc --noEmit`.
- [ ] Manual browser check (two local players, see the `session-testing` skill): host previews a multi-select ability that runs past the other player's cast end, presses Continue; the rewind is short, the other player gets the turn at their pause, and after they act the host's cast finishes with the picks they made. Repeat as non-host and confirm it still rewinds to the start of the turn.
