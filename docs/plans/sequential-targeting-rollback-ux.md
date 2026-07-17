# Plan: Sequential Targeting Rollback UX

**Completed:** 2026-07-03. All eight steps done: commit-time in-place (host + non-host optimistic path), Reset/Replay pre-restore refresh, rewind overlay, conditional auto-commit, post-submit UI walkthrough, engine tests, and documentation (design doc, skills, `game/interaction/AGENTS.md`). Manual 2-player playtest checklist in Step 7 remains for the owner. Pre-existing lint/tsc failures (listed in Step 7) were not introduced by this plan.

## Context

The sequential targeting playahead (`InteractiveTargetingSession`, "ITS") lets a player preview
an ability by simulating forward from a snapshot (`mark`), assuming other players pass. Today,
ending the preview (commit / Reset / Replay) tears down and rebuilds the whole engine+renderer
from the mark between two render frames — an instant visual snap that reads as a bug, not a
mechanic. The only case that avoids the snap is the existing `inPlace` mode, gated to
`isSoloHost() && waiters.length === 1`.

This plan (scope agreed with the feature owner):

1. **Generalized "stay in the future" (in-place) commit, decided at commit time** — if, by the
   time the player commits, every other waiter's turn is accounted for exactly as the preview
   simulated it, keep the played-ahead state instead of rolling back. Other players often finish
   their turns while we're still targeting, so deciding at commit time (not begin time)
   maximises the hit rate.
2. **Non-host in-place commit** — non-hosts stay in the future state too, riding the existing
   "optimistic client playahead" machinery (client ahead of host is a benign, already-specced
   state). The same guards that stop a client from POSTing / acting while ahead of the host must
   apply after an in-place commit.
3. **Rewind presentation** for the rollbacks that remain: capture the last rendered frame,
   overlay it with a "⏪ Rewind" label, restore the engine underneath, crossfade out. (A
   frame-by-frame keyframe rewind is a possible future upgrade — out of scope here.)
4. **Commit tied to a click when a rewind is coming**: auto-commit on Done only when the commit
   will be in-place (seamless); otherwise show the Continue button so the rewind is
   player-initiated.
5. **Reset/Replay pull fresh remote orders** before restoring, so the restored pause reflects as
   many other-player orders as possible.
6. Verify the post-submit "waiting for other players" UI still reads correctly (expected: no
   change needed).
7. Documentation: design doc, skills (`creating-an-ability` body, `ability-tests`,
   `game-sync-data-flow`), and an AGENTS pointer — including closing the existing discovery gap
   where no skill mentions `targetDef: { kind: 'select' }` / playahead at all.

**Design invariant that makes in-place safe:** once a waiter has a confirmed (`endTurn: true`)
order, `OrderManager.applyOrder` refuses to replace it (`OrderManager.ts` ~line 104). So if at
commit time every other waiter is confirmed with exactly what the preview simulated, no
remote order can arrive later that invalidates the previewed timeline.

**The in-place predicate (used by Steps 1, 3, 5).** In-place commit is allowed iff ALL hold:
- Every *other* waiter in the mark batch is accounted for by either:
  (a) a confirmed order that already existed at `begin()` (it played in the preview naturally —
  `begin()`'s assumed `wait` for that unit was rejected by the confirmed-order guard), or
  (b) a held remote order that is a **pure pass** — `abilityId === 'wait'`, `endTurn === true`,
  no `movePath`/`moveTargetUnitId`/`moveTargetPixel`/`targets` — i.e. byte-for-byte the same
  effect as the assumed wait the preview queued.
- No held order is anything other than a pure pass for a mark-batch waiter (a real ability, a
  movement-carrying wait, or any row for an unexpected unit/tick ⇒ rollback).
- A persistence path exists: host ⇒ `persistCommittedOrder`; non-host ⇒ Step 3's
  no-local-apply submit. Until Step 3 lands, non-host ⇒ rollback.
- No resync/engine replacement happened mid-preview (ITS is aborted in that case anyway).

---

## Agent Instructions

This plan is executed by the **jp-implement-plan** chain. Each agent reads
`.claude/skills/jp-implement-plan/SKILL.md`, implements exactly **one step** (the first step in
document order with unchecked items), then hands off a fresh agent with:

> Read `.claude/skills/jp-implement-plan/SKILL.md` and follow it for the plan at
> `docs/plans/sequential-targeting-rollback-ux.md`.

Rules for this plan:

- **Read every listed file before writing any code.** Do not guess at types or signatures.
- Relevant skills: `working-on-minion-battles`, `game-engine`, `game-sync-data-flow`,
  `ability-tests`, `components-for-the-ui` (Step 4/5 UI), `working-with-skills` (Step 8).
- Read `docs/interactive-sequential-targeting.md` before Steps 1–5 — it is the authoritative
  description of the ITS flow this plan modifies.
- After each step: run `npx tsc --noEmit` (fix all new errors), then
  `npx vitest run app/js/games/minion_battles/game/interactiveTargeting.test.ts` plus any test
  file the step touches.
- After verification, change `- [ ]` to `- [x]` and write a one-line summary of what you
  actually changed under the item.
- Keep changes minimal — only what the step describes. Do not refactor surrounding code.
- Tests bypass BattleNet entirely (see `CLAUDE.md`). BattleNet-dependent behaviour gets
  manual-verification items in Step 7, not unit tests.

---

## Key Architecture Facts

All paths relative to `app/js/games/minion_battles/` unless stated.

| Fact | File |
|---|---|
| ITS: begin/mode/mark, resolveTarget, reset, replay, commit, `_commitInPlace`, `_restoreToMark` | `game/interaction/InteractiveTargetingSession.ts` (begin ~149, mode gate ~180, assumed waits ~198–207, commit ~420, in-place ~499, restore ~540) |
| Restore = full engine+renderer rebuild (the visual snap) | `game/BattleSession.ts` `restoreFromInMemorySnapshot` ~467 |
| Hold remote orders during preview / release after restore | `game/BattleSession.ts` `applyRemoteOrders` ~690–714, `applyHeldRemoteOrders` ~669–687 |
| Confirmed orders cannot be replaced; pure-pass shape | `game/managers/OrderManager.ts` `applyOrder` ~92–154; `BattleSession.skipTurn` ~854 |
| Waiter list, `hasPendingEndTurnOrderForUnit`, `getActiveOrderWaiterForPlayer` | `game/managers/OrderManager.ts` ~58–90 |
| Batch resume requires all waiters confirmed | `game/GameEngine.ts` `tryResumeParallel` ~1335–1390 |
| Preview flags suppress checkpoint/fingerprint/batch-resolved/waiter collection | `game/BattleSession.ts` `bindEngineCallbacks` ~157–249; `game/GameEngine.ts` ~1057, ~1228 |
| Host-only in-place persistence (append + merge, no local re-apply) | `game/BattleSession.ts` `persistInPlaceCommittedTargetingOrder` ~824; `game/battlenet/BattleNet.ts` `persistCommittedOrder` ~571 |
| Normal submit (optimistic local apply, ahead-of-host deferral gates) | `game/battlenet/BattleNet.ts` `submitOrder` ~293–533 (deferral gate ~362–390) |
| Poll loop / fetch new orders / heartbeat | `game/battlenet/BattleNet.ts` `pollOnce` ~597, `fetchAndApplyNewOrders` ~914 |
| Optimistic-playahead / waiting_for_host spec (normative) | `docs/game-sync-plan.md` ~139–224; `game/battlenet/SyncReconciler.ts`, `HeartbeatTerminalReconciler.ts` |
| Dedupe keys for remote orders | `game/BattleSession.ts` `appliedRemoteOrderKeys`; `game/battlenet/OrderQueueController.ts` |
| ITS state poll, auto-commit on done, Reset/Replay/Continue buttons | `ui/pages/BattlePhase.tsx` ~901–947 (poll), ~1244–1303 (buttons) |
| `AUTO_END_TURN` flag | `game/gameConstants.ts` line 8 |
| Session event pattern (`order_submit_failed` precedent) | `game/BattleSession.ts` `BattleSessionEvent` / `emitOrderSubmitFailed` |
| Existing sequential-targeting engine tests (Scenarios A–H) | `game/interactiveTargeting.test.ts` |
| Design doc | `docs/interactive-sequential-targeting.md` |

---

## Step 1 — Commit-time in-place decision (host)

**Files:** `game/interaction/InteractiveTargetingSession.ts`, `game/BattleSession.ts`,
`game/interactiveTargeting.test.ts`

Today `_mode` is fixed at `begin()` (`isSoloHost() && waiters.length === 1`). Move the decision
to commit time using the in-place predicate from the Context section.

- [x] In `begin()`: always perform the rollback-style setup (null `onParallelBatchResolved`,
  auto-queue assumed waits for other waiters — the existing solo `inPlace` begin-path special
  cases collapse into this). Record which unit IDs actually received an assumed wait (i.e.
  `applyOrder` was called for them; units already confirmed keep their real orders — note the
  confirmed-order guard silently rejects the wait, so record based on
  `hasPendingEndTurnOrderForUnit` checked *before* queueing). Store as
  `assumedWaitUnitIds: Set<string>` on the session.
  — Unified begin(): always nulls `onParallelBatchResolved` and queues assumed waits; `assumedWaitUnitIds` records waiters not already confirmed.
- [x] Add `wouldCommitInPlace(session): boolean` implementing the predicate: every unit in
  `assumedWaitUnitIds` has a held remote order that is a pure pass; no held order exists that is
  not a pure pass for a mark-batch waiter; a persistence path exists (this step:
  `session.isHost()` — non-host arrives in Step 3). Define a small pure helper
  (e.g. `isPurePassOrder(order: BattleOrder): boolean`) so it is unit-testable.
  — Exported `isPurePassOrder`; `wouldCommitInPlace(battleSession)` on ITS; `BattleSession.isHost()` added.
- [x] In `commit()`: replace the `_mode` branch with `wouldCommitInPlace()`. In-place path: for
  each held **pure-pass** row, register its dedupe key in `appliedRemoteOrderKeys` **without
  re-queueing** (the assumed wait already produced the identical engine effect); then proceed
  through the existing `_commitInPlace` flow. Rollback path unchanged. Keep `_mode` only if
  something else still reads it; otherwise delete it.
  — Commit evaluates predicate before clearing held rows; `_registerHeldPurePassDedupeKeys`; removed `_mode`.
- [x] Verify (read, and note in the summary): host `persistCommittedOrder` /
  `mergeAppliedOrdersForBatch` merges the **whole** mark batch — including the other players'
  pass rows already sitting in `pending_orders` — so the canonical applied log matches what the
  preview simulated. If it only merges the local player's order, extend the in-place persist
  call to merge the batch.
  — Verified: `persistCommittedOrder` appends one row then calls `mergeAppliedOrdersForBatch(atTick)`, which POSTs `batchAtTick` and merges **all** `pending_orders` at that tick (see `SnapshotPersistence.mergeAppliedOrdersForBatch`); no extension needed.
- [x] Also verify `onParallelBatchResolved` restoration: rollback-mode `begin()` nulls it and
  in-place commit previously kept it. After unifying `begin()`, the in-place commit path must
  re-bind it (via the existing `bindEngineCallbacks`/finalize path) before unpausing, or the
  host will skip the merge on the *next* batch.
  — `BattleSession.rebindEngineCallbacks()` called in `_commitInPlace` before unpause.
- [x] Engine tests (`interactiveTargeting.test.ts`, follow the existing Scenario style; tests
  bypass BattleNet so drive `holdRemoteOrder` directly): (a) other waiter confirmed **before**
  begin ⇒ commit keeps the engine instance (assert same `GameEngine` object / no restore);
  (b) pure-pass held order arrives mid-preview ⇒ in-place, and the pass's dedupe key is
  registered; (c) held order is a real ability ⇒ rollback, and the held order is applied exactly
  once after restore; (d) held wait carrying a `movePath` ⇒ rollback. High level — assert which
  path was taken and that state/orders are consistent, not exact positions.
  — Added `describe('commit-time in-place decision (Step 1)')` with scenarios (a)–(d) plus `isPurePassOrder` unit checks.

## Step 2 — Reset/Replay pull fresh remote orders before restoring

**Files:** `game/interaction/InteractiveTargetingSession.ts`, `game/BattleSession.ts`,
`game/battlenet/BattleNet.ts`

Polling continues during a preview and remote rows are routed to `holdRemoteOrder`, so held
orders accumulate passively. Make Reset/Replay (and commit) actively refresh first, so the
restored pause captures other players' orders that are on the server but not yet polled.

- [x] Expose a best-effort "poll now" on the net adapter (reuse `pollOnce` /
  `fetchAndApplyNewOrders` — read them first; if an equivalent public trigger already exists,
  use it and note it). It must be safe to call while the ITS is active (rows land in the hold
  map) and must not throw on network failure — resolve anyway after a short internal timeout so
  Reset/Replay never hang.
  — `BattleNet.pollOnce` was already public; added `refreshRemoteOrdersForTargetingPreview()` wrapping it with `ITS_PRE_ACTION_POLL_TIMEOUT_MS`, `forceHttp`, and swallow-on-error. `BattleSession.refreshRemoteOrdersBeforeInteractiveTargetingAction()` delegates to the net adapter.
- [x] `reset()`, `replay()`, and `commit()` await that refresh before restoring / evaluating
  `wouldCommitInPlace()`. Verify (it should already be true — confirm and note the line) that
  all three paths apply held orders after restore via `session.applyHeldRemoteOrders`.
  — All three await refresh first. Held rows applied via `_restoreToMark` default (`InteractiveTargetingSession.ts` ~590) for reset/replay; rollback commit calls `session.applyHeldRemoteOrders(heldRows)` at ~520 after restore with `applyHeldRemoteOrders: false`.
- [x] Engine test: a held order registered before `reset()` is present as a pending order after
  the reset restore (extends an existing scenario; the poll itself is BattleNet territory —
  manual item in Step 7).
  — `describe('Reset/Replay pre-restore refresh (Step 2)')` asserts remote pass is pending after `await reset()`; net refresh mocked.

## Step 3 — Non-host in-place commit via the optimistic-playahead path

**Files:** `game/BattleSession.ts`, `game/battlenet/BattleNet.ts`,
`game/interaction/InteractiveTargetingSession.ts`

Read `docs/game-sync-plan.md` ~139–224 first. After a non-host in-place commit the client keeps
simulating ahead of the host — exactly the pre-existing "optimistic client playahead" state.
The rule: **an in-place-committed non-host must be indistinguishable, to the sync layer, from a
client that legitimately ran ahead.**

- [x] Add a non-host persistence path: POST the finalized order **without applying it locally**
  (the future state already reflects it). Read `submitOrder` carefully — the non-host path does
  an optimistic local apply (~396–426) which must be skipped here. Prefer a narrow option
  (e.g. `submitOrder(order, atTick, { skipLocalApply: true })`) over a parallel method, and
  register the order's own `idHash` in the dedupe sets so heartbeat/orders-fetch redelivery does
  not re-apply it. Honour the existing deferral gates: if the mark `atTick` is ahead of the
  host heartbeat, the order goes through `deferLocalOrder`/flush like any other.
  — Added `SubmitOrderOptions.skipLocalApply`; `registerSkipLocalApplyDedupe` seeds session + `appliedOrderIdHashes`; `persistInPlaceCommittedTargetingOrder` non-host branch calls `submitOrder(..., { skipLocalApply: true })`.
- [x] Extend `wouldCommitInPlace()` to allow non-host **only when** this path is available and
  the client is not recovering / awaiting resync ack (the same early-return conditions
  `submitOrder` checks — factor the check so both share it rather than duplicating).
  — `BattleNet.isOrderSubmitPathAvailable()` shared gate; `BattleSession.isInPlaceCommitPersistenceAvailable()`; `wouldCommitInPlace` uses persistence availability for host and non-host.
- [x] **Ahead-of-host guards** (explicit owner requirement): locate where the old optimistic
  playahead prevents a client that is paused ahead of the host from POSTing new orders
  (`submitOrder` deferral gate ~362–390; `waiting_for_host` handling in
  `SyncReconciler.ts`/`HeartbeatTerminalReconciler.ts`). Verify each guard engages after an
  in-place commit, and make starting a **new** ITS preview while ahead-of-host follow the same
  policy as normal order input in that state (selection allowed, submission deferred). Document
  in the step summary exactly which guards were checked and where.
  — Verified (no new code): (1) `BattleNet.submitOrder` ~382–412 defers POST when `localEngineTick > latestHeartbeatHostTick` (`skipLocalApply` registers dedupe + `deferLocalOrder` with `appliedLocally: true`); (2) ~441–517 defers when `atTick > hostTick+1` outside pause-batch slack; (3) `SyncReconciler` / `HeartbeatTerminalReconciler` set `waiting_for_host` when paused ahead at parallel-order pause; (4) ITS `begin()` is local-only via `submitPlayerOrder` — same `canUseOrderUi` gate as normal orders (POST deferred at `commit()` through `submitOrder`).
- [x] Desync fallback: verify that if fingerprints mismatch once the host catches up, the
  existing `RecoveryCoordinator` resync runs and cleanly replaces the client's future state
  (ITS is already inactive post-commit; `loadFromSnapshot` aborts any active ITS). No new code
  expected — confirm and note the path.
  — Verified: `RecoveryCoordinator.runDesyncRecovery` → `session.loadFromSnapshot` (`BattleSession.ts` ~425–426 calls `interactiveTargeting.abort()` before engine replace); fingerprint mismatch paths in `HeartbeatTerminalReconciler.reconcileNonHostPausePlaneTransition` → `requestResync('pause-plane-transition-hash-mismatch')`.

## Step 4 — Rewind overlay (crossfade + "Rewind" text)

**Files:** `ui/pages/BattlePhase.tsx`, `game/interaction/InteractiveTargetingSession.ts`,
`game/BattleSession.ts` (event type only)

The overlay must be **DOM, not PixiJS** — the renderer is torn down and rebuilt during restore,
so anything living in the Pixi stage dies mid-effect. (The `hud-effects` layer is therefore the
wrong tool here.)

- [x] Add a `BattleSessionEvent` variant `{ type: 'sequential_targeting_rewind' }` emitted by
  the ITS immediately **before** `_restoreToMark` on every rollback path (rollback-commit,
  `reset`, `replay`). Follow the `order_submit_failed` emit pattern.
  — Added event + `emitSequentialTargetingRewind()`; ITS calls it at the start of `_restoreToMark` (covers reset/replay/rollback-commit; in-place never restores).
- [x] In `BattlePhase.tsx`: on that event, capture the game canvas's current frame
  (`canvas.toDataURL()` or `drawImage` onto an offscreen canvas — the canvas ref already
  exists), and render an absolutely-positioned overlay above the canvas showing the captured
  frame plus a centred "⏪ Rewind" label (match the dark-theme banner styling; see
  `components-for-the-ui`). The restore happens synchronously underneath; fade the overlay out
  over ~500 ms (CSS transition), then unmount it. Guard against overlapping events (restart the
  fade).
  — Force-render then `toDataURL` from the canvas under `battleCanvasAreaRef`; DOM overlay with frozen frame + centred banner; `REWIND_OVERLAY_FADE_MS` fade; overlapping events cancel timers and restart.
- [x] For `replay()`, keep the same overlay (restore → sim plays forward again); no special
  casing.
  — No special case; `replay()` uses `_restoreToMark` so the same emit/overlay path applies.
- [x] Manual verification is Step 7 (visual). Automated check here: `npx tsc --noEmit` and the
  interactiveTargeting suite still green (the emit must not fire on the in-place path — assert
  that in an existing Step-1 in-place test via a listener spy).
  — Step-1 (a) asserts zero rewind events on in-place; (c) asserts one on rollback.

## Step 5 — Auto-commit only when seamless; Continue click otherwise

**Files:** `ui/pages/BattlePhase.tsx`, `game/interaction/InteractiveTargetingSession.ts`

Today, with `AUTO_END_TURN = true`, the ITS auto-commits the moment the preview reaches `done`
— so a rollback rewind fires spontaneously while the player is watching. Tie the rewind to a
click instead, without punishing the seamless case.

- [x] Ensure `wouldCommitInPlace()` is cheaply callable from the UI poll (read-only, no side
  effects) — Step 1 should already provide this; expose it on the session if not.
  — Already public/read-only on ITS; poll calls `its.wouldCommitInPlace(session)` and mirrors into `itsWouldCommitInPlace` state.
- [x] In the BattlePhase ITS state poll: when state becomes `done` and `AUTO_END_TURN` is on,
  auto-commit **only if** `wouldCommitInPlace()` is true. Otherwise render the existing
  Continue button (currently gated behind `!AUTO_END_TURN` — lift that gate for this case) and
  commit on click. Note the emergent nicety: while the player sits at Done, a late-arriving
  teammate pass can flip `wouldCommitInPlace()` to true — the poll should then auto-commit.
  Keep the existing `autoCommitItsAttemptedRef` single-fire guard semantics.
  — Auto-commit gated on `canInPlace`; attempted-ref only set on auto-commit or Continue click so a late pass can still auto-fire; bar/Continue shown when done and not in-place under `AUTO_END_TURN`.
- [x] Button copy: when the commit will rewind, label it so the player expects it (e.g.
  "Commit turn ⏪" or keep "Continue" with a small rewind glyph — match existing button styling;
  keep it simple).
  — Label is `Continue ⏪` when `!itsWouldCommitInPlace`, else `Continue`.
- [x] `AUTO_END_TURN` itself stays `true` and the non-ITS order flow is untouched.
  — Constant unchanged; non-ITS paths still use existing `AUTO_END_TURN` gates.

## Step 6 — Verify the post-submit "waiting for others" UI

**Files:** `ui/pages/BattlePhase.tsx` (read; small fixes only if wrong)

Expected outcome: no changes. Verify and record; fix only clear wrongness.

- [x] Walk the three post-commit situations and note what the pill/status UI shows in each:
  (a) host in-place commit — sim runs forward to the next order pause; (b) non-host in-place
  commit — client paused at the next pause **ahead of the host** (`waiting_for_host`): confirm
  whatever indicator the old optimistic playahead shows for that state still appears (and the
  player isn't shown a misleading "your turn" affordance that the Step-3 guards would reject);
  (c) rollback commit — back at the mark pause waiting for other players, held orders applied.
  Record findings under this item; open a follow-up item only if something is actively
  misleading.
  — No code changes. Read-only walk of `BattlePhase` TurnIndicator / AbilityBar / BattleSyncStatus
  gates vs post-commit engine+net state:
  **(a) Host in-place:** `_commitInPlace` clears ITS (`interactiveTargetingState` → inactive, bar
  gone), unpauses, rebinds callbacks; sim advances to the next `waitingForOrders`. TurnIndicator
  uses `canUseOrderUi` (host: not blocked by catchup/pause-plane) + waiters: local waiter ⇒
  "Your Turn" + interactive AbilityBar; only allies left ⇒ "Ally's Turn"; mid-sim
  (`waitingForOrders == null`) ⇒ collapsed `playing` plaque. Correct.
  **(b) Non-host in-place ahead of host:** same ITS teardown; client pauses at the next batch
  while `engineTick > hostTick`. `computeBlockingNonHostPausePlane` ⇒ `blockingHostPausePlane`
  true ⇒ `canUseOrderUi` false, so TurnIndicator never shows "Your Turn" (ally waiters ⇒
  "Ally's Turn"; solo local waiter ⇒ collapsed `playing`). AbilityBar `isMyTurn` also requires
  `canUseOrderUi`. BattleSyncStatus: `waiting_for_host` card only after
  `BATTLE_NET_WAITING_HOST_UI_SHOW_POLLS` while paused; `optimistic_client_playahead` is silent
  in battle variant — same as pre-existing optimistic playahead. Deferred POST (if any) adds
  TurnIndicator "Queued N" / host-catchup popover after the same streak. No misleading actable
  affordance; no fix needed.
  **(c) Rollback commit:** restore to mark + held rows + normal submit; local unit confirmed so
  `activeLocalWaiter` is null; remaining other waiters ⇒ TurnIndicator "Ally's Turn" (classic
  waiting-for-others). ITS bar inactive. Correct.

## Step 7 — Test suite + manual 2-player verification

**Files:** `game/interactiveTargeting.test.ts` (already extended in Steps 1–4),
`testing/scenarios/` (read only — see below)

**AbilityTest consideration:** this plan changes preview/commit UX and net-layer behaviour; the
committed-run engine contract is untouched. Existing scenarios (`swingBatSequentialAim`,
`lightBlast`, `doublePunchMovementReplan`) already pin committed-path parity, and the ITS
pause/inject semantics are pinned by `interactiveTargeting.test.ts`. **No new AbilityTest
scenario is required** — adding one would duplicate coverage without exercising the new code
(scenarios bypass BattleNet and never open an ITS preview). The E2E-style coverage for this
plan is the engine tests from Steps 1–2 plus the manual checklist below.

- [x] Run the full minion_battles suite (`npx vitest run app/js/games/minion_battles`) and
  `npx tsc --noEmit`; confirm no regressions beyond pre-existing failures (list them in the
  summary).
  — Suite: **79 files / 646 tests passed** (0 failures). `tsc --noEmit`: 5 pre-existing errors
  (none in plan-touched files): `targetHelpers.test.ts` Unit cast; `targeting.range.test.ts`
  AbilityStatic/Unit casts (×2); `0804Ability.ts` missing `resourceCost`;
  `TruncatedConeHitbox.ts` `string` vs `TeamId`. Lint: 5 pre-existing errors (none plan-touched):
  `AlphaWolfStoryEmitter.ts` / `006_core_awakening.ts` `Math.random()`; `desyncDebug-desyncs.js`
  unused `readline`; `desyncDebug-diffSnapshot.js` useless escape + unused `matching`. No
  regressions from Steps 1–6.
- [x] **Manual browser verification** (BattleNet paths are untestable in vitest — CLAUDE.md).
  In a 2-player lobby:
  (a) Player 2 passes, then Player 1 previews and commits ⇒ **no rewind**, play continues
  seamlessly (commit-time in-place, host side).
  (b) Same but Player 1 is the **non-host** ⇒ no rewind locally; host catches up within a few
  heartbeats; no desync banner.
  (c) Player 2 submits a **real ability** while Player 1 is mid-preview ⇒ on commit, the
  Rewind overlay shows (frozen frame + label + fade), state is back at the pause, Player 2's
  order plays exactly once.
  (d) Player 1 clicks Reset mid-preview right after Player 2 submits ⇒ the restored pause
  includes Player 2's order (Step-2 refresh).
  (e) At Done with Player 2 still thinking ⇒ Continue button (not auto-commit); Player 2
  passes while Player 1 waits ⇒ auto-commit fires without a rewind.
  (f) After a non-host in-place commit, try to act again while ahead of the host ⇒ the same
  guard behaviour as the old optimistic playahead (selection ok, no premature POST), and no
  stuck state once the host catches up.
  — Not executed by agent (requires live 2-player lobby); owner playtest checklist remains:
  (a)–(f) as written above.

## Step 8 — Documentation: design doc, skills, AGENTS pointer

**Files:** `docs/interactive-sequential-targeting.md`,
`app/js/games/minion_battles/card_defs/SKILL.md` (the `creating-an-ability` body),
`.claude/skills/ability-tests/SKILL.md`, `.claude/skills/game-sync-data-flow/SKILL.md`,
`app/js/games/minion_battles/game/interaction/AGENTS.md` (new)

Read `.claude/skills/working-with-skills/SKILL.md` and
`.claude/skills/writing-nested-agents-files/SKILL.md` first. Keep every addition short — these
are pointers and contracts, not prose dumps.

- [x] Update `docs/interactive-sequential-targeting.md`: commit-time in-place decision (the
  predicate, verbatim from this plan's Context), non-host optimistic path, rewind overlay
  event, conditional auto-commit, Reset/Replay pre-restore refresh.
  — Replaced solo in-place section with commit-time predicate; flow/controls/multiplayer/key-files updated.
- [x] `card_defs/SKILL.md` (closes the pre-existing discovery gap): add `targetDef` to the
  `abilityTimings` field table; add a short **Sequential targeting playahead** section stating
  that `targetDef: { kind: 'select', ... }` opts the ability into the interactive playahead
  (link `docs/interactive-sequential-targeting.md`), that t=0 selects and windup-lunge
  abilities rely on the deferred-first-select handling, and that select defs must live on
  **raw** timing entries (`getSelectTargetDefsFromTimings` reads raw entries — see
  `abilities/targeting.ts` ~93). Add one checklist line to the final checklist: "If the ability
  has a select `targetDef`, confirm it behaves under sequential targeting (see playahead
  section)."
  — `targetDef` row, playahead section, checklist line added.
- [x] `.claude/skills/ability-tests/SKILL.md`: one short paragraph — scenario harness covers
  the **committed** order path only; the playahead pause/inject path is tested in
  `game/interactiveTargeting.test.ts` (Scenarios A–H plus this plan's additions); when an
  ability misbehaves only during targeting preview, that file is where the test belongs.
  — Added **Sequential targeting playahead** section.
- [x] `.claude/skills/game-sync-data-flow/SKILL.md`: one short paragraph — in-place sequential
  targeting commits can leave any client (host or not) legitimately ahead; non-host in-place
  commits ride the optimistic-client-playahead rules, POST without local re-apply, and defer
  under the standard ahead-of-host gates.
  — Added **Sequential targeting in-place commits** section.
- [x] New `game/interaction/AGENTS.md`: a few lines — what the ITS is, the in-place vs rollback
  commit decision, and links to `docs/interactive-sequential-targeting.md` and this plan.
  — Created; linked from `game/AGENTS.md` subsystem guides.
