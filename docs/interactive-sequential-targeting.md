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
      • suppress onParallelBatchResolved (no-op during preview)
      • queue preview order { targetsByLabel: {} } → tryResumeParallel()
  ↓
Engine plays locally (0–0.2 s windup)
  ↓
punch1 interval enters → targetsByLabel has no "Target 1"
  → Pass A in unitAbilityTick blocks the interval
  → engine.signalWaitingForTarget("Target 1", ...)
  → engine.isPaused = true
  ↓
UI: pill shows "Paused", targeting cursor appears for "Target 1"
Player clicks an enemy
  → InteractiveTargetingSession.resolveTarget("Target 1", target)
  → active.targetsByLabel["Target 1"] = target
  → engine.waitingForTargetInput = null, engine.isPaused = false
  ↓
Pass B on next tick fires the deferred punch1 interval
Engine plays 0.2–0.5 s (punch hits + windup2)
  ↓
punch2 interval enters → same pause flow for "Target 2"
  ↓
All targets collected → UI: pill shows "Done"
Player clicks Confirm
  → InteractiveTargetingSession.commit()
      • restoreFromInMemorySnapshot(mark)   ← rewind engine
      • apply any held remote orders
      • submit real order via BattleNet (normal multiplayer flow)
```

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
| **Confirm** | Primary | Restore to snapshot, apply held remote orders, then submit the real order to BattleNet |

---

## Multiplayer isolation

The preview runs **only on the selecting player's engine**. Other players' engines remain at `waitingForOrders` and are unaffected.

Remote orders that arrive during the preview are **held** in `InteractiveTargetingSession.heldRemoteOrders` (keyed by `unitId`, latest wins). They are applied to the engine **after** the snapshot is restored — on Reset, Replay, or Commit — so the engine stays consistent with remote state once the preview ends.

Ghost plan broadcasts are suppressed while the preview is active so other players do not see the local playahead as the selecting player's "plan".

---

## Sentinel: `targetsByLabel: {}`

The `unitAbilityTick` blocking logic (Pass A) is only active when `active.targetsByLabel` is a defined object (`{}` or populated), **not** when it is `undefined`. Normal pre-filled orders leave `targetsByLabel` as `undefined`, so Pass A is a complete no-op for them and existing ability behaviour is unchanged. `InteractiveTargetingSession.begin()` deliberately queues the preview order with `targetsByLabel: {}` to opt into the blocking mechanism.

---

## Key files

| File | Role |
|---|---|
| `featureFlags.ts` | `USE_SEQUENTIAL_TARGETING` on/off switch |
| `game/GameEngine.ts` | `waitingForTargetInput` field + `signalWaitingForTarget()` |
| `game/types.ts` | `ActiveAbility.waitingForTargetIntervals` (ephemeral, not serialized) |
| `game/units/unitAbilityTick.ts` | Pass A (block), Pass B (resume), `fireIntervalEntry` helper |
| `game/interaction/InteractiveTargetingSession.ts` | Session lifecycle: begin / resolveTarget / reset / replay / commit |
| `game/BattleSession.ts` | `restoreFromInMemorySnapshot`, routing in `applyRemoteOrders` + `submitPlayerOrder` |
| `game/interaction/PlayerInteractionManager.ts` | `activateAbilityTargeting` skips `AbilityTargetingTool` when flag is on |
| `ui/pages/BattlePhase.tsx` | Targeting cursor gating, status pill, Reset/Replay/Confirm buttons |
| `game/interactiveTargeting.test.ts` | Unit tests: engine pause/resume, deferred interval fire, non-interactive bypass |
