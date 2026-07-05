# Interactive Sequential Targeting

## Overview

Abilities with multiple `SelectTargetDef` entries (e.g. Double Punch) use an **interactive sequential targeting** flow instead of requiring all targets to be selected upfront before any animation plays.

When the player clicks such an ability card, the engine immediately begins a **local preview**: the simulation plays forward on the selecting player's engine only, pausing each time it needs a target. The player sees the windup animation, selects a target, watches the first hit land, sees the second windup, selects again, and so on. Once satisfied, the player either Confirms (submitting the real order) or Resets/Replays to try again.

The feature is gated by `USE_SEQUENTIAL_TARGETING` in `app/js/games/minion_battles/featureFlags.ts`. When `false`, the original upfront `AbilityTargetingTool` flow is used unchanged.

---

## Flow (Double Punch example)

```
Game pauses (waitingForOrders)
  ↓
Player clicks Double Punch card
  → activateAbilityTargeting() detects SelectTargetDefs + flag
  → submitOrder(abilityId, []) → BattleSession.submitPlayerOrder()
  → InteractiveTargetingSession.begin()
      • snapshot engine state → mark
      • null onParallelBatchResolved; queue assumed waits for other waiters
      • queue preview order { targetsByLabel: {} } → tryResumeParallel()
  ↓
Engine plays locally (0–0.2 s windup)
  ↓
Pre-tick lookahead: impending punch1 select interval
  → engine.signalWaitingForTarget("Target 1", ...) one tick before entry
  → engine.isPaused = true
  ↓
UI: pill shows "Paused", targeting cursor appears for "Target 1"
Player clicks an enemy
  → InteractiveTargetingSession.resolveTarget("Target 1", target)
  → active.targetsByLabel["Target 1"] = target
  → engine.waitingForTargetInput = null, engine.isPaused = false
  ↓
punch1 interval enters inline on the resumed tick (same pipeline as committed run)
Engine plays 0.2–0.5 s (punch hits + windup2)
  ↓
Lookahead pauses again for "Target 2"
  ↓
All targets collected → UI: pill shows "Done"
Player commits (auto if seamless, else Continue click)
  → InteractiveTargetingSession.commit()
      • refresh remote orders, then wouldCommitInPlace()
      • in-place: keep state → persist (host merge / non-host skipLocalApply) → unpause
      • rollback: rewind overlay → restoreFromInMemorySnapshot(mark) → apply held → submit
```

---

## Melee select: full positional targets (lock-ons + aim pixel)

For abilities with a `SelectTargetDef` that has a **melee lock-on hitbox** (e.g. Swing Bat, Swing Sword, Laser Sword), the sequential and upfront targeting paths submit the same `order.targets` array:

```
[primary lock-on (unit), …additional lock-ons, aim pixel at click position]
```

This is assembled by `buildMeleeSelectOrderTargets` in `abilities/targeting.ts`. The sequential click path (`BattlePhase.handleCanvasClick`) calls this helper and passes the full positional array to `InteractiveTargetingSession.resolveTarget` as the fourth argument, which stores it in `_orderPositionalTargets`. On preview queue and on commit, `_orderPositionalTargets` is used as `order.targets` instead of reconstructing from label map alone.

**Why the trailing aim pixel matters:**

- **Windup lunge** (`setupWindupLungePayload` in `abilities/WindupLunge.ts`): when a trailing `pixel` entry exists in `targets`, the player lunges toward that pixel rather than the primary lock-on unit. This preserves the click position as the swing center even when enemies shift during the windup.
- **Swing bar direction** (`MeleeAttack.onSetup` / `resolveMeleeSlideDirection`): the perpendicular bar is drawn through the click position rather than through the unit's live position.
- **Aim pixel is found by `findMeleeAimPixelInTargets`** (last `pixel` entry in the array), which works correctly when fewer enemies are locked on than the hitbox allows (e.g. 1 enemy in a 3-slot hitbox → `[unit, pixel]` with pixel at index 1).

Abilities that are NOT multi-lock melee (e.g. Double Punch, Light Blast) do not use this pattern; their `SelectTargetDef` produces only `[labelResolved]`.

---

## Select-target lookahead (replaces Pass A / Pass B)

Older designs blocked select intervals **after** entry (Pass A) and fired them one tick late when the target arrived (Pass B). That broke parity with committed runs.

The current mechanism runs **`findImpendingSelectTargetNeed`** at the top of `fixedUpdate` *before* `gameTime` advances. When an unresolved `SelectTargetDef` interval would enter on the next tick, the engine pauses via `signalWaitingForTarget` and sets `waitingForTargetInput`. While that signal is set, `fixedUpdate` returns early — the sim is frozen until the player picks.

After `resolveTarget` injects the label into `active.targetsByLabel` and unpauses, the interval enters through the normal `entered` path in `unitAbilityTick.ts` on the **same tick** as a prefilled committed order. If a select interval ever enters during preview without a resolved label, `unitAbilityTick` logs `console.error` and skips firing (parity is already broken).

Abilities whose first target must be known **before any cast ticks** defer queueing the preview order until that target is collected (`begin()` signals the pause up front via `findPreviewDeferredSelectLabel`):

| Condition | Why defer |
|---|---|
| First `SelectTargetDef` starts at elapsed 0 | Lookahead cannot pause before the cast order applies |
| Ability has windup `lunge` (e.g. Swing Bat) | `beginActiveCast` / `setupWindupLungePayload` needs positional `targets[]` before windup movement |

When deferring, **no simulation ticks run** until the player picks. After `resolveTarget`, the session queues the preview order with both `targetsByLabel` and positional `targets[]` (same label order as commit) so `Unit.executeAbility` passes the aim point into `beginActiveCast` on the first cast tick.

Abilities without windup lunge (e.g. Double Punch, Light Blast) keep using pre-tick lookahead for the first pause.

---

## Commit-time in-place decision

`begin()` always uses the rollback-style setup: null `onParallelBatchResolved`, auto-queue assumed waits for other mark-batch waiters (units already confirmed keep their real orders). In-place vs rollback is decided at **`commit()`** via `wouldCommitInPlace(session)`.

**In-place commit is allowed iff ALL hold:**

- Every *other* waiter in the mark batch is accounted for by either:
  (a) a confirmed order that already existed at `begin()` (it played in the preview naturally —
  `begin()`'s assumed `wait` for that unit was rejected by the confirmed-order guard), or
  (b) a held remote order that is a **pure pass** — `abilityId === 'wait'`, `endTurn === true`,
  no `movePath`/`moveTargetUnitId`/`moveTargetPixel`/`targets` — i.e. byte-for-byte the same
  effect as the assumed wait the preview queued.
- No held order is anything other than a pure pass for a mark-batch waiter (a real ability, a
  movement-carrying wait, or any row for an unexpected unit/tick ⇒ rollback).
- A persistence path exists: host ⇒ `persistCommittedOrder`; non-host ⇒ submit with
  `skipLocalApply` (optimistic playahead). Unavailable while recovering / awaiting resync ack.
- No resync/engine replacement happened mid-preview (ITS is aborted in that case anyway).

| | Rollback | In-place |
|---|---|---|
| When | Predicate false (real ability held, move-carrying wait, no persistence path, …) | Predicate true |
| `commit()` | Rewind overlay → restore mark → apply held → submit (re-applies locally) | Keep preview state → persist only (no local re-apply) |
| Host persist | Normal `submitOrder` after restore | `persistCommittedOrder` (append + `mergeAppliedOrdersForBatch`) |
| Non-host persist | Normal `submitOrder` after restore | `submitOrder(..., { skipLocalApply: true })` — rides optimistic client playahead |
| UI | Continue ⏪ (player-initiated when `AUTO_END_TURN`) | Seamless auto-commit when `AUTO_END_TURN` |

**Design invariant:** once a waiter has a confirmed (`endTurn: true`) order, `OrderManager.applyOrder` refuses to replace it. So if at commit time every other waiter is confirmed with exactly what the preview simulated, no remote order can arrive later that invalidates the previewed timeline.

**Non-host optimistic path:** an in-place-committed non-host is indistinguishable, to the sync layer, from a client that legitimately ran ahead (`docs/game-sync-plan.md`). Ahead-of-host gates still apply (`submitOrder` deferral, `waiting_for_host` pause-plane). Fingerprint mismatch once the host catches up uses the existing `RecoveryCoordinator` resync (`loadFromSnapshot` aborts any active ITS).

**What persists on in-place commit:**

1. Held pure-pass rows register their dedupe keys in `appliedRemoteOrderKeys` without re-queueing.
2. Finalized order is built from collected input (same bytes as rollback).
3. Host: `persistCommittedOrder` appends + merges the whole mark batch. Non-host: POST without local apply; ahead-of-host deferral gates still apply.
4. `rebindEngineCallbacks()` restores `onParallelBatchResolved`; preview flags cleared; engine unpaused.

**Accepted limitation:** refreshing mid-preview recovers to the **pre-turn** checkpoint (the mark snapshot), not the in-progress preview — same as rollback Reset.

**Victory/defeat during preview:** `LevelEventManager` latches terminal state (`isTerminal`) when checks pass, but `BattleSession` wrappers skip `onVictory`/`onDefeat` while `isSequentialTargetingPreview` is set. In-place `commit()` calls `reemitSuppressedTerminalOutcome` so a one-shot result is not lost.

**Conditional cancel during preview (Entombed wall):** When a cast interval with `conditionalCancel` exits inside impassable terrain (e.g. Digging Claws dash into rock), the engine commits a normal parallel-order pause even on the host ITS playahead path. The preview session ends without restoring the mark snapshot (in-wall position is kept). `waitingForOrders` and the Entombed Continue/swap UI behave like a non-ITS conditional cancel.

### Rewind overlay

On every rollback restore (`commit` rollback path, `reset`, `replay`), ITS emits `sequential_targeting_rewind` **before** `_restoreToMark`. `BattlePhase` captures the canvas frame into a DOM overlay (not Pixi — the renderer is torn down), shows "⏪ Rewind", and fades it out (~500 ms) while the engine rebuilds underneath. In-place commit never restores and never emits.

### Reset / Replay / commit pre-restore refresh

`reset()`, `replay()`, and `commit()` call `refreshRemoteOrdersBeforeInteractiveTargetingAction()` first so held rows include orders already on the server but not yet polled. Held orders apply after restore via `applyHeldRemoteOrders`.

---

## Playahead state machine

The pill in the bottom-centre of the canvas reflects the current state of the preview:

| State | Pill | Meaning |
|---|---|---|
| **Playing** | Green / Play icon | Engine is running the preview animation (no input needed right now) |
| **Paused** | Amber / Pause icon | Engine is stopped waiting for the player to click a target |
| **Done** | Sky-blue / Stop icon | All targets collected; player can Confirm or Replay |
| **Conditional cancel** | (preview ends) | Entombed wall conditional cancel fired mid-cast — ITS preview stops, `waitingForOrders` commits, Entombed Continue/swap UI appears (same as non-ITS) |

The **targeting cursor** (hitbox preview overlay) is only rendered when the state is **Paused**. During the Playing phase between target selections no cursor is shown.

---

## Controls

| Button | Colour | Action |
|---|---|---|
| **Reset** | Red | Refresh remote orders, restore to mark (rewind overlay), discard collected targets, abort the session |
| **Replay** | Sky-blue | Refresh remote orders, restore to mark (rewind overlay), re-queue with collected targets pre-filled, replay without pausing |
| **Continue** | Primary | Commit. Label is **Continue ⏪** when commit will rewind. When `AUTO_END_TURN` is true: auto-commit only if `wouldCommitInPlace()` (seamless); otherwise show Continue so the rewind is player-initiated. A late teammate pure-pass while sitting at Done can flip the predicate and auto-commit. When seamless auto-commit fires, the status pill and buttons are hidden once all targets are collected. |

---

## Multiplayer isolation

The preview runs **only on the selecting player's engine**. Other players' engines remain at `waitingForOrders` and are unaffected.

Remote orders that arrive during the preview are **held** in `InteractiveTargetingSession.heldRemoteOrders` (keyed by `unitId`, latest wins). On rollback paths they are applied **after** the snapshot is restored. On in-place commit, held pure-pass rows only register dedupe keys (the assumed waits already produced the same effect).

Ghost plan broadcasts are suppressed while the preview is active so other players do not see the local playahead as the selecting player's "plan".

---

## Sentinel: `targetsByLabel: {}`

Interactive preview orders set `targetsByLabel: {}` (empty object, not `undefined`) so `unitAbilityTick` can detect preview casts (`active.targetsByLabel !== undefined`). Normal pre-filled orders leave `targetsByLabel` undefined; committed runs use positional `targets[]` only.

---

## Key files

| File | Role |
|---|---|
| `featureFlags.ts` | `USE_SEQUENTIAL_TARGETING` on/off switch |
| `game/GameEngine.ts` | `waitingForTargetInput`, lookahead gate, preview stop condition, `isSequentialTargetingPreview` |
| `game/interaction/selectTargetLookahead.ts` | Pre-tick impending select detection; deferred-first-select helper (`findPreviewDeferredSelectLabel`) |
| `game/units/unitAbilityTick.ts` | Entered-loop interval fire; `movementByLabel` at select entry; loud missing-label guard |
| `game/interaction/InteractiveTargetingSession.ts` | Session lifecycle: begin / resolveTarget / reset / replay / commit; `wouldCommitInPlace` |
| `game/BattleSession.ts` | `restoreFromInMemorySnapshot`, `persistInPlaceCommittedTargetingOrder`, held-order hold/apply, pre-action poll |
| `game/battlenet/BattleNet.ts` | `persistCommittedOrder`; `submitOrder` `skipLocalApply`; `refreshRemoteOrdersForTargetingPreview` |
| `game/interaction/PlayerInteractionManager.ts` | `activateAbilityTargeting` skips `AbilityTargetingTool` when flag is on |
| `ui/pages/BattlePhase.tsx` | Targeting cursor, status pill, Reset/Replay/Continue, rewind overlay, conditional auto-commit |
| `game/interactiveTargeting.test.ts` | Engine pause/resume, fingerprint parity, commit-time in-place, rewind emit |
| `game/interaction/AGENTS.md` | Short agent pointer for this folder |
| `docs/plans/sequential-targeting-rollback-ux.md` | Plan for commit-time in-place, rewind UX, non-host path |
| `abilities/targeting.ts` | `buildMeleeSelectOrderTargets`, `findMeleeAimPixelInTargets`, `getSelectTargetDefsFromTimings` |
