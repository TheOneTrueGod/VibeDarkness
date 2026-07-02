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
      • choose rollback vs in-place mode (see below)
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
Player clicks Confirm
  → InteractiveTargetingSession.commit()
      • rollback: restoreFromInMemorySnapshot(mark) → submit via BattleNet (re-applies)
      • in-place (solo host): keep state → persist order only → clear preview flags → unpause
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

## Solo in-place commit

When the host is the **only player in the lobby** (`BattleSession.isSoloHost()`) **and** the parallel batch has exactly one waiter (the casting unit), `begin()` chooses **`inPlace`** mode instead of **`rollback`**.

| | Rollback (multiplayer / multi-waiter) | In-place (solo single-waiter) |
|---|---|---|
| Auto-wait for other batch units | Yes | No (sole waiter) |
| `onParallelBatchResolved` | Nulled during preview | Kept (flag-guarded) |
| `commit()` | Restore mark → submit order (re-applies locally) | Keep preview state → `persistCommittedOrder` only |
| Visible Continue | Rewinds and replays turn | No rewind — state at preview stop becomes real |

**What persists on in-place commit:**

1. `buildFinalizedSequentialTargetingOrder` builds positional `targets[]` + `movementByLabel` from collected input (same bytes as rollback).
2. `BattleNet.persistCommittedOrder` appends the row and runs `mergeAppliedOrdersForBatch` **without** `applyLocalSubmitOrderAfterAppend` — the engine already ran the turn.
3. Preview flags cleared; engine unpaused. The next `collectParallelWaiters` / checkpoint path runs with suppression lifted.
4. Session dedupe key registered in `appliedRemoteOrderKeys`.

**Accepted limitation:** refreshing mid-preview recovers to the **pre-turn** checkpoint (the mark snapshot), not the in-progress preview — same as rollback Reset.

**Victory/defeat during preview:** `LevelEventManager` latches terminal state (`isTerminal`) when checks pass, but `BattleSession` wrappers skip `onVictory`/`onDefeat` while `isSequentialTargetingPreview` is set. In-place `commit()` calls `reemitSuppressedTerminalOutcome` so a one-shot result is not lost.

---

## Playahead state machine

The pill in the bottom-centre of the canvas reflects the current state of the preview:

| State | Pill | Meaning |
|---|---|---|
| **Playing** | Green / Play icon | Engine is running the preview animation (no input needed right now) |
| **Paused** | Amber / Pause icon | Engine is stopped waiting for the player to click a target |
| **Done** | Sky-blue / Stop icon | All targets collected; player can Confirm or Replay |

The **targeting cursor** (hitbox preview overlay) is only rendered when the state is **Paused**. During the Playing phase between target selections no cursor is shown.

---

## Controls

| Button | Colour | Action |
|---|---|---|
| **Reset** | Red | Restore engine to the pre-preview snapshot; discard all collected targets; abort the session |
| **Replay** | Sky-blue | Restore to snapshot, re-queue the ability with all targets collected so far pre-filled, replay animation without pausing (for review) |
| **Continue** | Primary | Rollback: restore + submit. In-place: persist without rewind + clear preview flags. **Hidden when `AUTO_END_TURN` is true** — commit runs automatically when the pill reaches Done (all targets collected and final hit played). When `AUTO_END_TURN` is true, the status pill and Reset/Replay are also hidden once every required target has been collected (final hit plays with no overlay). |

---

## Multiplayer isolation

The preview runs **only on the selecting player's engine**. Other players' engines remain at `waitingForOrders` and are unaffected.

Remote orders that arrive during the preview are **held** in `InteractiveTargetingSession.heldRemoteOrders` (keyed by `unitId`, latest wins). They are applied to the engine **after** the snapshot is restored — on Reset, Replay, or Commit — so the engine stays consistent with remote state once the preview ends.

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
| `game/interaction/InteractiveTargetingSession.ts` | Session lifecycle: begin / resolveTarget / reset / replay / commit; mode gate |
| `game/BattleSession.ts` | `isSoloHost`, `restoreFromInMemorySnapshot`, `persistInPlaceCommittedTargetingOrder` |
| `game/battlenet/BattleNet.ts` | `persistCommittedOrder` (append + merge, no local re-apply) |
| `game/interaction/PlayerInteractionManager.ts` | `activateAbilityTargeting` skips `AbilityTargetingTool` when flag is on |
| `ui/pages/BattlePhase.tsx` | Targeting cursor gating, status pill, Reset/Replay/Confirm buttons |
| `game/interactiveTargeting.test.ts` | Engine pause/resume, fingerprint parity, preview stop condition |
| `abilities/targeting.ts` | `buildMeleeSelectOrderTargets`, `findMeleeAimPixelInTargets` — melee order-target builder and aim-pixel lookup |
