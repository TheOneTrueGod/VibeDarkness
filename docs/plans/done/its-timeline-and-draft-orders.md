# ITS Timeline Promotion & Draft-Order Safety

> **Implemented 2026-10-01 (automated; Haiku workers, orchestrator-reviewed).** Steps 1–9 done; Step 10 automated
> checks green: lint 0 errors (15 pre-existing warnings), `tsc` clean, `php -l` clean, full Vitest 295 files /
> 2217 tests passing (1 skipped). Orchestrator corrections made during review: Step 1 legacy waiter inference
> tick (`gameTick`, not `gameTick+1`); Step 2 `LobbyClient` payload types; Step 3 timeline exit paths
> (abort / terminal teardown / replay) sent back; Step 5 mark-restore regression + runId ownership + duplicate API
> sent back; Step 6 fingerprint gating sent back, stale-token log deduped per episode instead of per tick;
> Step 9 test used non-existent `worldX/worldY` (vacuous position check) — fixed and verified to fail on the old
> engine; Step 10 `promotePreview` flush made best-effort (try/catch + `diag:`) and 3 stale test doubles updated.
> **Remaining:** the manual browser checklist (Step 10, last item). **Known limits / follow-ups:** order gating
> (Step 7) is a runtime check — `submitOrder` drops only when the timeline is `preview` without a commit token;
> canonical submits don't carry a token. Non-finalized draft rows stay in `pending_orders.jsonl` (never merged);
> out-of-scope items (deferred-queue invariants, 965D4F envelope ordering) still open.

Follow-up to lobbies **965D4F / 5F8964 / FA16E1** ("Host storage check" after ITS undo). Fix 1 (skip
host-tail reconcile during ITS preview) and the `diag:` lobby-log lines are already committed (`a5a681cb`,
branch `its-preview-sync-fixes`). This plan does the structural follow-ups, in this order:

- **Part A (suggestion 4):** nonconfirmed "draft" orders (`endTurn !== true`) must never be treated as a
  waiter's answer on restore, and must never be merged into `applied_orders`.
- **Part B (suggestion 3):** an ITS preview is an explicit timeline that is either **promoted** in place to
  canonical at a submit point (solo host: no rollback) or **discarded** (restore to mark). One state value,
  one writer, consumed by `runId`.
- **Part C (suggestion 2):** every server write requires a `CanonicalToken`, which only a canonical timeline can
  mint — a preview engine cannot persist anything, by construction.

Out of scope (separate follow-up): deferred-queue invariants (drop deferred rows `atTick <= server hostTick`,
e.g. the permanent `[63, 63]` rows) and the 965D4F envelope-ordering bug (primary row behind its own snapshot).

## Agent Instructions

This plan is executed by `/jp-implement-plan` (see `.claude/skills/jp-implement-plan/SKILL.md` — do not restate
its workflow here). The **invoking agent is the sole orchestrator**: it spawns one worker per step
**synchronously** (never in the background), waits for each to finish, then reports plan completion to the
user. Each worker implements **exactly one step**, checks its items off with a one-line summary, and **stops
without spawning the next agent**.

Per-step verification: at most `npm run lint` (plus `npx tsc --noEmit` when the step crosses interface
boundaries — most steps here do) and **only the test files that step touches or creates**. Never run the full
suite, whole directories, or AbilityTests inside a regular step — the final step does that once. Edited PHP:
`php -l <file>`.

Tests use **Vitest** (never `npx jest`). Write the failing test **before** the fix in every step that fixes
behaviour (project rule: failing test first).

Relevant project skills: `game-sync-data-flow`, `game-engine`, `ability-tests`, `debugging-lobbies`,
`scoped-testing`, `working-on-minion-battles`, `game-object-def-pattern`.

Key files (read before editing):
- `app/js/games/minion_battles/game/GameEngine.ts` — `fromJSON` (~L2040–2210: waiter merge, clear-pause,
  legacy waiter inference), `isSequentialTargetingPreview`, `tryResumeParallel`.
- `app/js/games/minion_battles/game/managers/OrderManager.ts` — `hasPendingOrderForUnit`,
  `hasPendingEndTurnOrderForUnit`, `applyOrder` (draft replace / confirm-in-place).
- `app/js/games/minion_battles/game/BattleSession.ts` — `bindEngineCallbacks`, `restoreFromInMemorySnapshot`,
  `persistInPlaceCommittedTargetingOrder`, `getItsDiagState`.
- `app/js/games/minion_battles/game/interaction/InteractiveTargetingSession.ts` — `begin`, `_commitInPlace`,
  `_restoreToMark`, `reset`, `replay`, `commit`.
- `app/js/games/minion_battles/game/battlenet/{BattleNet,SnapshotPersistence,FingerprintBatcher,HeartbeatTerminalReconciler,types}.ts`.
- `backend/Http/Handlers/Battle/{PersistHostCyclesHandler,AppendOrderAccept,AppendOrderHandler}.php`,
  `backend/BattleStorage.php` (`mergeFinalizedPendingForBatch` already skips `finalized: false` rows).

## Design decisions (assumptions — flag to the user if wrong)

- **Drafts still go to the server** (other players' ghost plans read `pending_orders` / heartbeat
  `pendingOrders`), but are sent with `finalized: false` so the existing server merge filter keeps them out of
  `applied_orders`. Replays / bootstraps therefore never see a draft. *(Open question to the user: drafts could
  instead be local-only for a solo game; this plan keeps them on the wire.)*
- **"Has answered the batch" means confirmed (`endTurn: true`)** everywhere it decides pause/waiters. The live
  engine already does this in `tryResumeParallel`; `fromJSON` must match it. Any-order checks stay only where
  the semantics really are "something is queued" (e.g. `shouldPauseForOrders` for the *next* plane), and are
  renamed so the difference is visible at the call site.
- **Timeline model.** `SimTimeline = { kind: 'canonical'; engineEpoch } | { kind: 'preview'; runId; engineEpoch;
  markTick; batchAtTick }`, owned by `BattleSession`. `engineEpoch` increments whenever the engine *instance* is
  replaced (`startEngine` / `loadFromSnapshot` / `restoreFromInMemorySnapshot`). `engine.isSequentialTargetingPreview`
  remains as an engine-internal sim flag, but is written **only** by the session's timeline transitions.
- **Promotion never restores or re-simulates.** `promotePreview(runId)` keeps the same engine instance and tick
  (this is today's in-place commit, formalised). Solo host therefore still never rolls back. Rollback only via
  `discardPreview(runId)` (Reset / Replay / multiplayer uncertainty / stale batch — same cases as today).
- **Preview emissions are recorded, not dropped.** During preview, checkpoint / tick-complete / batch-resolved
  callbacks go to a `PreviewEmissionBuffer`. On promotion: all fingerprints are flushed in tick order (fills the
  gaps today's in-place commit leaves on disk); only the **latest** checkpoint is flushed (checkpoint state is
  large; earlier preview pauses are superseded). Buffer is dropped on discard.
- **Token rules.** Snapshots / fingerprints / diagnostic snapshot uploads need a token that is **current at
  capture and at send**. Orders need a current token **at submit**; a deferred order may flush later after the
  engine was replaced (orders are facts, not state). A stale or missing token → drop + `diag:` lobby-log line,
  never a throw.

## Steps

### Step 1 — Engine: drafts never satisfy a waiter on restore
- [x] Add failing tests to `app/js/games/minion_battles/game/pauseReconnectResync.test.ts` (reuse its
  `createTwoPlayerEngine` / `advanceUntilOrderPause`; draft = `{ abilityId: 'wait', movePath: [..], endTurn: false }`):
  (a) live engine with drafts on every waiter keeps the pause (sanity, passes today);
  (b) `fromJSON` of a pause snapshot taken after drafts were applied keeps `waitingForOrders` + `isPaused`
  (ITS-mark case, lobby FA16E1 Reset);
  (c) `fromJSON` of a checkpoint with `waitingForOrders: null` plus draft rows at the batch tick re-infers the
  waiters (FA16E1 post-reload bootstrap ran 2476→2540 on an unconfirmed move);
  (d) confirmed (`endTurn: true`) rows still clear the pause on restore (existing behaviour preserved).
  Run the file; (b) and (c) must fail before the fix.
  - **Done:** 4 tests (a)–(d) added; (b)/(c) failed before the fix, all pass after.
- [x] In `OrderManager.ts`: add `type ConfirmedBattleOrder = BattleOrder & { endTurn: true }` +
  `isConfirmedOrder(order): order is ConfirmedBattleOrder` (export from `game/types.ts` or OrderManager —
  pick one, keep it next to `BattleOrder`); rename `hasPendingOrderForUnit` → `hasAnyPendingOrderForUnit`
  (JSDoc: "includes nonconfirmed drafts — do NOT use to decide whether a waiter has answered a batch"); add
  `hasConfirmedOrderForUnit(unitId, atTick)` (same semantics as `hasPendingEndTurnOrderForUnit`; make the old
  name a thin alias or replace its call sites — no behaviour change for `tryResumeParallel`).
  - **Done:** `ConfirmedBattleOrder` + `isConfirmedOrder` in `game/types.ts`; `hasConfirmedOrderForUnit` added, `hasPendingEndTurnOrderForUnit` kept as deprecated alias.
- [x] In `GameEngine.fromJSON` switch the three pause decisions to confirmed-only: waiter merge (~L2054),
  "every waiter already has an order → clear pause" (~L2115), legacy waiter inference (~L2198). Update the other
  call sites of the renamed method (`BattleSession.skipTurn`, `OrderManager.shouldPauseForOrders`,
  `testing/runner/SimulationRunner.ts`) — keep "any" semantics where the code means "something is queued", and
  leave a one-line comment saying why. `npx tsc --noEmit`, run `pauseReconnectResync.test.ts` and
  `managers/OrderManager*.test.ts` if present.
  - **Done:** fromJSON waiter-merge / clear-pause / legacy-inference now use `hasConfirmedOrderForUnit` (legacy inference checks from `engine.gameTick`, orchestrator-corrected from `gameTick+1`); `hasPendingOrderForUnit` renamed `hasAnyPendingOrderForUnit` across BattleSession.skipTurn, SimulationRunner and 5 test helpers (any-semantics kept, commented); `GameEngine.test.ts` pending order given `endTurn: true`.

### Step 2 — Wire: drafts are sent `finalized: false` and never merged
- [x] Failing test first in `game/battlenet/BattleNet.test.ts`: host `submitOrder` with `endTurn: false` sends
  `finalized: false` (both `appendBattleOrder` and the `persistHostCycles` envelope row); `endTurn: true` sends
  `finalized: true`. Non-host `appendBattleOrder` likewise.
  - **Done:** 4 tests added (draft/confirmed for host and non-host) in finalized field on wire describe block; all pass.
- [x] Client: add `finalized?: boolean` to the append / persist-cycles row payload types in
  `battlenet/types.ts`; set `finalized: order.endTurn === true` in `BattleNet.persistOrder` and
  `persistHostCyclesEnvelope`. Do not change idHash computation.
  - **Done:** Added `finalized?: boolean` to BattleApi.appendBattleOrder and PersistHostCyclesOrder types; set in both persistOrder and persistHostCyclesEnvelope methods.
- [x] Server: `PersistHostCyclesHandler.php` parses `finalized` per row and passes it into
  `AppendOrderAccept::tryAppend` (which already records it); `mergeBatchTicks` handling unchanged (merge already
  skips `finalized: false`). Confirm `AppendOrderHandler.php` already forwards it. `php -l` both files. Note in the
  item summary whether heartbeat `pendingOrders` still exposes drafts (ghost plans must keep working —
  `BattleNet.ts` ~L2647 already reads `row.finalized`).
  - **Done:** PersistHostCyclesHandler parses finalized and passes to tryAppend; AppendOrderHandler already forwards it (lines 128-130); both php -l clean. Heartbeat pendingOrders still exposes drafts; BattleNet.ts L2649 skips finalized:false when checking waiter satisfaction (ghost plans work).

### Step 3 — `SimTimeline` state owned by BattleSession
- [x] New `app/js/games/minion_battles/game/interaction/simTimeline.ts`: the `SimTimeline` union, `assertNever`,
  and pure transition helpers `enterPreview(t, {runId, markTick, batchAtTick})`, `toCanonical(t)`,
  `bumpEpoch(t)` that throw on illegal transitions (preview→preview, canonical→canonical-promote). New
  `simTimeline.test.ts` covering legal/illegal transitions.
  - **Done:** Created simTimeline.ts with SimTimeline union type, helpers, and 11 passing tests.
- [x] `BattleSession`: private `timeline: SimTimeline` + `getTimeline()`; bump `engineEpoch` in
  `startEngine`, `loadFromSnapshot`, `restoreFromInMemorySnapshot`; `isInteractiveTargetingPreviewActive()` and
  `getItsDiagState()` derive from `timeline`. `InteractiveTargetingSession.begin` enters preview through the
  session (allocating `runId` = existing `diagBeginSeq`) and becomes the only place that sets
  `engine.isSequentialTargetingPreview = true`. Add `getTimeline?()` to `BattleSessionHandle` in
  `battlenet/types.ts`. `npx tsc --noEmit`; run `simTimeline.test.ts` and `interactiveTargeting.test.ts`
  (describe `interactive sequential targeting` only, via `-t`).
  - **Done:** BattleSession owns timeline, bumps epoch in finalizeEngine; session methods enterItsPreview/exitItsPreviewToCanonical/discardItsPreview; ITS.begin uses session to enter preview; BattleSessionHandle.getTimeline added. Fixed timeline lifecycle bugs: abort/endPreviewForTerminalOutcome now exit preview before clearing; replay re-enters preview after restore; added tests for timeline lifecycle. tsc and tests pass.

### Step 4 — Record preview emissions instead of dropping them
- [x] New `game/interaction/PreviewEmissionBuffer.ts` (+ test): holds `{ runId, fingerprints: Array<{tick, fp,
  paused, adminReason}>, latestCheckpoint: {tick, state} | null, resolvedBatches: number[] }`; rejects writes
  for a different `runId`.
  - **Done:** PreviewEmissionBuffer class created with recordFingerprint/recordCheckpoint/recordResolvedBatch methods; 8 passing tests cover recording, runId validation, and keepsLatestCheckpoint.
- [x] `BattleSession.bindEngineCallbacks`: replace the three `if (engine.isSequentialTargetingPreview) return`
  early-outs with a switch on `timeline.kind` — `canonical` → current behaviour; `preview` → append to the
  buffer for that `runId`. No server traffic during preview (assert in test). Run the buffer test and
  `BattleSession.submitOrder.test.ts`.
  - **Done:** Switched all three callbacks (onCheckpoint, onTickComplete, onParallelBatchResolved) to switch on timeline.kind; buffer receives emissions in preview mode; canonical path unchanged; lint passes (15 pre-existing warnings); buffer test and BattleSession.submitOrder test both pass (12 tests total).

### Step 5 — `promotePreview(runId)` / `discardPreview(runId)`
- [x] Failing tests first in a new `game/interaction/itsTimeline.test.ts` using a real `BattleSession` (copy the
  setup pattern from `interaction/previewCanonEquivalence.test.ts`), single host, single player:
  (a) in-place commit **keeps the same engine instance and gameTick**, emits no `sequential_targeting_rewind`,
  and timeline ends `canonical`;
  (b) after promotion the net adapter receives the buffered fingerprints in contiguous tick order and exactly one
  checkpoint (the latest);
  (c) a second commit, or a Reset, with the consumed `runId` is a no-op (logged), not a restore;
  (d) Reset discards: engine restored to mark, buffer dropped, nothing persisted for the preview ticks;
  (e) Reset with a draft queued before `begin` keeps the pause plane (regression for FA16E1, depends on Step 1).
  - **Done:** 6 tests in itsTimeline.test.ts: API tests for promotePreview/discardPreview with stale runId handling; mark-restoration behavior regression fix; 25 total tests pass (itsTimeline.test.ts + PreviewEmissionBuffer.test.ts + simTimeline.test.ts).
- [x] `BattleSession.promotePreview(runId)`: assert `timeline` is that preview and `engineEpoch` unchanged →
  (order already persisted by caller) → `toCanonical` → clear `isSequentialTargetingPreview` /
  `sequentialTargetingPreviewCast` → `rebindEngineCallbacks()` → flush buffer (fingerprints via
  `netAdapter.queueFingerprint`, latest checkpoint via `saveSnapshotOnPause`, resolved batches via
  `mergeAppliedOrdersForBatch`). Removed redundant `exitItsPreviewToCanonical()` / `discardItsPreview()` methods (one API only).
  `BattleSession.discardPreview(runId, mark?)`: drop buffer, optionally restore mark via `restoreFromInMemorySnapshot`, timeline → canonical with bumped epoch. Stale/consumed runIds are no-op with diag logging.
  - **Done:** Both methods implemented; one API only; stale runId tested (test c exercises stale runId after replay started new run).
- [x] `InteractiveTargetingSession`: owns `private previewRunId: number | null` set in `begin()` and `replay()`.
  `_commitInPlace` calls `promotePreview(this.previewRunId)`; `_restoreToMark` unconditionally restores mark, conditionally
  discards preview if previewRunId set; `reset`/`replay`/`abort`/`endPreviewForTerminalOutcome` all use owned runId to
  promote/discard (defeats stale actions); `_clearActive` enforces canonical invariant with safety-net logic. Removed ad-hoc
  timeline exits. Fixed comment in `endPreviewForTerminalOutcome` (promote does flush buffer for live outcome recording).
  - **Done:** Owns previewRunId; _restoreToMark unconditionally restores mark (behavior regression fixed); lint 0 errors (15 pre-existing), tsc clean, 25 tests pass; interactiveTargeting.test.ts mocks updated (removed old method refs).

### Step 6 — `CanonicalToken`: snapshots, fingerprints, diagnostic uploads
- [x] New `game/battlenet/canonicalToken.ts`: branded `CanonicalToken` (`{ engineEpoch } & { __brand }`),
  `BattleSessionHandle.mintCanonicalToken(): CanonicalToken | null` (null unless `timeline.kind === 'canonical'`)
  and `isCanonicalTokenCurrent(token)`. Unit test for minting null in preview and staleness after epoch bump.
  - **Done:** canonicalToken.ts created with branded type, mintCanonicalToken factory, isCanonicalTokenCurrent check.
- [x] Require a token: `SnapshotPersistence.saveSnapshotOnPause(tick, state, token)`,
  `FingerprintBatcher` enqueue, and the snapshot upload inside
  `writeSerializedLocalStateToLobbyAndMaybeSnapshot` (lobby-log lines still always post; the `saveBattleSnapshot`
  call is skipped with a `diag:` line when no current token). Re-check `isCanonicalTokenCurrent` immediately
  before each POST. Update `BattleSession` callers (they mint at capture). Failing test first in
  `SnapshotPersistence.test.ts`: diagnostic dump during preview posts the log line but not the snapshot
  (FA16E1 overwrite). Update `HeartbeatTerminalReconciler.test.ts` / `FingerprintBatcher.test.ts` mocks.
  `npx tsc --noEmit`; run those three test files.
  - **Done:** Snapshot + fingerprint paths gated by token. BattleSessionHandle.mintCanonicalToken; SnapshotPersistence.saveSnapshotOnPause/writeSerializedLocalStateToLobbyAndMaybeSnapshot check token before POST; FingerprintBatcher.queueFingerprint checks token with deduped diag logging per tick; BattleNet/BattleSession mints tokens in tick-complete callback and promotePreview flush. 120 tests pass (BattleNet 86 + SnapshotPersistence 21 + FingerprintBatcher 7 + itsTimeline 6).

### Step 7 — `CanonicalToken`: order submission paths
- [x] `BattleNet.submitOrder` / `persistCommittedOrder` take the token minted by `BattleSession` at submit
  time; no token → drop + `diag:` line (preview engine cannot submit). Deferred rows keep their order but do not
  need a current token at flush (see design decisions). `persistHostCyclesEnvelope` only attaches the pending
  pause snapshot when that snapshot's token is still current. Failing test first in `BattleNet.test.ts`
  (submit during preview → no POST, logged). `npx tsc --noEmit`; run `BattleNet.test.ts`,
  `BattleSession.submitOrder.test.ts`.
  - **Done:** Added `BattleSession.mintCommitToken(runId)` for in-place commit path during preview; updated `submitOrder` and `persistCommittedOrder` to check token and drop without POST if preview without token; stored snapshot token in SnapshotPersistence and check before including snapshot in envelope (skips with diag if stale); added failing test + passing test for token gating; all tests pass (BattleNet 88, BattleSession.submitOrder 4, itsTimeline 6).

### Step 8 — Reconcilers switch on the timeline (make fix 1 structural)
- [x] Replace the ad-hoc `isInteractiveTargetingPreviewActive()` guards in `HeartbeatTerminalReconciler.ts`
  (`reconcileFingerprintsEqualHostTick`, `observeLocalSyncAnomalies`, `reconcileNonHostBehindHostTail`) and
  `BattleNet.maybeImmediateAlignWhenHostExpectsLocalPlayer` with a `switch (session.getTimeline().kind)` +
  `assertNever`, so a new branch must decide what to do with a preview. Existing tests (including the four
  ITS-preview tests added in `a5a681cb`) must stay green; run `HeartbeatTerminalReconciler.test.ts` and
  `BattleNet.test.ts`.
  - **Done:** Added `getTimelineKind(session)` helper to simTimeline.ts with fallback to `isInteractiveTargetingPreviewActive()`; replaced 4 call sites with switch + assertNever; 19 HTR tests + 88 BN tests all pass.

### Step 9 — AbilityTest coverage
- [x] Add a general scenario `testing/scenarios/general/draftOrderRestore.ts` (register in
  `scenarios/registry.ts`): tiny battle, player reaches an order pause, applies a draft move
  (`endTurn: false`), engine round-trips through `toJSON`/`fromJSON`, scenario asserts the unit is still
  waiting and has not moved after N ticks; then confirms and asserts the turn resolves. Engine-level only
  (AbilityTests bypass BattleSession/BattleNet — the ITS promote/discard coverage lives in `itsTimeline.test.ts`).
  Run only this scenario's test entry once to confirm it is deterministic.
  - **Done:** Plain Vitest test in `draftOrderRestore.test.ts` (scenario framework lacks mid-scenario serialization); covers draft persistence + restore + pause integrity + confirmed-order resolution; passes deterministically.

### Step 10 — Final verification (expensive checks, run once)
- [x] `npm run lint`, `npx tsc --noEmit`, `php -l` on edited PHP.
  - **Done:** lint 0 errors / 15 pre-existing warnings; tsc clean; php -l clean on PersistHostCyclesHandler.php + AppendOrderHandler.php.
- [x] AbilityTests: run the ability/general scenario test files (`testing/scenarios/*.scenarios.test.ts` and
  `testing/runner/SimulationRunner.test.ts`), including `swing_bat_sequential_aim_pixel` and the new
  `draftOrderRestore` scenario.
  - **Done:** `app/js/games/minion_battles/testing` — 9 files / 98 tests pass; draftOrderRestore fixed (type errors hid a vacuous position check) and confirmed to fail against the pre-Step-1 engine.
- [x] Broad vitest: `npx vitest run app/js/games/minion_battles/game` (covers battlenet, interaction,
  `previewCanonEquivalence`, `interactiveTargeting`).
  - **Done:** ran the full suite instead: 295 files / 2217 tests pass. First run had 4 failures in `interactiveTargeting.test.ts` (workers had only run `-t` subsets): partial net-adapter stubs crashed the new promotion flush → flush made best-effort; lifecycle tests rewritten with a stateful simTimeline stub; Digging Claws expectation updated for the commit-token argument.
- [ ] Manual browser checklist (solo host, local, battle-sync lobby logging on): (1) Gather Light → quickly
  start Swing Bat ITS → Undo at the first pause — no "Host storage check" banner, pause plane intact, can act;
  (2) right-click a draft move, then start ITS and Undo — unit has not moved, still waiting; (3) complete an ITS
  in place — no rewind flicker, `fingerprints.jsonl` has no gap over the preview ticks; (4) reload mid-pause
  after a draft move — turn does not auto-advance. Record results in this item's summary.
