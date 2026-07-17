# Plan: Non-Host Playahead Order Submission — Stop Dropping Orders, Add No-Rollback Special Case

**Completed:** 2026-07-07. All six implementation steps done. Fixes EC110E: recovery gate defers instead of drops; `maybeImmediateAlignWhenHostExpectsLocalPlayer` skips soft-align during ITS preview, deferred/accepted POST, or heartbeat finalized row; non-host `wouldCommitInPlace` allows kept playahead when other waiters are server-confirmed. 801 Vitest tests pass; `tsc --noEmit` clean. **Manual live 2-player `dark_awakening` check remains for the owner.**

## Context

**Incident (lobby EC110E):** a non-host paused at parallel batch `atTick=2` (waiters: local `unit_1`, host's `unit_2` whose submitted order was already fetched). The ITS preview for `throw_rock` played the sim ahead to tick 100 (next pause, batch 101); `AUTO_END_TURN` auto-committed. A heartbeat poll racing the commit saw "host paused at batch 2 expecting local player while local pause plane is 101" and fired `softAlignAfterStaleOrderBatch`, setting `isRecovering=true`. The commit's `BattleNet.submitOrder` then hit the `isRecovering` gate and silently dropped the order; ITS phase-3 verification emitted `order_submit_failed` → "Your order was not accepted" banner. A retry 18s later hit the same gate.

### Design goals (product owner)

1. **Playahead-then-submit is expected behaviour, not an error** — the submit must succeed while ahead of the host.
2. **Default:** roll back to the baseline (ITS mark), then play forward once all units have orders (existing rollback-commit path).
3. **Special case — commit in place, keep the playahead** — when every other player's waiter in the window has a submitted (immutable) order: a server-fetched row with `order.endTurn === true`. Merely pending/changeable orders → roll back. AI-owned (`ownerId === 'ai'`) waiters always safe. (Immutability holds because `OrderManager.applyOrder` refuses to replace confirmed orders, the cancel-sentinel at `OrderManager.ts:238-242` only touches nonconfirmed orders, and `BattleStorage::appendOrder` dedupes re-POSTs by `idHash`.)

### Verified facts that shape the design

| Fact | Location |
|---|---|
| ITS mark is `engine.toJSON()` taken before assumed waits are queued | `InteractiveTargetingSession.ts:231` |
| Serialized orders live in `mark.orders` (`{gameTick, order}` rows) | `types.ts:104` — for a non-host, another player's order can only be there via server fetch |
| `flushDeferredOrdersUpTo` runs before `maybeImmediateAlignWhenHostExpectsLocalPlayer` | `BattleNet.ts:930` before `:998` — accepted POST removes deferred row; track accepted POST `atTick`s |
| Server-side `expectingFromPlayerIds` derives from snapshot waiters only, never subtracting pending rows | `BattleStorage getExpectingFromPlayerIdsAt` — host keeps "expecting" us for several polls after our POST |
| Heartbeat `pendingOrders` window is `atTick >= hostTick-2` | `GetHeartbeatHandler.php:139-140`, wired at `:207`, client `LobbyClient.ts:663` — rows at `hostBatch = hostTick+1` always visible |
| `applyDeferredRowLocallyIfNeeded` short-circuits when `appliedLocally === true` | `OrderQueueController.ts:146` — existing deferral machinery carries in-place playahead commit safely; POSTs on next heartbeat (≤500 ms). **Do not** add an immediate-POST carve-out to gate 5 |
| Deferred rows survive desync recovery; stale rows dropped at flush | `resetLocalOptimisticOrdersOnResync` `OrderQueueController.ts:262-290`; `persistOrder` tick_in_past `BattleNet.ts:1449-1488` |

### Risks

- **Non-host preview fingerprint determinism** becomes load-bearing for kept playahead: `reconcileNonHostAheadOfHostTail` hash-compares the preview-run ring against the host's committed run at each rising `hostTick`. Failure mode is safe auto-resync, not corruption. Spot-check in live run that the ring is populated during preview runs.
- **Deferred rows accepted during recovery** that turn out stale are dropped at flush via `tick_in_past` (by design) — user sees rejected-order sync detail rather than the banner.
- **Pre-existing, out of scope (follow-up):** `submitOrder` gate 4 (`isLocalPlayerExpectedToAct`) still drops silently if the host merges and re-pauses expecting only other players while a local submit is in flight.

---

## Agent Instructions

This plan is executed by **`/jp-implement-plan`**. The **invoking agent is the sole orchestrator** — it spawns one worker per step **synchronously** (never background), waits for each to finish, then reports plan completion to the user. Each worker implements exactly one step, checks items off with a one-line summary, and **stops without spawning the next agent**. See `.claude/skills/jp-implement-plan/SKILL.md` for the full orchestrator/worker workflow.

Rules for this plan:

- **Read every file in each step's "Touches" list before writing code.** Do not guess at types or signatures.
- Relevant skills: `working-on-minion-battles`, `game-sync-data-flow`, `game-engine`, `ability-tests` (final verification only).
- **Per step:** `npm run lint` (fix errors), plus `npx tsc --noEmit` when the step crosses interface boundaries, plus **only the specific test files the step touches or creates**. Never run the full suite or AbilityTest scenarios inside a regular step.
- After verifying, change `- [ ]` to `- [x]` and write a one-line summary under the item.
- Keep changes minimal — only what the step describes.
- Tests use **Vitest**, never Jest. Tests bypass BattleNet for engine-only paths; BattleNet/ITS integration gets Vitest harness tests in Step 5 and live browser check in Step 6.

---

## Key Architecture

| Concern | File |
|---|---|
| `submitOrder` gates (gate 1 recovery, gate 5 deferral) | `game/battlenet/BattleNet.ts` ~293–533, gate 1 ~341–386, `persistOrder` accepted ~1371 |
| `flushDeferredOrdersUpTo`, `maybeImmediateAlignWhenHostExpectsLocalPlayer` | `BattleNet.ts` ~930, ~998, ~1852–1896 |
| Deferred queue, `applyDeferredRowLocallyIfNeeded`, resync reset | `game/battlenet/OrderQueueController.ts` ~146, ~262–290 |
| `BattleSessionHandle` interface | `game/battlenet/types.ts` |
| Session adapter methods, ITS active flag | `game/BattleSession.ts` |
| ITS mark, `wouldCommitInPlace`, phase-3 verification | `game/interaction/InteractiveTargetingSession.ts` ~231, ~406–436, ~645–649 |
| Confirmed-order immutability | `game/managers/OrderManager.ts` ~92–154, cancel-sentinel ~238–242 |
| Heartbeat `pendingOrders` shape | `LobbyClient.ts:663`, `GetHeartbeatHandler.php:139-140` |
| `softAlignAfterStaleOrderBatch`, `isRecovering` | `BattleNet.ts`, `RecoveryCoordinator` |
| Host-anchor resync fallback | `game/battlenet/HostAnchorWaitController.ts` |

**Test files:** `game/battlenet/BattleNet.test.ts`, `OrderQueueController.test.ts`, `HostAnchorWaitController.test.ts`, `game/interactiveTargeting.test.ts`, plus `makeSession()` mocks in other `game/battlenet/*.test.ts` files.

---

## Step 1 — Plumbing (no behaviour change)

**Touches:** `game/battlenet/types.ts`, `game/BattleSession.ts`, `game/battlenet/OrderQueueController.ts`, `game/battlenet/BattleNet.ts`, all `game/battlenet/*.test.ts` mock factories

- [x] Add `isInteractiveTargetingPreviewActive(): boolean` to `BattleSessionHandle` in `types.ts`.
  Added method to `BattleSessionHandle` after `isEngineSimulationRunning`.
- [x] Update `makeSession()` mock factories in all `game/battlenet/*.test.ts` files (`BattleNet`, `OrderQueueController`, `HostAnchorWaitController`, `PollLoop`, `HeartbeatTerminalReconciler`, `RecoveryCoordinator`, `SyncReconciler`, `SnapshotPersistence`) with `isInteractiveTargetingPreviewActive: () => false`.
  Updated all eight `makeSession()` factories with `isInteractiveTargetingPreviewActive: () => false`.
- [x] In `BattleSession.ts`, add `isInteractiveTargetingPreviewActive()` → `this.interactiveTargeting.isActive`; `getLocalPlayerId()` → `this.config.playerId`; `hasDeferredOrderFor(unitId, atTick)` → `this.netAdapter?.hasDeferredOrderFor?.(unitId, atTick) ?? false` (optional-chain — ITS tests stub partial adapters).
  Added three session adapter methods delegating to ITS, config, and optional BattleNet.
- [x] In `OrderQueueController.ts`, add `hasDeferredOrderFor(unitId, atTick)` (scan `deferredLocalOrders` by `atTick` + `order.unitId`); add `acceptedOurPostAtTicks: Set<number>` with `noteAcceptedOurPostAtTick` / `hasAcceptedOurPostAtTick`; clear the set in `resetLocalOptimisticOrdersOnResync()` (deferred rows stay preserved).
  Added deferred-order lookup, accepted-post tick set with note/query helpers, cleared on resync reset.
- [x] In `BattleNet.ts`, add public delegate `hasDeferredOrderFor`; in `persistOrder`'s accepted branch (~1371) call `noteAcceptedOurPostAtTick(atTick)` for non-hosts.
  Public `hasDeferredOrderFor` delegates to `OrderQueueController`; non-host accepted POST notes `atTick`.

**Verify:** `npm run lint`, `npx tsc --noEmit`.

---

## Step 2 — Fix B: defer instead of drop during recovery

**Touches:** `game/battlenet/BattleNet.ts`, `game/interaction/InteractiveTargetingSession.ts`

- [x] In `BattleNet.ts` `submitOrder` gate 1 (~341–386): keep logging (reword to "deferred while recovery active"), replace bare `return` with gate-5-style defer — compute `idHash`; if not in `appliedOrderIdHashes`: `registerSkipLocalApplyDedupe(idHash)` when `skipLocalApply`, then `deferLocalOrder(idHash, atTick, order, /*appliedLocally*/ skipLocalApply)`; `emitHostCatchupWaitState()`; `return`. Do not touch sync status (recovery owns it); queued count surfaces via `orderPipeline.queued`. Rollback-commit caller (no `skipLocalApply`) → `appliedLocally=false` → flush re-applies before POST. In-place caller (`skipLocalApply:true`) → `appliedLocally=true` → no re-apply, no soft-align at flush. Gate 2 (`isAwaitingUserAck`) stays a drop.
  Gate 1 now defers via `deferLocalOrder`/`emitHostCatchupWaitState` with gate-5 dedupe pattern; logs say "deferred while recovery active".
- [x] In `InteractiveTargetingSession.ts` phase-3 (~645–649): also accept `session.hasDeferredOrderFor(unitId, atTick)` as success before emitting `order_submit_failed`.
  Phase-3 verification treats deferred queue row as successful submit (no `order_submit_failed`).

**Verify:** `npm run lint`.

---

## Step 3 — Fix A: guards in `maybeImmediateAlignWhenHostExpectsLocalPlayer`

**Touches:** `game/battlenet/BattleNet.ts`

After the `computeBlockingNonHostPausePlane` check (~1852–1896), add three skip-and-return guards (each with a deduped log line — follow `deferredFlushBlockedLogKey` one-shot pattern; this path repeats every 500 ms):

- [x] Guard (i): `this.session.isInteractiveTargetingPreviewActive()` — expected playahead in progress; host is waiting on us, nothing is stuck.
  Skip-and-return with deduped `logImmediateAlignSkipped('its_preview', …)` when ITS preview is active.
- [x] Guard (ii): `this.deferredLocalOrders.some(r => r.atTick === hostBatch) || this.orderQueue.hasAcceptedOurPostAtTick(hostBatch)` — our answer is queued or already accepted by the server (accepted-set closes the same-poll flush race).
  Skip-and-return with deduped log when deferred row or accepted-post set covers `hostBatch`.
- [x] Guard (iii): new private helper `heartbeatListsOurFinalizedOrderAt(hb, hostBatch)` — `hb.pendingOrders` (optional; missing ⇒ false) contains a row with `playerId === this.playerId && atTick === hostBatch && finalized !== false && order.endTurn === true`.
  Added `heartbeatListsOurFinalizedOrderAt` helper plus `immediateAlignSkipLogKey` one-shot dedup cleared on recovery entry.

Genuine-stuck cases still escalate via existing fallbacks: 15s `waiting-for-host-paused-stall`, `stuck-paused-host-ahead`, and `HostAnchorWaitController` → `requestResync('host-stuck-after-submit')`. Accepted-set is cleared on recovery entry so post-recovery stall can still align.

**Verify:** `npm run lint`.

---

## Step 4 — Fix C: no-rollback special case in `wouldCommitInPlace`

**Touches:** `game/interaction/InteractiveTargetingSession.ts`

- [x] Replace the blanket non-host `engine.gameTick > markTick → false` block (~412–418): when playahead is detected, return `false` only if `!this.nonHostPlayaheadWaitersAreServerConfirmed(session, batch)`.
  Playahead block now rolls back only when `nonHostPlayaheadWaitersAreServerConfirmed` is false.
- [x] Add private helper `nonHostPlayaheadWaitersAreServerConfirmed(session, batch)`: for each `batch.waiters` row, skip the ITS caster (`unitId === this._unitId`), skip `ownerId === 'ai'`, skip `ownerId === session.getLocalPlayerId()`; otherwise require either (a) a row in `this.mark.orders` with `gameTick >= batch.atTick && order.unitId === waiter.unitId && order.endTurn === true` (pre-preview server fetch — EC110E shape; match `gameTick >=` to mirror `hasPendingEndTurnOrderForUnit`), or (b) `assumedWaitUnitIds.has(waiter.unitId) && heldRemoteOrders.has(waiter.unitId)` (mid-preview server row; existing held-row pure-pass loops below still validate content). Any other player-owned waiter without server proof → `false` (rollback).
  Added helper with mark-order and assumed-wait/held-row proof paths per waiter.
- [x] Keep all existing conditions unchanged after this check (persistence availability, held rows are pure passes from `assumedWaitUnitIds`, every assumed wait has a held pure pass). Add a comment where immutability is relied on: last-write-wins compaction per `(playerId, unitId, atTick)` could technically replace a finalized row, but no client path re-POSTs a confirmed order.
  Post-check loops unchanged; immutability comment on mark-order `endTurn` proof.

**Verify:** `npm run lint`, `npx tsc --noEmit`.

---

## Step 5 — Tests (Vitest)

**Touches:** `game/battlenet/OrderQueueController.test.ts`, `game/battlenet/BattleNet.test.ts`, `game/interactiveTargeting.test.ts`, `game/battlenet/HostAnchorWaitController.test.ts`

### OrderQueueController.test.ts

- [x] `hasDeferredOrderFor` match/non-match cases.
  Added match/non-match tests for `hasDeferredOrderFor`.
- [x] Accepted-post set noted/queried and cleared by `resetLocalOptimisticOrdersOnResync` while deferred rows remain (extend existing preserve test).
  Added `acceptedOurPostAtTicks` note/query test and resync-clear test preserving deferred rows.

### BattleNet.test.ts

Reuse `makeSession`/`makeApi`/`pollOnce`; `vi.spyOn(net, 'isRecovering', 'get')` precedent at ~841; spy public `softAlignToHostPausePlane`. Keep fingerprints agreeing with `hostFingerprint` (pattern at ~928–934).

- [x] **Fix B:** submit during recovery → no `appendBattleOrder`, `queued === 1`, `hasDeferredOrderFor` true; recovery ends, `pollOnce()` with `hostTick: 1` → POSTed once at `atTick 2`, queue empty, `applyRemoteOrders` called; `skipLocalApply` variant → `applyRemoteOrders` not called, `seedRemoteOrderDedupeKeys` called.
  Added recovery-defer flush tests for rollback and skipLocalApply callers.
- [x] **Fix A guard (i):** heartbeat host-paused-expecting-us at batch 2, local batch 101, ITS active → no soft-align.
  EC110E heartbeat fixture; ITS-active session skips `softAlignToHostPausePlane`.
- [x] **Fix A guard (ii):** ITS inactive, `hb.pendingOrders` carries our finalized `endTurn` row at batch 2 → no soft-align.
  pendingOrders finalized row at host batch skips soft-align.
- [x] **Fix A guard (iii) / EC110E:** defer via gate 5 (`skipLocalApply`, `engineTick 100`), next poll flushes (POST once) with no soft-align in same poll; further poll (host still expecting) also does not soft-align.
  Gate-5 defer flush POSTs once; subsequent poll still skips soft-align.
- [x] **Genuine-stuck regression (39E984 preserved):** same heartbeat, no ITS / no deferred / no accepted / no pending row → soft-align does fire.
  Baseline EC110E heartbeat without guards triggers soft-align.

### interactiveTargeting.test.ts

Reuse `mountLightBlastSessionFixture` + private-field injection at ~1947–1960.

- [x] Rework ~1973 old-semantics test: local player owns ITS caster, other player owns waiter with no order in `mark.orders`, playahead mocked → `wouldCommitInPlace === false`.
  Reworked playahead-without-server-proof test for p2 caster.
- [x] EC110E shape: apply finalized pure pass for other player's unit before `mark = engine.toJSON()` → `true`.
  mark.orders server-confirmed waiter allows in-place despite playahead.
- [x] Playahead + assumed-wait with held pure pass → `true`; without held row → `false`.
  Assumed-wait held-pass toggles in-place under playahead.
- [x] Fix B phase-3: stubbed adapter where submit resolves without queueing and `hasDeferredOrderFor → true` → no `order_submit_failed`; with `false` → emitted.
  Phase-3 deferred-row suppresses/emits `order_submit_failed` per adapter stub.
- [x] Headline EC110E end-to-end regression: real non-host `BattleSession` + engine at parallel pause, host's fetched submitted order baked via `applyRemoteOrders`, real `BattleNet` with mocked `LobbyClient`, heartbeat = host paused at mark batch expecting local player (echo local fingerprint as `hostFingerprint`); run ITS preview ahead to next pause; `pollOnce()` mid-preview → no `loadFromSnapshot`/soft-align; `commit()` → no `order_submit_failed`, `appendBattleOrder` called with mark batch's `atTick` (immediately or after one more `pollOnce()`), queue drains to 0. Assert invariants, not commit mode.
  Full EC110E harness: playahead to next pause, mid-preview poll safe, commit POSTs at mark batch.

### HostAnchorWaitController.test.ts

- [x] With deferred/accepted order at host batch (state Fix A treats as "not stuck"), advancing `Date.now()` past `HOST_ANCHOR_RESYNC_MS` while heartbeat unchanged still fires `requestResync('host-stuck-after-submit')` — pins conservative fallback.
  Accepted-post + optimistic-ahead still triggers host-anchor resync after threshold.

**Verify:** `npm run lint`, then:
```
npx vitest run app/js/games/minion_battles/game/battlenet/OrderQueueController.test.ts
npx vitest run app/js/games/minion_battles/game/battlenet/BattleNet.test.ts
npx vitest run app/js/games/minion_battles/game/battlenet/HostAnchorWaitController.test.ts
npx vitest run app/js/games/minion_battles/game/interactiveTargeting.test.ts
```

---

## Step 6 — Final verification

- [x] `npx tsc --noEmit` — interface changes ripple through all mocks.
  `tsc --noEmit` passes with no errors.
- [x] `npx vitest run app/js/games/minion_battles/game/battlenet app/js/games/minion_battles/game/interactiveTargeting.test.ts`
  15 files, 252 tests passed.
- [x] `npx vitest run --changed` — fan-out regressions.
  72 files, 577 tests passed.
- [ ] **Live check (manual, 2 browser windows):** host + guest, mission `dark_awakening`. As guest, target an ability while host has already submitted — order must go through with no "Your order was not accepted" banner. Watch `storage/lobbies/<CODE>/lobby_log.jsonl` for `battle_order_append` rows from guest and both `pending_orders.jsonl` rows before host merges. Verify guest kept-playahead case reaches `optimistic_client_playahead`/`waiting_for_host` status and reconciles to `synced` when host catches up (no resync). Spot-check preview fingerprint ring populated during preview runs.

### AbilityTest coverage

No new AbilityTest scenarios required — this work is BattleNet heartbeat/ITS sync plumbing, fully covered by Step 5 Vitest harness tests (including EC110E end-to-end regression) plus the Step 6 live 2-player checklist. AbilityTests bypass BattleNet and cannot reproduce the race.

**Verify:** `npm run lint`, `npm run test` (full suite).

---

## Follow-ups (out of scope)

- `submitOrder` gate 4 (`isLocalPlayerExpectedToAct`) silent drop when host merges and re-pauses expecting only other players while local submit is in flight.
