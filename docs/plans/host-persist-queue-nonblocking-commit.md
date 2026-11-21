# Plan: Host persist queue — non-blocking ITS commit + "Waiting on server" alert

## Completion (2026-11-20)

Steps 1–5 implemented by Sonnet workers; Step 6 automated checks passed (`tsc` clean, `lint:changed` clean, 10 named Vitest files: 348 passed / 2 skipped). Host saves (orders + pause snapshots) now go through one serial, deduped, tick-ordered `HostPersistQueue`. The host ITS in-place commit no longer waits on the POST. A top-left "Waiting on server — N saves queued up" card (info / warning ≥3 / danger ≥6, shown after 750 ms) replaces "Saving progress", which is kept only as a fallback when the cap blocks with nothing queued. Debug user-state uploads are serialized and hold while host saves are queued. **Still needs a human:** both Step 6 live checks (solo host on a throttled network; 2-player guest sanity). Follow-ups are unchanged (see the end of this file).

## Context

Lobby **7628CD** (solo host, Garden Heart, 2026-11-20): at the end of the round (tick 5396), the ITS turn-commit spinner ("Turn submitted, waiting for the server") stayed up for seconds. The spinner shows while `InteractiveTargetingSession._commitInFlight` is true.

**Verified cause (code + server trace):**

1. **The in-place commit awaits the network.** `itsCommitInPlace` (`game/interaction/itsCommit.ts:295`) does `await session.persistInPlaceCommittedTargetingOrder(...)`. For the host that is `BattleNet.persistCommittedOrder` → `persistOrder` → `await persistHostCyclesEnvelope` / `await appendBattleOrder` (and sometimes `awaitPauseSnapshotBeforeHostPersist`). Only after it returns does the commit promote the preview, unpause and clear ITS. The **rollback** commit path already does not wait: it applies locally and reports the POST in the background (`reportRollbackSubmit`, comment at `itsCommit.ts:195`).
2. **The dev server is single-process.** `storage/perf-trace/server-requests` shows pid 4160 handling every request strictly in sequence. From 22:23:51 to 22:24:09 it was busy back-to-back: about 17.6 s of `user-state` POSTs (0.6–1.3 s each) plus 6 `persist-cycles` (0.8–1.0 s each) plus snapshots. The commit's own `persist-cycles` (`a8e35fb3`) was 6th in line.
3. **Host persists are neither serialized nor deduped on the client.**
   - The same Wait (`cd63b477`) was POSTed three times concurrently.
   - Five `persist-cycles` POSTs for tick 5237 were in flight at once.
   - 106 of 257 appends were rejected as `duplicate_id_hash`.
4. **The debug "Log user state to server" upload competes with game saves.** In `userStateBatchQueue.ts` each flush is up to 2 MB of full per-tick game states. Flushes are not serialized and run with the same priority as persists.

**What already exists** (`docs/plans/host-optimistic-persist-playahead.md`, done 2026-09-09):
- The host applies orders locally first and unpauses without awaiting merge.
- Deferred rows are POSTed when the append window opens.
- `POST …/persist-cycles` takes snapshot, orders and merges in one call.
- A 10 s playahead cap (`HOST_PLAYAHEAD_CAP_TICKS`) holds cards at a pause and shows a neutral "Saving progress" card.

This plan closes the remaining gap: the ITS in-place commit, plus one serialized, deduplicated save pipeline with a visible queue depth.

### Product goals

1. **The host sim never waits on a save.** The ITS in-place commit finishes (promote, unpause, clear spinner) as soon as the order is queued, the same way the rollback commit already behaves.
2. **One save pipe for the host.** Pause snapshots and order rows go through a single serial queue:
   - one HTTP save in flight at a time;
   - deduped by `idHash`;
   - queued items coalesced into `persist-cycles` envelopes;
   - items sent in causal tick order.
3. **Tell the host when it is leading the save.** A top-left alert reads **"Waiting on server"** with **"N queued up"**. Its tone is `info` below 3, `warning` from 3 and `danger` from 6.
4. **Debug uploads yield to game saves.** While the host save queue is non-empty, `user-state` uploads hold. They are also serialized to one in flight.

### Decisions (already made; change here if the user disagrees)

- **Scope is every host, not only solo play.** Clients only ever read what the host has persisted (heartbeat `hostTick`), and the rollback commit already does not wait for any host. The 10 s cap still bounds how far ahead the host can get. A guest's in-place commit (`submitOrder` with `skipLocalApply`) is **unchanged**.
- **Meaning of N:** the number of host save items not yet acknowledged by the server. That is distinct unacked order rows plus pending pause snapshots, counting both queued and in-flight items.
- **Tones:** N 1–2 is `info`, N 3–5 is `warning`, N ≥ 6 is `danger`. The constants are `HOST_PERSIST_QUEUE_WARNING_DEPTH = 3` and `HOST_PERSIST_QUEUE_DANGER_DEPTH = 6`.
- **No flicker:** the alert shows only once the oldest unacked item has waited at least `HOST_PERSIST_QUEUE_SHOW_AFTER_MS = 750`. A normal single save never shows it.
- **It replaces "Saving progress".** When the 10 s cap is blocking, the same card stays up with an extra line ("Orders resume when saves catch up"). Resync, failed and resynced cards still take priority.

### Load-bearing invariant: causal send order

Today the in-place commit persists the order **before** `promotePreview` flushes the buffered checkpoint (`sessionOrders.ts:promotePreviewFor` → `saveSnapshotOnPause`). Once the commit stops awaiting, that checkpoint (for example the snapshot at 5396) could reach the server before the order row (atTick 5299). The server would then move `hostTick` to 5396 and reject 5299 as `tick_in_past`, which triggers a resync.

**Rule:** the queue sends items in tick order. An envelope may hold at most one snapshot **S** and only rows whose `atTick` is accepted by S's window (`isAppendAtTickAccepted`). A row with `atTick <= S.tick` that is still queued must go out **before** S. That means an earlier envelope, sent with the previous window. Pause snapshots therefore move into the queue too, instead of `SnapshotPersistence` POSTing them independently.

### Non-goals (follow-ups)

- PHP request concurrency (`php -S` is single-threaded in dev; production may differ).
- Making `UserStateStorage::appendBatch` cheaper (recursive ksort + md5 of 260 KB per tick).
- Guest-side in-place commit latency.
- The earlier reload stalls in the same lobby (20 s to 3 min between `join` and the snapshot GET at 16:46, 16:59 and 18:13).

---

## Agent Instructions

This plan is executed by **`/jp-implement-plan`**. The **invoking agent is the sole orchestrator**: it spawns one worker per step **synchronously** (never in the background), waits for each to finish, then reports plan completion to the user. Each worker implements exactly one step, checks its items off with a one-line summary, and **stops without spawning the next agent**. See `.claude/skills/jp-implement-plan/SKILL.md` for the workflow.

Rules for this plan:

- **Read every file in a step's "Touches" list before writing code.** Do not guess at types or signatures.
- Relevant skills:
  - `working-on-minion-battles`
  - `game-sync-data-flow` (required reading for Steps 1–3)
  - `game-engine`
  - `editing-and-creating-components` (Step 4)
  - `debugging-lobbies` (context only)
  - `ability-tests` (final-step rationale only)
- **Per step:** run `npm run lint:changed`, run `npx tsc --noEmit` when the step crosses an interface or class boundary, then run **only** the Vitest files the step names. Never run `npm run test:all`, a whole directory, or AbilityTest scenarios inside a regular step.
- Tests use **Vitest**, never Jest.
- **No magic numbers:** use the named constants from `game/battlenet/constants.ts`.
- Build the engine, not the feature (`app/js/games/minion_battles/AGENTS.md`). `HostPersistQueue` is the **one entry point** for host saves. Do not add a second POST path around it.
- Do not mutate lobby storage. Do not change PHP accept-window rules.

---

## Key Architecture

| Concern | File |
|---|---|
| In-place commit awaits persist (the spinner) | `game/interaction/itsCommit.ts` `itsCommitInPlace`; `InteractiveTargetingSession.commit` |
| Session façade | `game/sessionOrders.ts` `persistInPlaceCommittedTargetingOrderFor`, `promotePreviewFor`; `game/BattleSession.ts` |
| Host persist paths today | `game/battlenet/BattleNet.ts` `submitOrder` (host branch ~L853), `persistCommittedOrder`, `persistOrder`, `persistHostCyclesEnvelope`, `flushDeferredOrdersUpTo`, `saveSnapshotOnPause`, `hostUnackedAppends` |
| Pause snapshot POST + envelope payload | `game/battlenet/SnapshotPersistence.ts` |
| Accept window + cap helpers | `game/battlenet/hostPersistWindow.ts`, `constants.ts` |
| Deferred rows | `game/battlenet/OrderQueueController.ts` |
| Event map | `game/battlenet/types.ts` `BattleNetEventMap` |
| Sync UI (top-left, `left-3 top-3`) | `ui/components/BattleSyncStatus.tsx`, `SyncStatusCard.tsx`; `ui/pages/battlePhase/useBattleNetSyncState.ts`; `ui/pages/BattlePhase.tsx` |
| Debug upload | `game/battlenet/userStateBatchQueue.ts` |

---

## Step 1 — `HostPersistQueue` module (no wiring)

**Touches:** `game/battlenet/HostPersistQueue.ts` (new), `game/battlenet/HostPersistQueue.test.ts` (new), `game/battlenet/constants.ts`

A pure, injectable queue. It takes a `send(envelope) => Promise<result>` function and a window provider, and owns no HTTP of its own.

- [x] Add constants `HOST_PERSIST_QUEUE_WARNING_DEPTH = 3`, `HOST_PERSIST_QUEUE_DANGER_DEPTH = 6`, `HOST_PERSIST_QUEUE_SHOW_AFTER_MS = 750`.
  - Added to `constants.ts`.
- [x] Implement `HostPersistQueue`:
  - Done in `HostPersistQueue.ts`. Generic over order/payload/token. `send` returns `{ ok, rejectedIdHashes? }`; window provider returns `{ hostTick, orderBatchAtTick }`. Snapshot items carry an optional `orderBatchAtTick`. Sends are scheduled via a microtask so same-tick enqueues coalesce. Extra method `notifyWindowChanged()` re-pumps deferred rows after a window update (Step 2 should call it on heartbeat / snapshot ack). A queued row that the current window does not accept blocks any snapshot behind it (strict causal order).
  - Items are `{ kind: 'order', idHash, atTick, order }` and `{ kind: 'snapshot', tick, payload, token }`.
  - `enqueueOrder` is a no-op when the same `idHash` is already queued or in flight. It returns a `Promise<boolean>` that resolves on ack or final rejection; duplicates share the first promise.
  - `enqueueSnapshot` replaces an older queued snapshot only if no queued order sits between the two ticks.
  - **One send in flight.** Each send builds an envelope from the head of the queue by the causal rule in Context: at most one snapshot, plus the rows its window accepts, capped at `BATTLE_NET_MAX_DEFERRED_ORDERS`. Rows behind the snapshot go first, in their own envelope.
  - Rows the current window does not accept stay queued (deferred), with no POST.
  - It exposes `getDepth()`, `getOldestUnackedAgeMs(now)` and `onChange(cb)` (fired on every depth change).
  - `clear()` is for recovery entry.
- [x] Vitest (in-memory `send`):
  - `HostPersistQueue.test.ts`: 6 tests covering all five listed cases plus rejected-row / `clear()`; lint:changed clean, all green.
  - three `enqueueOrder` calls with the same `idHash` produce one send;
  - five rows queued while a send is in flight produce exactly one more envelope after it, not five;
  - the 7628CD shape (row 5299 queued after window 5298/5299, then snapshot 5396) gives envelope 1 = [5299] and envelope 2 = [snapshot 5396], never one envelope with snapshot 5396 + row 5299;
  - a row outside the window stays queued until a window update;
  - depth counts queued + in flight and goes back to 0 after acks.

**Verify:** `npm run lint:changed`, `npx vitest run app/js/games/minion_battles/game/battlenet/HostPersistQueue.test.ts`.

---

## Step 2 — Route every host save through the queue

**Touches:** `game/battlenet/BattleNet.ts`, `game/battlenet/SnapshotPersistence.ts`, `game/battlenet/types.ts`, `game/battlenet/BattleNet.test.ts`, `game/battlenet/SnapshotPersistence.test.ts`

- [x] `BattleNet` owns one `HostPersistQueue` (host only):
  - Its `send` calls `persistHostCyclesEnvelope`. A single row with no snapshot may still use `appendBattleOrder`, keeping today's `shouldUseHostPersistEnvelope` rule.
  - The window provider is `getHostEnvelopeWindow` / the heartbeat.
  - Keep the existing rejection handling inside those methods (`tick_in_past` → soft-align or resync, `not_unit_owner` → resync, duplicate → merge). The queue only learns accepted or rejected per `idHash`.
  - Done. `BattleNet.hostPersistQueue` (host only) sends via `sendHostPersistEnvelope`: snapshot-only goes through `SnapshotPersistence.postQueuedSnapshot` (`saveBattleSnapshot`), a single row with no snapshot through the old `appendBattleOrder` tail (extracted as `appendOrderViaApi`, shared with guests), anything else through `persistHostCyclesEnvelope` (now takes an explicit `snapshotToken`). Window provider `getHostQueueWindow` = heartbeat tail widened by the last ACCEPTED checkpoint only (a queued snapshot is not in it, so causal order holds). Rejection handling unchanged inside those methods. Retry/defer choice: the queue never retries. A network error or rejected row is re-deferred into `deferredLocalOrders` by the existing code (or by the catch in `sendHostPersistEnvelope`) and re-enqueued by the next heartbeat flush; a failed snapshot is not retried (the next pause snapshot supersedes it, as before). Added `HostPersistQueue.dropOrders(pred)` (+ test) so queued rows the server tail has passed cannot block snapshots forever.
- [x] Host `submitOrder`, `persistCommittedOrder`, `persistOrder` (host branch) and `flushDeferredOrdersUpTo` (host branch) enqueue instead of POSTing. `hostUnackedAppends` and the deferred rows stay the source for merge gating. Either keep them in sync from queue events or derive them from the queue, and note which in the summary.
  - Done. `persistOrder` host branch gates on the window (defers outside it, as before) then `enqueueHostOrder`; `submitOrder`/`persistCommittedOrder` still `await` it (Step 3 stops that). `flushDeferredOrdersUpTo` host rows are enqueued without awaiting (the poll never waits on a save); only the pause-snapshot ACK flush awaits (`awaitHostSettled`). Sync choice: `hostUnackedAppends` and deferred rows are KEPT IN SYNC by the send handler and the existing accept/reject code (not derived from the queue); `hostQueuedRowKeys` marks queued/in-flight rows so flush skips them, and `removeUnpostableDeferredRows` also drops stale queued rows. Removed `shouldUseHostPersistEnvelope` and `collectHostEnvelopeRows` (the queue coalesces).
- [x] Host pause snapshots (`saveSnapshotOnPause` / `SnapshotPersistence`) enqueue a snapshot item instead of POSTing on their own. `awaitPauseSnapshotBeforeHostPersist` becomes unnecessary for the host because ordering is now structural; leave guest behaviour untouched.
  - Done. `SnapshotPersistence` takes `enqueueSnapshot` (host); `saveSnapshotOnPause` enqueues and keeps the pending payload until the queue promise settles (so row gating is unchanged). Without it (tests, legacy) it POSTs directly. Removed the host call to `awaitPauseSnapshotBeforeHostPersist` (method left in place, guest behaviour untouched).
- [x] Recovery entry (`resetForDesyncRecoveryEntry`) clears the queue the same way it clears `hostUnackedAppends` today.
  - Done. `resetForDesyncRecoveryEntry` calls `hostPersistQueue.clear()` and clears `hostQueuedRowKeys` next to `hostUnackedAppends.clear()`.
- [x] Emit `host-persist-queue` `{ depth, oldestUnackedAgeMs }` from `onChange`, plus a 250 ms re-emit while depth > 0 so age-based UI can update. Add it to `BattleNetEventMap`.
  - Done. Added to `BattleNetEventMap` and `BattleEventBus`; `emitHostPersistQueueState` emits on every depth change and runs a `HOST_PERSIST_QUEUE_REEMIT_MS = 250` interval while depth > 0 (cleared at depth 0 and in `stop()`). `notifyWindowChanged()` is called on every poll before the flush and on the snapshot ACK.
- [x] Tests (BattleNet harness):
  - Three host submits of the same Wait produce one `persistHostCycles` / `appendBattleOrder`.
  - With the API mock held unresolved, five tick-5237 submits produce one call in flight, then one envelope.
  - A snapshot queued after an older row goes out after that row.
  - The existing host tests (97305C apply-first, `skipLocalApply`, envelope batching) still pass.
  - Done. Three new BattleNet tests (same Wait x3 gives one `appendBattleOrder`; five tick submits give one call in flight then one 4-row `persistHostCycles` envelope, with depth events; a snapshot queued behind an in-flight order POSTs only after it) plus two SnapshotPersistence queue-mode tests and a `dropOrders` queue test. All 97305C / 9CA938 / skipLocalApply / envelope-batching host tests still pass unchanged. `lint:changed`, `tsc --noEmit` and the three Vitest files are green (147 tests).

**Verify:** `npm run lint:changed`, `npx tsc --noEmit`, `npx vitest run app/js/games/minion_battles/game/battlenet/BattleNet.test.ts app/js/games/minion_battles/game/battlenet/SnapshotPersistence.test.ts`.

---

## Step 3 — Host ITS in-place commit does not await the save

**Touches:** `game/interaction/itsCommit.ts`, `game/sessionOrders.ts`, `game/BattleSession.ts`, `game/battlenet/BattleNet.ts` (`persistCommittedOrder` signature), `game/battlenet/types.ts` (net adapter type, if it lists the method), `game/interactiveTargeting.test.ts`

- [x] Split `persistCommittedOrder` into a synchronous **enqueue** that returns `{ queued: boolean; landed: Promise<boolean> }`.
  - `queued` is false only for today's synchronous refusals: recovering, awaiting user ack, preview without a commit token.
  - Mint the commit token before enqueue, as now.
  - Done. `BattleNet.persistCommittedOrder` is now synchronous and returns `CommittedOrderPersist { queued, landed }` (new type in `battlenet/types.ts`). It calls `persistOrder` (host branch has no await, so the row is queued or deferred before return); `queued` = row in `hostQueuedRowKeys` or deferred, so a deferred row counts as queued. `landed` = ack, or still-deferred. Refusals (not host, recovering, awaiting ack, preview without token) return `queued: false`. Token is minted before enqueue as before.
- [x] `persistInPlaceCommittedTargetingOrderFor`: for the host, return `queued` immediately and add `idHash` to `appliedRemoteOrderKeys` on enqueue. Keep the guest branch exactly as it is.
  - Done. Host returns the `{queued, landed}` result straight away and adds `idHash` to `appliedRemoteOrderKeys` when `queued`; guest branch still awaits `submitOrder` and returns `{queued, landed: resolved}`. `BattleSession.persistInPlaceCommittedTargetingOrder` return type updated.
- [x] `itsCommitInPlace`:
  - On `queued`, run promote / unpause / `_clearActive` / dropped-pause commit straight away. The checkpoint the promotion flushes now goes into the queue behind the order row (the causal invariant from Step 2).
  - Report `landed` in the background, mirroring `reportRollbackSubmit`. On `false`, log `ITS: preview ended rejected persist_failed (background)` and do **not** call `emitOrderSubmitFailed`, because BattleNet's rejection path already soft-aligns or resyncs.
  - On `!queued`, keep today's failure path unchanged.
  - Done. On `queued` it proceeds to promote / unpause / `_clearActive` / dropped-pause commit; `landed` is reported in the background (`persist_failed` with `background: true` via `logItsPreviewEnded`, no `emitOrderSubmitFailed`). `!queued` keeps the old failure path.
- [x] Update the doc comments on `InteractiveTargetingSession.commit` and `itsCommit.ts:195` so both commit modes say "does not wait for the POST".
  - Done. Updated `InteractiveTargetingSession.commit` and the rollback-commit comment in `itsCommit.ts` to say neither mode waits for the host POST.
- [x] Test (`interactiveTargeting.test.ts`, host harness with a never-resolving persist mock): an in-place commit resolves, `isCommitInFlight` goes back to false, and the engine is unpaused / promoted while the save is still pending. A guest in-place commit still awaits `submitOrder`.
  - Done. Added a host test (landed never resolves: `commit` resolves, `isCommitInFlight` false, promoted, unpaused/not preview) and a guest test (`persistInPlaceCommittedTargetingOrderFor` stays pending until `submitOrder` resolves). Existing `persistCommittedOrder` mocks in `interactiveTargeting.test.ts`, `previewCanonEquivalence.test.ts` and `interactiveTargeting.comboAutoContinue.test.ts` now return `{ queued: true, landed }`. `lint:changed`, `tsc --noEmit` clean; interactiveTargeting, previewCanonEquivalence, comboAutoContinue, BattleNet tests green (270 passed).

**Verify:** `npm run lint:changed`, `npx tsc --noEmit`, `npx vitest run app/js/games/minion_battles/game/interactiveTargeting.test.ts app/js/games/minion_battles/game/interaction/previewCanonEquivalence.test.ts`.

---

## Step 4 — "Waiting on server, N queued up" alert (top left)

**Touches:** `ui/pages/battlePhase/useBattleNetSyncState.ts`, `ui/components/BattleSyncStatus.tsx`, `ui/components/hostPersistQueueAlert.ts` (new, pure model), `ui/components/hostPersistQueueAlert.test.ts` (new), `ui/pages/BattlePhase.tsx`

- [x] `useBattleNetSyncState` subscribes to `host-persist-queue` and exposes `hostPersistQueueDepth` and `hostPersistQueueOldestAgeMs`.
  - Done. Hook subscribes to `host-persist-queue` and returns `hostPersistQueueDepth` / `hostPersistQueueOldestAgeMs`; `BattlePhase.tsx` destructures and passes them.
- [x] Add a pure `hostPersistQueueAlertModel({ depth, oldestAgeMs, capBlocking })`:
  - Done. New pure `ui/components/hostPersistQueueAlert.ts` (`hostPersistQueueAlertModel`, tones from the battlenet constants, singular/plural summary, `detail` line when `capBlocking`).
  - It returns `null` when depth is 0 or `oldestAgeMs < HOST_PERSIST_QUEUE_SHOW_AFTER_MS`.
  - Otherwise it returns `{ title: 'Waiting on server', summary: '<N> queued up', tone, busy: true }`.
  - Tone is `info` below `HOST_PERSIST_QUEUE_WARNING_DEPTH`, `warning` below `HOST_PERSIST_QUEUE_DANGER_DEPTH`, `danger` at or above it. Use singular/plural wording ("1 save queued up" / "N saves queued up").
  - When `capBlocking`, add the detail line "Orders resume when saves catch up."
- [x] `BattleSyncStatus.pickSyncCardModel`: for `isHost`, use this model in place of the "Saving progress" branch. Order of priority: resync inform / resyncing / failed / synced_pending_ack first, then the queue alert. The card renders in the existing battle slot (`absolute left-3 top-3`). Pass the new props from `BattlePhase.tsx`.
  - Done. `pickSyncCardModel` shows the queue alert for hosts right after the resync-inform card and skips it for resyncing / failed / synced_pending_ack, so those win; it sits before the quiet `synced` null returns. The old 'Saving progress' card stays only as a fallback when the cap is blocking but the alert is still hidden (depth 0 or under 750 ms). New optional props `hostPersistQueueDepth` / `hostPersistQueueOldestAgeMs`.
- [x] Vitest for the model: depth 0 gives null; depth 1 at 500 ms gives null; depth 1 at 800 ms gives `info`; depth 3 gives `warning`; depth 5 gives `warning`; depth 6 gives `danger`; `capBlocking` adds the detail line.
  - Done. `hostPersistQueueAlert.test.ts` (5 tests) covers all listed cases; with `turnIndicatorState.test.ts` 16 pass. `lint:changed` and `tsc --noEmit` clean.

**Verify:** `npm run lint:changed`, `npx tsc --noEmit`, `npx vitest run app/js/games/minion_battles/ui/components/hostPersistQueueAlert.test.ts app/js/games/minion_battles/ui/pages/battlePhase/turnIndicatorState.test.ts`.

---

## Step 5 — Debug user-state uploads yield to game saves

**Touches:** `game/battlenet/userStateBatchQueue.ts`, `game/battlenet/userStateBatchQueue.test.ts` (new), `game/battlenet/BattleNet.ts` (register the hold)

- [x] Serialize flushes: one `user-state` POST in flight per bucket; later flushes chain behind it.
  - Flushes are serialized per bucket (`inFlight` flag); entries accumulating behind an in-flight POST are re-flushed when it finishes.
- [x] Add `setUserStateUploadHold(isHeld: () => boolean)`. A flush that finds the hold active reschedules on the debounce timer and does not POST. Memory stays bounded by the existing `FLUSH_BYTES` batching; when held, keep at most one pending batch and drop the oldest if a second one overflows (this is best-effort debug data, so log the drop with `console.warn`).
  - Added `setUserStateUploadHold(isHeld)` (returns an unregister fn; also `resetUserStateQueueForTests`). A held flush reschedules on the 5 s debounce with no POST; while held or in flight, overflow drops the oldest entries to keep one pending batch, with a `console.warn`.
- [x] `BattleNet` (host) registers `() => hostPersistQueue.getDepth() > 0` and unregisters on dispose.
  - `BattleNet` constructor registers `() => queue.getDepth() > 0` where the host queue is created; `stop()` unregisters it.
- [x] Vitest (fake timers, mocked `fetch`): two quick flushes give one in-flight fetch at a time; with the hold active there is no fetch, and after release the batch is sent.
  - New `userStateBatchQueue.test.ts` (2 tests, fake timers + mocked fetch): one fetch in flight at a time; no fetch while held, sent after release. lint:changed (no new warnings), tsc --noEmit clean, test green.

**Verify:** `npm run lint:changed`, `npx vitest run app/js/games/minion_battles/game/battlenet/userStateBatchQueue.test.ts`.

---

## Step 6 — Final verification

- [x] `npx tsc --noEmit`
  - Clean (no output); `npm run lint:changed` clean.
- [x] `npx vitest run app/js/games/minion_battles/game/battlenet/HostPersistQueue.test.ts app/js/games/minion_battles/game/battlenet/BattleNet.test.ts app/js/games/minion_battles/game/battlenet/SnapshotPersistence.test.ts app/js/games/minion_battles/game/battlenet/OrderQueueController.test.ts app/js/games/minion_battles/game/battlenet/userStateBatchQueue.test.ts app/js/games/minion_battles/game/interactiveTargeting.test.ts app/js/games/minion_battles/game/interaction/previewCanonEquivalence.test.ts app/js/games/minion_battles/ui/components/hostPersistQueueAlert.test.ts`
  - 10 files (also `interactiveTargeting.comboAutoContinue.test.ts`, `turnIndicatorState.test.ts`): 348 passed, 2 skipped, 0 failed.
- [ ] **Live check (manual, solo host, local dev server).** Turn on "Log user state to server" and throttle the network in DevTools (Slow 3G). Play a mission with an ITS ability (for example 1501 Swipe/X strike) and press Wait several times quickly at a pause. Expect:
  - the turn spinner clears as soon as the commit runs;
  - the top-left "Waiting on server" card appears with a rising N and moves through info → warning → danger;
  - no `duplicate_id_hash` warns in `lobby_log.jsonl`;
  - no `tick_in_past` or resync;
  - at the 10 s cap the card adds "Orders resume when saves catch up" and the cards hold.
- [ ] **Live check (manual, 2 players):** a guest still sees the host's turns land, with no new desyncs.

### AbilityTest coverage

No new AbilityTest scenarios. AbilityTests build `GameEngine` directly and bypass BattleNet and PHP, so they cannot exercise save ordering, dedupe or commit latency. Coverage comes from the Step 1–5 Vitest files plus the live checks above. `npm run test:sim` is not needed.

---

## Follow-ups (out of scope)

- Make `UserStateStorage::appendBatch` cheap (skip the canonical re-hash, or hash on the client).
- Consider a multi-worker PHP dev server (or document `PHP_CLI_SERVER_WORKERS`) so debug uploads cannot starve battle saves.
- Look into the slow reloads in 7628CD (join → snapshot GET gaps of 20 s to 3 min).
- Guest in-place commit: the same non-blocking treatment once guest save ordering is understood.
