# Plan: Host Optimistic Persist — Local Playahead, Async Storage, 10s Cap, Batch Envelope

## Completion (2026-09-09)

Steps 1–5 implemented; Step 6 automated verification passed (`tsc` clean, battlenet 265, `--changed` 750 passed / 1 skipped, full suite 1893 passed / 1 skipped, lint 0 errors / 16 pre-existing warnings). Host now applies locally and unpauses without awaiting merge HTTP, POSTs when the last-seen append window allows (after snapshot ACK), holds new orders at the next pause once playahead is 10s ahead of disk `hostTick` (quiet “Saving progress” card), and can batch snapshot+orders+merges via `POST …/persist-cycles`. **Still needs a human:** Step 6 solo-host ITS+Wait live check. Follow-ups unchanged (B04BE3 ITS Reset; FingerprintBatcher `pendingBatch` on recovery).

## Context

Solo/host battles (lobbies **97305C**, and the same POST race on later pauses) reject the host’s own Wait as `tick_ahead_of_host`. PHP does not mean “another player is host.” `AppendOrderHandler` compares `atTick` to **disk** `hostTick` / `orderBatchAtTick`:

```
maxAllowedTick = max(hostTick + 1, orderBatchAtTick)
```

`hostTick` is `BattleStorage::resolveLastCompletedTickAndFingerprint` (fingerprint tail clamped by the latest snapshot’s `waitingForOrders.atTick - 1`). ITS in-place playahead runs the live sim hundreds of ticks past the last saved pause (97305C: local 329, Wait POST at 330, disk still pause 225). `saveSnapshotOnPause` is `void` (fire-and-forget). Host `submitOrder` always `persistOrder`s immediately — the non-host “don’t POST past heartbeat” gate is skipped.

A second bug made the reject a freeze: `tick_ahead_of_host` deferred the row, set `waiting_for_host` + `host-catchup-wait blocking=true` (cards off, gray plaque). The retry POSTed successfully and cleared the deferred queue, but **host `pollOnce` never re-emits catchup**, so React kept `waitingForHostCatchup`.

### Product goals

1. **Host sim leads storage.** Apply orders locally and keep playing while snapshot/append/merge HTTP runs.
2. **Cap:** at most **10 seconds** of gameplay ahead of the last **acknowledged** completed tick (`FIXED_DT = 1/60` → **600 ticks**). If the cap would land mid-playback, run to the **next** `waitingForOrders` pause, then refuse new orders until persist catches up. Do **not** use the yellow “waiting for host” / gray-plaque catchup lock for this.
3. **Batch persist:** one host HTTP call can apply a pause snapshot, several pending orders, and several `merge-applied` batches so catch-up is not a serial round-trip per cycle.

### Non-goals (follow-ups)

- **B04BE3 ITS Reset** torn pause plane (`after_restore` never logged, snapshot 1869 overwritten with empty waiters). Separate from persist playahead.
- Relaxing PHP `tick_ahead_of_host` for `isHost` (would hide the race and lie to clients).
- Extra heartbeat GET on every submit (same window as append; still 224 until snapshot lands).

### Load-bearing invariant

Today host **POSTs then applies** so `tryResumeParallel` → `mergeAppliedOrdersForBatch` sees the row in `pending_orders.jsonl`. `GameEngine.tryResumeParallel` **stays paused** while that merge Promise is in flight — which **blocks** local playahead.

This plan: **unpause locally without waiting on merge HTTP**; append when the server window allows (after snapshot ACK); merge only after those appends succeed. Clients already follow heartbeat `hostTick`; they wait until persist lands.

---

## Agent Instructions

This plan is executed by **`/jp-implement-plan`**. The **invoking agent is the sole orchestrator** — it spawns one worker per step **synchronously** (never background), waits for each to finish, then reports plan completion to the user. Each worker implements exactly one step, checks items off with a one-line summary, and **stops without spawning the next agent**. See `.claude/skills/jp-implement-plan/SKILL.md` for the full orchestrator/worker workflow.

Rules for this plan:

- **Read every file in each step's "Touches" list before writing code.** Do not guess at types or signatures.
- Relevant skills: `working-on-minion-battles`, `game-sync-data-flow`, `game-engine`, `debugging-lobbies` (context only), `ability-tests` (final verification rationale only).
- **Per step:** `npm run lint:changed` is acceptable if `npm run lint` is too wide; prefer `npm run lint` when the step’s files are few. Run `npx tsc --noEmit` when the step crosses an interface/class boundary. Run **only** the specific Vitest files the step touches or creates. Never run the full suite, a whole directory, or AbilityTest scenarios inside a regular step.
- After verifying, change `- [ ]` to `- [x]` and write a one-line summary under the item.
- Keep changes minimal — only what the step describes.
- Tests use **Vitest**, never Jest. No magic domain numbers: import `FIXED_DT`, `HOST_PLAYAHEAD_CAP_SEC`, `HOST_PLAYAHEAD_CAP_TICKS`.
- Do not mutate production lobby storage. Do not implement the B04BE3 Reset fix here.

---

## Key Architecture

| Concern | File |
|---|---|
| Host `submitOrder` POST-then-apply; non-host heartbeat POST gate | `app/js/games/minion_battles/game/battlenet/BattleNet.ts` |
| Deferred queue, `emitHostCatchupWaitState` (`blocking = deferred.length > 0`) | `game/battlenet/OrderQueueController.ts` |
| `saveSnapshotOnPause`, `mergeAppliedOrdersForBatch` | `game/battlenet/SnapshotPersistence.ts` |
| Cached `hostTick` / `orderBatchAtTick` from poll + append | `game/battlenet/HeartbeatState.ts` |
| Merge-before-unpause hook | `game/BattleSession.ts` `setOnParallelBatchResolved`; `game/GameEngine.ts` `tryResumeParallel` |
| Fire-and-forget checkpoint | `BattleSession.bindEngineCallbacks` `setOnCheckpoint` |
| Server accept window | `backend/Http/Handlers/Battle/AppendOrderHandler.php` |
| Disk `hostTick` clamp | `backend/BattleStorage.php` `resolveLastCompletedTickAndFingerprint` |
| `canUseOrderUi` / yellow card | `ui/pages/BattlePhase.tsx`, `ui/pages/battlePhase/useBattleNetSyncState.ts`, `ui/components/BattleSyncStatus.tsx` |
| Tick rate | `game/GameEngine.ts` `FIXED_DT` (today unexported `1/60`) |
| Battle HTTP façade | `app/js/LobbyClient.ts`, `game/battlenet/types.ts` `BattleApi` |
| Routes | `backend/Router.php` |

**Test files:** `game/battlenet/hostPersistWindow.test.ts` (new), `BattleNet.test.ts`, `OrderQueueController.test.ts`, `SnapshotPersistence.test.ts`, `ui/pages/battlePhase/turnIndicatorState.test.ts` only if plaque props change.

---

## Step 1 — Window + cap helpers (no live behaviour change)

**Touches:** `app/js/games/minion_battles/game/GameEngine.ts`, `game/battlenet/constants.ts`, `game/battlenet/hostPersistWindow.ts` (new), `game/battlenet/hostPersistWindow.test.ts` (new)

- [x] Export `FIXED_DT` from `GameEngine.ts` (keep the existing comment). Do not change tick-loop math.
  - Exported `FIXED_DT` (`1 / 60`); tick-loop still uses the same constant.
- [x] In `constants.ts` add `HOST_PLAYAHEAD_CAP_SEC = 10` and `HOST_PLAYAHEAD_CAP_TICKS = Math.round(HOST_PLAYAHEAD_CAP_SEC / FIXED_DT)` (import `FIXED_DT`; no bare `60`).
  - Added both cap constants; `HOST_PLAYAHEAD_CAP_TICKS` is `Math.round(HOST_PLAYAHEAD_CAP_SEC / FIXED_DT)`.
- [x] Add `hostPersistWindow.ts` with:
  - `maxAllowedAppendTick(hostTick: number, orderBatchAtTick: number | null): number` — same as PHP `max($hostTick + 1, $pauseAtTick ?? -1)`.
  - `isAppendAtTickAccepted(atTick, hostTick, orderBatchAtTick): boolean`.
  - `hostPlayaheadTicksAhead(engineTick, acknowledgedCompletedTick): number`.
  - `isHostPlayaheadOverCap(engineTick, acknowledgedCompletedTick): boolean` using `HOST_PLAYAHEAD_CAP_TICKS`.
  - New helper module mirrors PHP accept window (including `tick_in_past`) and `>= HOST_PLAYAHEAD_CAP_TICKS` over-cap.
- [x] Vitest: window matches the 97305C numbers (`hostTick=224`, `orderBatchAtTick=225` ⇒ max 225, `atTick=330` rejected; after ACK `hostTick=329`, `orderBatchAtTick=330` ⇒ 330 accepted). Cap: 600 ticks over ACK is over cap; 599 is not.
  - Added `hostPersistWindow.test.ts` covering 97305C window numbers and cap via `HOST_PLAYAHEAD_CAP_TICKS`.

**Verify:** `npm run lint`, `npx tsc --noEmit`, `npx vitest run app/js/games/minion_battles/game/battlenet/hostPersistWindow.test.ts`.

---

## Step 2 — Host must not freeze the order UI on storage lag

**Touches:** `game/battlenet/OrderQueueController.ts`, `game/battlenet/BattleNet.ts`, `game/battlenet/OrderQueueController.test.ts`, `game/battlenet/BattleNet.test.ts`

Host deferred rows are **storage catch-up**, not “waiting for another player.”

- [x] `emitHostCatchupWaitState`: pass `blocking: deferred.length > 0 && !this.ctx.isHost` (keep `queuedCount` / `targetTick` for debug). Host cards stay usable while a POST is queued.
  - `blocking` is now `deferred.length > 0 && !this.ctx.isHost`; host still emits `queuedCount`/`targetTick`.
- [x] On `persistOrder` **accepted** (after filtering the deferred row), always `emitHostCatchupWaitState()` (host and non-host) so a successful retry cannot leave React `waitingForHostCatchup` stuck.
  - Accepted path filters the deferred row then always `emitHostCatchupWaitState()` before returning true.
- [x] Host `pollOnce`: after updating heartbeat, call `flushDeferredOrdersUpTo(hb.hostTick)` then `emitHostCatchupWaitState()` (today both are inside `if (!this.isHost)`).
  - Flush + catchup emit run for host and non-host; streak/watchdog force-flush stay non-host only.
- [x] Host `tick_ahead_of_host` persist path: still defer + log; do **not** call `presentWaitingForHostOptimisticQueued()` when `this.isHost`.
  - `presentWaitingForHostOptimisticQueued` is gated with `!this.isHost`; host still defers and emits catchup.
- [x] Tests: host defer emit has `blocking: false`; persist accept emits catchup with `queuedCount: 0`; existing non-host `blocking: true` test still passes.
  - Added host `blocking: false` emit test, persist-accept `queuedCount: 0`, host defer without `waiting_for_host`, and host poll flush; non-host blocking test unchanged.

**Verify:** `npm run lint`, `npx vitest run app/js/games/minion_battles/game/battlenet/OrderQueueController.test.ts app/js/games/minion_battles/game/battlenet/BattleNet.test.ts`.

---

## Step 3 — Host local apply first; unpause without waiting on merge; POST when the ACK window allows

**Touches:** `game/BattleSession.ts`, `game/battlenet/BattleNet.ts`, `game/battlenet/SnapshotPersistence.ts`, `game/battlenet/HeartbeatState.ts`, `game/battlenet/types.ts` (if `BattleSessionHandle` needs `getInFlightPauseSnapshotTick` / similar), `game/battlenet/BattleNet.test.ts`, `game/battlenet/SnapshotPersistence.test.ts`, battlenet `makeSession` mocks if the handle grows

This is the behaviour change that lets the host keep playing.

- [x] **Unpause vs merge:** In `BattleSession.bindEngineCallbacks`, host `setOnParallelBatchResolved` must **not** return a Promise that `tryResumeParallel` awaits. Call `netAdapter.mergeAppliedOrdersForBatch(batchAtTick)` without returning it (void / fire-and-follow). ITS preview still returns early (`isSequentialTargetingPreview`). Document why: merge HTTP must not stall the host sim; merge still runs, but only after Step 3 appends land (next bullets).
  - Host hook is `void mergeAppliedOrdersForBatch`; ITS preview still returns early. Comment documents why a returned Promise stalled playahead.
- [x] **Merge only after append:** `mergeAppliedOrdersForBatch` no-ops (resolves true) when BattleNet still has an unacked deferred/in-flight append for that `batchAtTick`. After `persistOrder` accepts rows for that batch, invoke merge (existing retry loop). If merge was skipped earlier, flush pending merge ticks after the append ACK / host deferred flush.
  - Unacked host appends tracked by idHash; merge no-ops until accept, then retry-loop merge + pending-tick flush.
- [x] **Host `submitOrder`:** apply locally first when `!skipLocalApply` (same `applyRemoteOrders` path non-host already uses), then persist asynchronously. Keep ITS `skipLocalApply` (in-place already applied) — still POST at the **mark** `atTick` (inside the old pause window).
  - Host applies via `applyLocalHostSubmitOrder` before persist; `skipLocalApply` still POSTs when the window allows.
- [x] **POST gate:** use last heartbeat/append `hostTick` + `orderBatchAtTick` with `isAppendAtTickAccepted`. If false, `deferLocalOrder` (do not POST). Do **not** extra-GET heartbeat here.
  - Host submit/persist/flush use `isAppendAtTickAccepted` / `maxAllowedAppendTick`; no extra heartbeat GET.
- [x] **Snapshot wait before POST:** `SnapshotPersistence` tracks the in-flight `saveSnapshotOnPause` Promise and `lastSnapshotTick`. Host persist of `atTick` awaits that promise when `lastSnapshotTick < atTick - 1` (or in-flight tick is the completed pause). After ACK, `HeartbeatState.updateLastSeenHeartbeat` / `orderBatchAtTick` from the save if the handler already returns them; otherwise the next `pollOnce` is enough to flush.
  - In-flight snapshot tracked; persist awaits it when behind. Snapshot ACK with `hostTick` updates HeartbeatState; otherwise pollOnce flushes.
- [x] `saveSnapshotOnPause` remains non-blocking for the engine (`void` from `onCheckpoint`); only the persist POST awaits it.
  - `onCheckpoint` still `void saveSnapshotOnPause`; only `persistOrder` awaits `awaitPauseSnapshotBeforeHostPersist`.
- [x] Tests (BattleNet harness): host submit at 330 with heartbeat still 224/225 → no `appendBattleOrder`, local `applyRemoteOrders` called, deferred queued, `blocking` catchup false; after mocked snapshot ACK + `pollOnce` with hostTick 329 → POST once, then merge for 330. In-place `skipLocalApply` at mark batch 225 with heartbeat 224 still POSTs (inside window). Merge is not invoked before append accept.
  - Added 97305C apply-first + skipLocalApply tests; host tick_ahead/flush tests now use the local POST gate.

**Verify:** `npm run lint`, `npx tsc --noEmit`, `npx vitest run app/js/games/minion_battles/game/battlenet/BattleNet.test.ts app/js/games/minion_battles/game/battlenet/SnapshotPersistence.test.ts`.

---

## Step 4 — 10s playahead cap (next pause, then hold)

**Touches:** `game/battlenet/BattleNet.ts`, `game/battlenet/types.ts` (`BattleNetEventMap`), `ui/pages/battlePhase/useBattleNetSyncState.ts`, `ui/pages/BattlePhase.tsx`, `ui/components/BattleSyncStatus.tsx` (or a small persist-backlog card — reuse `SyncStatusCard` tone `neutral`/`info`, not warning-host), `game/battlenet/BattleNet.test.ts`

- [x] Track `acknowledgedCompletedTick` = last snapshot/heartbeat `hostTick` the host has seen on disk (already on `HeartbeatState`; expose a getter used by the cap).
  - Added `HeartbeatState.getAcknowledgedCompletedTick()` (aliases last-seen `hostTick`); BattleNet cap emit uses it.
- [x] When `isHost && isPausedForOrderSync() && isHostPlayaheadOverCap(engineTick, acknowledgedCompletedTick)`, emit a dedicated event (e.g. `host-persist-backlog`) with `blocking: true`. `canUseOrderUi` includes `!hostPersistBacklogBlocking`. Engine stays on the parallel pause (waiters still present) so the plaque stays **Your Turn**, cards disabled until ACK catches up under the cap.
  - Event `host-persist-backlog`; `canUseOrderUi` gates cards; `turnIndicatorState` keeps `your_turn` while persist-backlog blocking and local waiters remain.
- [x] Under the cap, do not emit this blocking flag (Step 2 already keeps catchup non-blocking on host).
  - Under cap / not paused: `blocking: false` on `host-persist-backlog`; `host-catchup-wait` stays `blocking: false` on host.
- [x] Battle overlay: title like “Saving progress”, summary with acknowledged tick vs local tick; **not** `waiting_for_host` / Host storage check.
  - `BattleSyncStatus` neutral “Saving progress” card (ack vs local ticks) takes priority over Host storage check when blocking.
- [x] Tests: engineTick ACK+601 at a pause → blocking true; ACK+600 → false; after heartbeat advances, blocking false.
  - BattleNet tests use `CAP+1` (blocking) / `CAP-1` (not); Step 1 helper is `>= CAP` so exact CAP is already over. Heartbeat catch-up clears blocking.

**Verify:** `npm run lint`, `npx tsc --noEmit`, `npx vitest run app/js/games/minion_battles/game/battlenet/BattleNet.test.ts`.

---

## Step 5 — Host persist envelope (batch snapshot + orders + merges)

**Touches:** `backend/BattleStorage.php`, `backend/Http/Handlers/Battle/PersistHostCyclesHandler.php` (new), `backend/Router.php`, `index.php` CORS only if new header needed (should not), `app/js/LobbyClient.ts`, `game/battlenet/types.ts` `BattleApi`, `game/battlenet/BattleNet.ts`, `game/battlenet/SnapshotPersistence.ts`, `game/battlenet/BattleNet.test.ts`

One host-only POST, e.g. `POST /api/lobbies/{id}/games/{gameId}/persist-cycles`.

Body (names may match existing snapshot/order fields):

- `playerId` (must be lobby host)
- optional `snapshot`: `{ tick, state, checkpointFingerprint?, checkpointFingerprintPaused? }` — same payload as `SaveSnapshotHandler`
- `orders`: array of `{ atTick, order, idHash? }` (max e.g. 32, reuse `BATTLE_NET_MAX_DEFERRED_ORDERS`)
- `mergeBatchTicks`: number[] (each `>= 1`)

Server applies **in order in one request**: save snapshot (if present) so `resolveLastCompletedTickAndFingerprint` updates, then append each order with the **same** accept window as `AppendOrderHandler` (now seeing the new pause plane), then `mergeFinalizedPendingForBatch` for each tick. If any append is rejected, stop, return which rows landed (`acceptedIdHashes`, `rejectedReason`, `hostTick`). Do not skip the snapshot if it already applied (caller retries remaining orders).

- [x] Implement storage/handler/route. Reuse `BattleStorage::saveSnapshot` / `appendOrder` / `mergeFinalizedPendingForBatch` — do not copy-paste file I/O.
  - Added `POST …/persist-cycles` (`PersistHostCyclesHandler`); snapshot via `SaveSnapshotHandler::writeHostSnapshot`; appends via shared `AppendOrderAccept` (same window as POST /orders).
- [x] `LobbyClient.persistHostCycles` + `BattleApi` method.
  - `LobbyClient.persistHostCycles` + `BattleApi.persistHostCycles`; CORS unchanged (existing POST).
- [x] Host deferred flush: if 2+ deferred rows **or** in-flight snapshot + orders, prefer **one** envelope call over serial append+snapshot+merge. Single-row flush may keep `appendBattleOrder` to limit risk.
  - Host flush/persist uses `persistHostCycles` when 2+ eligible rows or in-flight pause snapshot + orders; single-row without snapshot still `appendBattleOrder`.
- [x] Test via mocked `BattleApi.persistHostCycles` in BattleNet: two deferred atTicks after snapshot ACK → one envelope call, not two `appendBattleOrder`s. Handler PHP is covered by that client contract plus a short comment pointing at 97305C (224→329). No PHPUnit in this repo.
  - BattleNet test: two 97305C Wait rows after snapshot ACK → one `persistHostCycles`, zero `appendBattleOrder`s.

**Verify:** `npm run lint`, `npx tsc --noEmit`, `npx vitest run app/js/games/minion_battles/game/battlenet/BattleNet.test.ts`.

---

## Step 6 — Final verification

- [x] `npx tsc --noEmit`
  - `npx tsc --noEmit` exited 0 (no errors).
- [x] `npx vitest run app/js/games/minion_battles/game/battlenet`
  - 15 files, 265 passed (0 failed).
- [x] `npx vitest run --changed` (or `--changed HEAD~1` if the tree is clean)
  - Dirty tree so `--changed` (not HEAD~1): 78 files, 750 passed | 1 skipped (751).
- [ ] **Live check (manual, solo host):** mission with ITS (Throw Torch / Punch). Playahead a long select, confirm, immediately Wait/move at the next pause. Expect: no yellow Host storage check, cards stay selectable, `pending_orders` / snapshot eventually show the new batch without `tick_ahead_of_host` warn (or only a deferred-then-envelope accept). Optionally throttle Network in DevTools to confirm play continues until ~10s / next pause, then cards hold until saves catch up.
  - Not run; needs a human with a live solo-host lobby. Do not mark passed.

### AbilityTest coverage

No new AbilityTest scenarios. AbilityTests construct `GameEngine` and bypass BattleNet/PHP; they cannot reproduce `tick_ahead_of_host` or the persist envelope. Coverage is Step 1–5 Vitest plus the Step 6 solo live checklist.

**Verify:** `npm run lint`, `npm run test` (full suite).
- `npm run lint` exited 0: 16 warnings, 0 errors (same pre-existing baseline).
- `npm run test` (full suite): 261 files, 1893 passed | 1 skipped (1894). No failures; no production-behaviour fixes.

---

## Follow-ups (out of scope)

- B04BE3: ITS `reset()` missing `after_restore`; do not checkpoint while restore has `isSequentialTargetingPreview === false`.
- Host `FingerprintBatcher.pendingBatch` not cleared on recovery entry (existing game-sync pitfall).
- Multiplayer: confirm guests still see merged applied rows after envelope (heartbeat `ordersRecordCount`); no extra client work expected if merge runs in the same request as append.
