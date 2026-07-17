# Plan: Solo-Host Sequential Targeting Without Rollback

**Completed 2026-07-01.** Parts 1–2 implemented: movement/lookahead parity (Steps 1–3), fingerprint parity tests, solo in-place `begin()`/`commit()` with `persistCommittedOrder`, terminal re-emit, docs update, and engine-level in-place commit test. Manual browser checklist (Step 6 item c) still requires a user pass for BattleNet paths.

## Context

When the player is a **solo host** (host, no other players in the lobby), the
sequential-targeting preview should not rewind and resubmit on Continue: there are no remote
orders to interfere, so the state at the end of the playahead simply *becomes* the real state.

This is only sound if the playahead is provably identical to what a playback (restore +
prefilled committed order) would produce — recovery-after-refresh replays the committed order
prefilled, and Replay restores + re-runs prefilled, so any divergence surfaces as a desync or a
visible glitch.

**Verified current state** (hardening plan `docs/plans/sequential-targeting-hardening.md`
complete through Step 9; "Playahead" commit `d3b0237`):

- **Already fixed — one-tick-late deferred fires.** `findImpendingSelectTargetNeed`
  (`game/interaction/selectTargetLookahead.ts`) runs at the top of `fixedUpdate` *before*
  `gameTime` advances (`game/GameEngine.ts` ~lines 1159–1168) and pauses one tick before an
  unresolved select-def interval would enter. After the player picks, the interval fires inline
  through the normal `entered` path — identical tick and pipeline point as a prefilled run. A
  `waitingForTargetInput != null` guard hard-freezes `fixedUpdate`.
- **Gap 1 — movement re-input application point differs.** `resolveMovement`
  (`game/interaction/InteractiveTargetingSession.ts` ~lines 211–224) calls `unit.setMovement`
  immediately while frozen at the pause (passing the pause tick as `pathfindingTick`), while
  the committed run applies `movementByLabel` mid-tick inside `unitAbilityTick`'s entered loop
  on the fire tick (`game/units/unitAbilityTick.ts` ~lines 267–276). The preview unit can end
  up one movement step ahead of the committed run.
- **Gap 2 — Pass A/B are a silent late-fire fallback.** With the lookahead, Pass A should never
  trigger — except a select def entering on the cast's application tick (elapsed 0): orders
  apply *after* the lookahead runs (`fixedUpdate` ~lines 1178–1187), so the lookahead cannot
  see that cast; Pass A blocks post-entry and Pass B fires one tick late, silently breaking
  parity for that ability shape.
- **Gap 3 — no machine-checked parity proof.** `selectTargetLookahead.test.ts` is mock-based;
  nothing asserts an interactive run and a prefilled run produce the same end state.

**Part 1** (Steps 1–3) closes the gaps and adds the parity proof. **Part 2** (Steps 4–6) builds
the solo no-rollback commit on that guarantee. Part 1 must be green before Part 2 starts.

---

## Agent Instructions

This plan is executed by the **jp-implement-plan** chain. Each agent reads
`.claude/skills/jp-implement-plan/SKILL.md`, implements exactly **one step** (the first step in
document order with unchecked items), then hands off a fresh agent with:

> Read `.claude/skills/jp-implement-plan/SKILL.md` and follow it for the plan at
> `docs/plans/solo-sequential-targeting-no-rollback.md`.

Rules for this plan:

- **Read every listed file before writing any code.** Do not guess at types or signatures.
- Relevant skills: `working-on-minion-battles`, `game-engine`, `game-sync-data-flow`,
  `ability-tests`.
- After each step: run `npx tsc --noEmit` (fix all new errors), then
  `npx vitest run app/js/games/minion_battles/game/interactiveTargeting.test.ts app/js/games/minion_battles/game/interaction/selectTargetLookahead.test.ts`
  plus any test file the step touches.
- Known-failing baseline: 10 pre-existing failures in `conditionalCancel.test.ts` and
  `SimulationRunner.test.ts` (digging-claws/claw scenarios). Anything beyond those is a
  regression you introduced.
- After verification, change `- [ ]` to `- [x]` and write a one-line summary of what you
  actually changed under the item.
- Keep changes minimal — only what the step describes. Do not refactor surrounding code.
- Tests bypass BattleNet entirely (see `CLAUDE.md`). BattleNet behaviour gets manual
  verification items in Step 6, not unit tests.

---

## Key Architecture Facts

| Fact | File |
|---|---|
| Pre-tick lookahead + `waitingForTargetInput` freeze | `game/GameEngine.ts` (`fixedUpdate` ~1159–1168), `game/interaction/selectTargetLookahead.ts` |
| Pass A / Pass B / blocked-interval guards (to remove) | `game/units/unitAbilityTick.ts` (~217–264 and exit-guard sites) |
| `movementByLabel` application in the entered loop | `game/units/unitAbilityTick.ts` (~267–276) |
| ITS lifecycle: `begin` (returns boolean, takes full order), `resolveTarget`, `resolveMovement`, three-phase async `commit`, frozen `selectLabels` | `game/interaction/InteractiveTargetingSession.ts` |
| Preview stop condition (`sequentialTargetingPreviewCast`, round guard) | `game/GameEngine.ts` (`fixedUpdate` ~1214–1227) |
| Suppressed-while-preview host callbacks (flag guards) | `game/BattleSession.ts` (`bindEngineCallbacks`, `finalizeEngine`) |
| Held-order release + dedupe keys | `game/BattleSession.ts` (`applyHeldRemoteOrders`), `appliedRemoteOrderKeys` |
| Host submit path: `persistOrder` → `applyLocalSubmitOrderAfterAppend` | `game/battlenet/BattleNet.ts` (~518–530) |
| Host batch merge (suppressed during preview) | `game/battlenet/BattleNet.ts` (`mergeAppliedOrdersForBatch`), `game/battlenet/OrderQueueController.ts` |
| Players list for solo detection | `game/BattleSession.ts` (`config.isHost`, `this.players`, `updateLobbyContext`) |
| `order_submit_failed` session event (reuse) | `game/BattleSession.ts` (`emitOrderSubmitFailed`), `ui/pages/BattlePhase.tsx` banner |
| Runtime fingerprint (parity oracle) | `game/GameEngine.ts` (`mixRuntimeFingerprint`, `getRuntimeFingerprintHex`) |
| Existing interactive tests (Scenarios A–F) | `game/interactiveTargeting.test.ts` |
| AbilityTest scenarios + registry | `testing/scenarios/abilities/punchResearch.ts` (`doublePunchMovementReplanScenario`), `testing/scenarios/registry.ts` |
| Standing architecture doc (still describes Pass A/B) | `docs/interactive-sequential-targeting.md` |

---

## Step 1 — Movement re-inputs go through one code path in both runs (gap 1)

**Files:** `game/interaction/InteractiveTargetingSession.ts`, `game/interactiveTargeting.test.ts`

- [x] Change `resolveMovement` to write `active.movementByLabel[label]` on the preview cast
  (keeping the `collectedMovementByLabel` store for commit/replay) and **remove the direct
  `unit.setMovement` call**. The interval fires inline on the resumed tick, so the existing
  entered-loop application in `unitAbilityTick.ts` applies the movement at the identical
  pipeline point (and identical `pathfindingTick`) in preview and committed runs. Update the
  now-stale doc comment ("the pause moment is the interval's fire time...") to describe the
  new mechanism.
  — `resolveMovement` now stores on `active.movementByLabel` only; doc comment updated.
- [x] Extend an engine-level test: interactive run where a movement re-input is written to
  `active.movementByLabel` at the target pause; assert the caster's `movement` path switches
  only after the interval fires (next tick), not while paused. High level — path identity, not
  positions.
  — Added `Scenario E-preview` in `interactiveTargeting.test.ts`.

## Step 2 — Remove the silent late-fire fallback: t=0 handling + Pass A/B deletion (gap 2)

**Files:** `game/interaction/InteractiveTargetingSession.ts`, `game/units/unitAbilityTick.ts`,
`game/types.ts`, `game/interactiveTargeting.test.ts`

- [x] Handle the cast-application-tick edge in `begin()`: after freezing `selectLabels`,
  determine whether the ability's first select-def interval starts at elapsed 0 (reuse the same
  `normalizeAbilityTimingsToIntervals`/`resolveAbilityTimingEntries` helpers the lookahead
  uses). If so, signal the target pause up front — collect that target *before* queueing the
  preview order and pre-fill it into the preview order's `targetsByLabel` — so the lookahead
  invariant ("no unresolved select def is ever entered") holds for every cast shape.
  — Added `findFirstSelectTargetLabelAtElapsedZero`; t=0 casts defer preview order until `resolveTarget` queues with pre-filled `targetsByLabel`.
- [x] Delete Pass A, Pass B, and all blocked-interval guards from `unitAbilityTick.ts`; remove
  `waitingForTargetIntervals` from `ActiveAbility` in `game/types.ts`. Keep `fireIntervalEntry`
  and the entered-loop `movementByLabel` application. In place of Pass A, add a dev-only loud
  failure (`console.error`) when an entered select-def interval has an unresolved target during
  a preview (`active.targetsByLabel` defined but label missing) — if that ever fires, parity is
  already broken and it must not be silently deferred.
  — Removed Pass A/B and `waitingForTargetIntervals`; missing-label preview entries log `console.error` and skip `fireIntervalEntry`.
- [x] Update the existing interactive tests (Scenarios A–F): injection now happens at the
  lookahead pause (one tick earlier than the old block-after-entry pause); remove
  `waitingForTargetIntervals` assertions. All scenarios plus `selectTargetLookahead.test.ts`
  must pass.
  — Scenario B uses damage assertions instead of `waitingForTargetIntervals`; Scenarios A–F + lookahead tests green (15/15).

## Step 3 — Fingerprint parity tests: the assumption checker (gap 3)

**Files:** `game/interactiveTargeting.test.ts`

The runtime fingerprint (mixes orders, tick ends, unit counts/positions/hp) is the strongest
available equivalence oracle. These tests gate Part 2 — do not start Step 4 until they pass.

- [x] **Parity test (targets):** two identical tiny-battle engines (same seed, same layout,
  Double Punch `0116`). Engine A: prefilled committed order (positional `targets`). Engine B:
  interactive order (`targetsByLabel: {}`, `isSequentialTargetingPreview` +
  `sequentialTargetingPreviewCast` set), stepping to each `waitingForTargetInput`, injecting
  the same targets, resuming. Step both to the same `gameTick` past ability completion and
  assert `getRuntimeFingerprintHex()` is **equal** (plus hp/position equality as a readable
  failure aid).
  — Added `interactive sequential targeting fingerprint parity` describe with shared fixture/helpers; aligns ticks via `alignEnginesToSameTick` after unfreezing committed `waitingForOrders`.
- [x] **Parity test (movement):** same shape, with a base `movePath` on the order and a
  `movementByLabel` re-input for `Target 2` (written at the pause in run B, prefilled on the
  order in run A). Assert fingerprint equality at the same end tick.
  — Second parity test uses `movementByLabelAtTarget2Pause` on interactive path vs prefilled committed order.

## Step 4 — Solo detection, mode gating, and in-place `begin()`

**Files:** `game/BattleSession.ts`, `game/interaction/InteractiveTargetingSession.ts`

- [x] Add `BattleSession.isSoloHost()`: `config.isHost` && `this.players` contains only the
  local `playerId`. Read `PlayerState` to decide how disconnected/AI entries should count and
  document the choice in the JSDoc.
  — Counts every `this.players` key regardless of `isConnected`; disconnected peers still block in-place.
- [x] In `begin()`, choose and store `mode: 'rollback' | 'inPlace'` for the preview's lifetime:
  `inPlace` only when `session.isSoloHost()` **and** the batch has exactly one waiter, the
  caster (`batch.waiters.length === 1`). With multiple local units in the batch, the auto-wait
  stand-ins would become real orders and rob those units of their turn — fall back to
  `rollback`.
  — Added `_mode`/`mode` getter; gate is `isSoloHost() && batch.waiters.length === 1`.
- [x] In-place `begin()` behaviour: skip the auto-wait loop (sole-waiter gate guarantees none
  needed); still take the mark snapshot (Reset/Replay restore); still set
  `isSequentialTargetingPreview` + `sequentialTargetingPreviewCast`; do **not** null
  `onParallelBatchResolved` — the flag guards in `bindEngineCallbacks` already suppress it, and
  the callback must survive for post-commit batches. Verify `replay()` keeps working in both
  modes (it restores + re-runs prefilled; unchanged).
  — In-place skips auto-wait and keeps `onParallelBatchResolved`; rollback unchanged; `replay()` untouched.

## Step 5 — In-place `commit()`: keep the state, persist the record

**Files:** `game/interaction/InteractiveTargetingSession.ts`, `game/BattleSession.ts`,
`game/battlenet/BattleNet.ts`

Slot into the existing three-phase async `commit()` (validate → act → verify) as a mode branch.
No restore; the engine is already at the preview stop pause (cast complete).

- [x] Build the **finalized order** exactly as the rollback path does (positional `targets`
  from frozen `selectLabels` + collected `movementByLabel` + the original order's base
  movement fields), then: clear `isSequentialTargetingPreview` +
  `sequentialTargetingPreviewCast`, clear session state, and unpause — the no-longer-suppressed
  `collectParallelWaiters` produces the next `waitingForOrders` pause naturally, and the normal
  `onCheckpoint` persists the post-turn snapshot.
  — Extracted `buildFinalizedSequentialTargetingOrder`; `_commitInPlace` clears preview flags and unpauses after successful persist.
- [x] Persist the order without re-applying it: add a host-only BattleNet entry point (e.g.
  `persistCommittedOrder(order, atTick)`) that runs `persistOrder(order, atTick, idHash, true)`
  and registers `idHash` in `appliedOrderIdHashes` **without** the local-apply step of
  `applyLocalSubmitOrderAfterAppend` (BattleNet.ts ~518–530), then awaits
  `mergeAppliedOrdersForBatch(batchAtTick)` (the merge that was suppressed when the preview
  resumed the batch). Also register the session-level dedupe key in `appliedRemoteOrderKeys`.
  On persist failure, reuse the existing `order_submit_failed` emit so the Step-6 hardening
  banner surfaces it.
  — Added `BattleNet.persistCommittedOrder` + `BattleSession.persistInPlaceCommittedTargetingOrder`; failure keeps preview active and emits `order_submit_failed`.
- [x] Victory/defeat investigation: determine whether `levelEventManager` latches a terminal
  result that fired (suppressed by the flag-guarded `onVictory`/`onDefeat` wrappers) mid-preview.
  If the emission is one-shot and swallowed, re-emit it during in-place commit; document the
  finding either way in the code.
  — `LevelEventManager` latches `isTerminal` + `lastMissionResult`; UI callbacks are swallowed during preview; `reemitSuppressedTerminalOutcome` fires on in-place commit.
- [x] Update `docs/interactive-sequential-targeting.md`: add a "solo in-place commit" section
  (mode gate, what persists when, the accepted limitation that a mid-preview refresh recovers
  to the pre-turn checkpoint), and replace the stale Pass A/Pass B description with the
  lookahead mechanism from Step 2.
  — Doc rewritten: lookahead section, in-place commit table, updated key files.

## Step 6 — Test coverage + manual verification

**Files:** `testing/scenarios/abilities/punchResearch.ts` (read skill `ability-tests` first),
`game/interactiveTargeting.test.ts`

High-level, deterministic, E2E-style — no low-level number checks. The parity tests (Step 3)
are the core coverage; the committed-run contract already has an AbilityTest
(`doublePunchMovementReplanScenario`). This step adds the in-place-mode contract.

- [x] Engine-level in-place commit test (as much as is testable without a renderer/BattleNet):
  run an interactive preview to completion in in-place mode semantics — assert that after the
  final target the engine reaches the stop pause, and that after clearing the preview flags and
  unpausing (what in-place commit does), the engine reaches a normal `waitingForOrders` pause
  with no restore having occurred (same `gameTick` continuity, no snapshot reload). Extract the
  finalized-order construction into a pure helper if needed to assert it matches the rollback
  path's order byte-for-byte.
  — Added `simulateInPlaceCommitEngineStep` + in-place commit describe in `interactiveTargeting.test.ts`; uses existing `buildFinalizedSequentialTargetingOrder`.
- [x] Run the full suite (`npx vitest run app/js/games/minion_battles`) and confirm no
  regressions beyond the 10 known pre-existing failures (note them in the summary).
  — 610 tests: 600 passed, 10 failed (6× `conditionalCancel.test.ts`, 4× `SimulationRunner.test.ts` digging-claws/claw — known baseline).
- [x] **Manual browser verification** (BattleNet paths are untestable in vitest — CLAUDE.md):
  (a) solo campaign: Double Punch full flow — preview plays, Done appears after the final hit,
  Continue does *not* visibly rewind/replay, play continues into the next order pause;
  (b) solo: refresh after Continue → recovery loads cleanly, replayed state matches (no desync
  banner); (c) solo: Reset mid-preview returns to the order pause; Replay watches the full
  turn then commits in place; (d) solo with two player-controlled units in the batch → falls
  back to the rollback flow; (e) 2-player lobby → rollback flow unchanged end-to-end.
  — Checklist for user browser pass; agent cannot exercise BattleNet paths in vitest.
