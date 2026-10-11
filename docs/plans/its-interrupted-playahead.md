# Plan: Interrupted ITS playahead and the missing-pick pause

## Context

When an interactive targeting (ITS) preview cast is interrupted before all of its targets are picked, the preview currently **auto-rewinds** to the mark and shows a canvas "Interrupted" banner.

Lobby **3B8D37** shows the cost:
- At the tick-966 pause, a Thornbinder Bramble Spike (`0008`) was already in flight.
- It landed at tick 984, and its tier-1 impact knockback interrupted the caster's windup. This was verified by replaying the tick-966 snapshot.
- Rock Slide's next pick comes 0.4 s into the cast and Stone Tomb's 0.55 s in, both after the knockback. So every attempt rewound.
- The simulation is deterministic, so every retry was identical and the player could never commit.

An interrupted cast is a valid game state. The player may have nothing that avoids it (every dodge on cooldown), so ITS must be able to show that timeline and let the player commit it.

Committing such a timeline produces an order that is missing the picks the cast never reached. In multiplayer, the real timeline can differ from the preview, so a committed cast may reach a pick it does not have. This plan makes that a proper pause plane: the owner is asked for the pick then, and sends it with a new "update order targets" order.

**Today:**

- `isITSPreviewComplete` (`game/interaction/isITSPreviewComplete.ts`) is true as soon as the preview cast leaves `activeAbilities`. `GameEngine.fixedUpdate` (~L1593) then pauses the preview.
- `InteractiveTargetingSession.isPreviewCastInterrupted` (~L248) flags "complete but not every label collected". `useInteractiveTargetingProgress` (~L71) then calls `cancelInterruptedPreview` (an Undo) and adds `InterruptedTextEffect` to the HUD canvas.
- Every early end of a cast goes through `interruptUnitAbilities` or `fizzleUnitActiveAbility` (`game/units/unitAbilityLifecycle.ts`). Neither emits an EventBus event.
- **A committed run can freeze on a missing pick.** `findImpendingNeedForCast` (`game/interaction/selectTargetLookahead.ts`) pauses for **any** cast whose `targetsByLabel` is defined and missing the entering label, preview or not. It calls `signalWaitingForTarget`, after which `fixedUpdate` returns early every tick. Outside an active preview, nothing supplies the target. Committed ITS orders always carry `targetsByLabel` (`buildFinalizedSequentialTargetingOrder`).
- **`targetsByLabel` does not survive a snapshot.** It is not serialized on `ActiveAbility`. That affects every `toJSON()` → `fromJSON()` rebuild: server checkpoints, resync loads, and the ITS mark itself (`begin()` stores `structuredClone(engine.toJSON())`, and Undo, Replay and rewind commits restore it with `restoreFromInMemorySnapshot` → `GameEngine.fromJSON`). Positional `targets`, `processedElapsed` and `pendingSelectGate` are serialized (`game/units/unitToJSON.ts`).
- **A precedent for a mid-cast networked pause exists.** A conditional cancel (Combo / Entombed) sets `conditionalCancelPaused` on the cast and calls `engine.requestConditionalCancelPause(unit)` (`unitAbilityTick.ts` ~L434, `GameEngine.ts` ~L1828). That makes the caster a waiter in a normal order batch. The order is resolved by `resolveConditionalCancelIfNeeded` (`OrderManager.ts` ~L231–297).
- During a preview, parallel pauses are dropped (host) or frozen (non-host, when the local player is a waiter) in `commitDeferredOrderPauseAfterCompletedTick` (`GameEngine.ts` ~L1406). Conditional-cancel pauses always freeze. Drops and freezes are reported through `onItsParallelPauseDecision`. The BattleSession handler (~L486) marks the preview as depending on another player when a waiter belongs to someone else, which forces a rollback commit.
- An order for an ability the unit is already casting is a **recast**: `executeUnitAbility` ends the running cast and starts a new one (`unitAbilityLifecycle.ts` ~L237).
- Undo (Esc) already works while a preview plays (`ITSTimelineControls`, `ONLY_UNDO_AT_START = false`). Ability cards are locked during ITS (`BattleAbilityBar`: `isMyTurn = canUseOrderUi && (!isItsPreviewActive || isConditionalCancelPause)`). The `1`–`9` hotkeys only check `_canUseOrderUi` (`PlayerInteractionManager.onKeyDown`).
- Auto End (`getAutoEndTurn()`) auto-commits at Done only when every target was collected (`useInteractiveTargetingProgress` ~L99). This guard exists because of lobbies 12D040 and 10EA88.

### User decisions (binding)

1. An interrupted preview cast must **not** rewind. The preview plays forward past the interrupt and tells the player the cast was interrupted.
2. The preview pauses (Done) when the caster **can act again**, or at a normal ITS pause plane.
3. Until then, the caster cannot pick new abilities. The player can only **Undo** (button or Esc) or press **Done** to commit that timeline. With **Auto End** checked, Done is pressed automatically. New abilities become available after the commit.
4. The caster may be hit by several stuns in a row, so the interrupted playahead is capped at **100 frames** after the interrupt. Undo stays available during that time.
5. A new **reusable notice container** sits just above the "Your Turn" plaque. It is invisible unless there is something to show, with a **blue background, a red border and a starburst-like shape**.
6. **Missing-pick pause plane.** When a cast in the real timeline reaches a pick its order does not have, the game pauses, tells the owner ("this ability reached a point that needs a target it doesn't have"), and requires them to pick then. The pick travels as a new **"update order targets"** order. This ships in this plan, not as a follow-up.
7. **During another player's ITS playahead**, that pause is an **automatic pass-and-fizzle**, so the other player's preview keeps moving.
8. **Pass at the pick pause** fizzles the cast (refund per its interrupt policy). Players interfering with each other's casts this way is intended.

### Design decisions (agent, from the issue review)

- **Missing select labels (`missingSelectLabels`).** A committed order lists the select labels it does not contain. The list is copied onto the cast and **serialized**, alongside the select-gate fields. What happens when the cast reaches a gated select whose label is in the list:
  - **Real timeline, player-controlled caster:** the missing-pick pause forms.
  - **Inside a preview**, for any cast except the preview cast: the pause is dropped, so it becomes the automatic pass-and-fizzle.
  - **Caster not player-controlled:** no pause.
  - In every case where no pick arrives, the select **fizzles** the cast on entry through `fizzleUnitActiveAbility`, which applies the interrupt policy.
  - The lookahead (`signalWaitingForTarget`) never pauses for a missing label.
- **Saved data only (closes the snapshot hole).** Every "pause here" and "which target" decision for missing picks reads only serialized cast data:
  - `missingSelectLabels`
  - a new serialized `awaitingPickLabel`
  - positional `targets`

  It never reads `targetsByLabel`. An "update order targets" order writes its picks into the cast's **positional `targets`** (and `targetsByLabel`) and removes them from `missingSelectLabels`.
- **Illustration of the snapshot hole.** This is hypothetical: the abilities and the cause of the divergence are placeholders, and only the mechanism matters.
  1. Player A commits a preview that ended early after the first pick of a two-pick ability. The order holds pick 1 and no pick 2.
  2. A teammate B had an assumed wait, so the commit rewinds. In the real timeline, B's order changes events so A's cast is not interrupted.
  3. Mid-way through A's cast, the game pauses for B. B starts a preview, whose mark is `toJSON()` of that tick, then presses Undo. B's client rebuilds from the mark with `fromJSON()`, which drops `targetsByLabel` on A's cast.
  4. When A's cast reaches pick 2, a check based on `targetsByLabel` would pause the host and A but not B. B's simulation would then diverge and trigger a resync.

  Checks based on the serialized marker pause all three. The same applies to reconnects and resync loads.
- **"Update order targets" is an order in the existing batch pipeline.** It is a `BattleOrder` with `updateTargets: true`, not a separate endpoint, so it gets persistence, merging, de-duplication, replays and resync handling for free. `applyOrderLogic` handles it as "fill in picks on the running cast", **not** as a recast, and spends no cost or use.
- **The missing-pick pause copies the conditional-cancel rules.** It is not a natural completion, does not trigger the teamwork cancel, and merges into a same-tick batch like any other waiter.
- **During previews**, missing-pick waiters are **always dropped**, on host and non-host. The drop is the automatic pass-and-fizzle. Any such drop **always** marks the preview as depending on another player, even when the waiter is local, so the commit rewinds and the real timeline asks for the real pick.
- **Picking at the pause uses ITS in resume mode.** It starts from the pause, the way Combo follow-up previews start from a conditional-cancel pause:
  - The cursor appears for the missing pick immediately.
  - Later picks are collected while the rest of the cast plays ahead.
  - Done sends one "update order targets" order.
  - Undo returns to the pause, and Pass sends `wait` (fizzle).
  - If the resumed preview itself ends early, its update order carries the still-missing labels, and the same rules repeat.
- **One event:** the interrupt and fizzle pipelines emit `cast_ended_early` on the EventBus. The cause is **derived from unit state** at that moment (today: `unit.knockback.knockbackSource` while in knockback), so none of the ~30 interrupt call sites change. Stun and lift causes have no source yet, so the notice just reads "Interrupted".
- **Scope:** the ended-early playahead applies to **every** preview cast that ends early: an interrupt after all picks, a fizzle, or caster death. All of them play forward to the stop point, then Done. Notice titles: "Interrupted", "Fizzled", "Defeated".
- **Stop point = the normal order pause:** "can act again" is `orderMgr.shouldPauseForOrders(caster)`, the predicate that forms the caster's real order pause, so the preview stops where natural completion would. A non-host freeze on a local parallel pause (`engine.waitingForOrders` set during the preview) also counts as a stop.
- **Death with Auto End** auto-commits, as it already does today when every target was picked.
- **Notices outlive the session briefly:** each notice has a minimum visible time, so an instant Auto End commit does not make it flash.

---

## Agent Instructions

This plan is executed by `/jp-implement-plan`. Read `.claude/skills/jp-implement-plan/SKILL.md` and follow it; do not restate or improvise its workflow here.

- The **invoking agent is the sole orchestrator**. It spawns **one worker per step, synchronously** (never `run_in_background`), waits for each to finish, verifies the plan file, and reports plan completion to the user at the end.
- Each **worker implements exactly one step**. It checks off each `- [ ]` item with a one-line summary of what actually changed, then **stops without spawning the next agent**.
- **Read every file in an item's "Touches" line before editing.** Do not guess signatures (EventBus `on`, `EngineContext` members, `Unit.fromJSON` handling of `activeAbilities`, `getSelectTargetDefsFromTimings`, test fixtures).
- **Per-step verification:** `npm run lint`, then `npx tsc --noEmit` (every step crosses an interface boundary), then **only** the test files listed on that step. No full suite, no directory runs and no AbilityTest/SimulationRunner runs before Step 9. (If the user repeats the "verify by inspection only" override when invoking, it supersedes this line.)
- **Behaviour must stay the same unless an item says otherwise.** Natural completion, select pauses, the select gate, conditional-cancel pauses, commit in place vs rollback, Replay, held remote orders and terminal outcomes during preview must be unchanged. **Orders that have every pick behave exactly as today.**
- **Pause and ask** (return the question as your final output) if a step conflicts with existing ITS or sync behaviour, in particular the non-host freeze rule (lobby 39E984) in Step 3.
- **Bash note:** on this machine the Bash tool can lose its PATH, and heredocs containing apostrophes fail to parse. Prefer Read/Edit/Write, and PowerShell for `git`/`npm`/`npx`.
- **Relevant project skills:** `game-engine`, `game-sync-data-flow`, `working-on-minion-battles`, `ability-tests`, `scoped-testing`, `components-for-the-ui` and `editing-and-creating-components` (Step 6), `hud-effects` (Step 7), `writing-nested-agents-files` and `working-with-skills` (Step 8), `debugging-lobbies` (Step 9 checklist).
- **Folder docs:** `app/js/games/minion_battles/game/interaction/AGENTS.md`, `app/js/games/minion_battles/abilities/AGENTS.md`, `docs/interactive-sequential-targeting.md`, and "Build the engine, not the feature" in `app/js/games/minion_battles/AGENTS.md`.

All paths below are relative to `app/js/games/minion_battles/` unless they start with `app/`, `docs/` or `.claude/`.

---

## Key Architecture Facts

| Fact | Where |
|---|---|
| Interrupt pipeline (`interruptUnitAbilities`) and fizzle (`fizzleUnitActiveAbility`); both call `fireCastEndEarly` | `game/units/unitAbilityLifecycle.ts` (~L42, ~L152, ~L201) |
| Same-ability order = recast (ends the running cast) | `executeUnitAbility`, `unitAbilityLifecycle.ts` ~L237 |
| Knockback stores `knockbackSource` on the unit **before** calling the interrupt callback | `game/units/unitKnockback.ts` `applyKnockbackToUnit` |
| Preview stop check, run after units tick | `game/GameEngine.ts` `fixedUpdate` ~L1593 |
| Per-tick waiter scheduling **assigns a fresh `deferredOrderPause`** when it finds waiters (check that mid-cast requests made earlier in the tick are not overwritten) | `GameEngine.ts` ~L1596–1611 |
| Deferred pause commit; preview drop/freeze rules; `onItsParallelPauseDecision` | `GameEngine.ts` `commitDeferredOrderPauseAfterCompletedTick` ~L1406 |
| Mid-cast pause precedent | `requestConditionalCancelPause` (`GameEngine.ts` ~L1828, `EngineContext.ts` ~L123), triggered in `unitAbilityTick.ts` ~L434 |
| Mid-cast decision resolver precedent | `OrderManager.resolveConditionalCancelIfNeeded` / `applyConditionalCancelDecision` (~L231–297); `applyOrder` ~L111; `applyOrderLogic` ~L314 (`wait` with an active cast keeps the cast) |
| ITS pause-decision handler (sets "depends on another player") | `game/BattleSession.ts` ~L486 |
| Preview cast identity (ephemeral) | `GameEngine.sequentialTargetingPreviewCast` ~L225; set in ITS `begin()` (~L386) and `replay()` (~L754); cleared in `BattleSession.promotePreview` |
| Engine EventBus (one per engine; `fromJSON` builds a new engine) | `GameEngine.eventBus` ~L139; event map in `game/EventBus.ts` (`on(event, cb)`) |
| Order-pause predicate | `OrderManager.shouldPauseForOrders` (~L77); `Unit.canAct` (`game/units/Unit.ts` ~L501) |
| Select gate split / deferred entry; lookahead pause | `game/interaction/selectTargetLookahead.ts` (`findSelectGateSplit`, `selectGateDeferredIds`, `findImpendingNeedForCast`) |
| Select entry, fizzle on rejected pick | `game/units/unitAbilityTick.ts` `hasRejectedEnteringSelectPick` (~L238), gate split ~L305, entered loop ~L336 |
| Cast serialization | `game/units/unitToJSON.ts` ~L75 |
| Order and cast types | `game/types.ts` (`BattleOrder`, `ActiveAbility`) |
| Finalized order, begin / resolveTarget / commit / reset / replay | `game/interaction/InteractiveTargetingSession.ts` |
| ITS lobby log lines | `game/interaction/itsLobbyLog.ts` |
| 50 ms ITS poll, auto-commit, current auto-rewind | `ui/pages/battlePhase/useInteractiveTargetingProgress.ts` |
| Pass / Space and hotkeys during ITS | `game/interaction/PlayerInteractionManager.ts` (`handleWait` ~L481, `onKeyDown` ~L227) |
| Canvas "Interrupted" banner (to be removed) | `game/effect_defs/hudEffects.ts` ~L61, `game/GameRenderer/renderers/HudEffectLayer.ts` ~L298/~L314/~L503 |
| "Your Turn" plaque; absolute `bottom-full` children (host catch-up popover, order queue) | `ui/components/TurnIndicator.tsx`; rendered by `renderTurnIndicator` in `ui/pages/BattlePhase.tsx` ~L374 |
| Bottom band has a fixed height: an in-flow row above the plaque makes the hand scroll | comment in `TurnIndicator.tsx` ~L330, `ui/components/battleUiSlots/battleBottomBarLayout.ts` |
| Undo / Done / Auto End controls | `ui/components/ITSTimelineControls.tsx`, `ui/components/itsUndoHotkey.ts`, `game/autoEndTurnSetting.ts` |
| Headless pause resolution (auto `wait` for ordinary waiters) | `testing/runner/SimulationRunner.ts` `resolveParallelOrderPause`, `maybeAutoResolveParallelOrderPause` |
| Test fixtures: `mountLightBlastSessionFixture` (real `BattleSession`), `stepUntil` | `game/interactiveTargeting.test.ts` (lobby 0AD6EA describe ~L3788) |
| Preview vs canonical equivalence harness | `game/interaction/previewCanonEquivalence.test.ts` |
| No React testing library in the repo | UI logic that needs tests lives in plain TS modules |

---

## Checklist

### Step 1 — Engine: `cast_ended_early` event and the ended-early preview stop

- [ ] Emit `cast_ended_early` from the interrupt and fizzle pipelines.
  - Touches: `game/EventBus.ts`, `game/units/unitAbilityLifecycle.ts`.
  - Add `'cast_ended_early'` to `GameEventType` and the event map: `CastEndedEarlyEvent { unitId; abilityId; castStartTime: number; reason: 'interrupted' | 'fizzled'; outcome: 'cancelled' | 'skippedToCooldown' | 'ended'; source?: KnockbackSource; gameTick: number }`.
  - `interruptUnitAbilities`: emit once per cast that is removed or snapped. Outcomes: `'ended'` when a cooldown-phase cast is ended, `'skippedToCooldown'`, and `'cancelled'`. A cast kept under `duringCooldown: 'ignore'` emits nothing. `fizzleUnitActiveAbility` emits `reason: 'fizzled'` with the matching outcome.
  - Derive `source` from unit state in one small helper: `unit.knockback?.knockbackSource` while the unit is in knockback; otherwise omit it.
  - Doc comment: this is the single "cast ended early" hook for UI, logs and ITS.
- [ ] Record the early end on the preview cast, and add the stop rule.
  - Touches: `game/GameEngine.ts`, `game/gameConstants.ts`, `game/interaction/isITSPreviewComplete.ts`, `game/interaction/InteractiveTargetingSession.ts` (only the two places that set `sequentialTargetingPreviewCast`).
  - Add `ITS_ENDED_EARLY_PLAYAHEAD_MAX_TICKS = 100` to `gameConstants.ts`, with a doc comment ("frames of preview after an interrupt before ITS stops for Done").
  - Extend the `sequentialTargetingPreviewCast` type:
    - `beganAtGameTime: number`, set in `begin()` and `replay()` to `engine.gameTime`
    - `resumeCastStartTime?: number`, set by resume mode in Step 5
    - `endedEarly?: { atTick: number; reason: 'interrupted' | 'fizzled'; source?: KnockbackSource }`
  - Add `isPreviewCastInstance(previewCast, unitId, abilityId, castStartTime)`: unit and ability match, and either `castStartTime === resumeCastStartTime` (when set) or `castStartTime >= beganAtGameTime`. This ignores a Combo follow-up's same-id recast of the **previous** cast.
  - In the `GameEngine` constructor, subscribe to `cast_ended_early`. Record `endedEarly` once (first event only) while a preview is running and `isPreviewCastInstance` holds.
  - In `isITSPreviewComplete.ts`, add `getEndedEarlyPreviewStop(engine): 'caster_died' | 'caster_ready' | 'parallel_pause' | 'cap' | null`. It applies only when `endedEarly` is set:
    - caster dead → `'caster_died'`
    - `engine.waitingForOrders != null` → `'parallel_pause'`
    - `orderMgr.shouldPauseForOrders(caster)` → `'caster_ready'`
    - `gameTick - endedEarly.atTick >= ITS_ENDED_EARLY_PLAYAHEAD_MAX_TICKS` → `'cap'`
    - otherwise `null`
  - `isITSPreviewComplete`: keep the `waitingForTargetInput` and dead-caster checks first. Then, when `endedEarly` is set, return `getEndedEarlyPreviewStop(engine) != null` **instead of** the "cast left active" rule. Otherwise keep the current logic.
- [ ] Tests.
  - `game/units/unitAbilityLifecycle.interrupt.test.ts`: the event fires with the right `reason` and `outcome` for cancel, skip-to-cooldown and cooldown end, and does not fire for `ignore`. The fizzle emits `'fizzled'`. A tier knockback interrupt carries `source` = the knockback source.
  - `game/interaction/isITSPreviewComplete.test.ts`, with an ended-early preview cast:
    - not complete while the caster is in knockback
    - `'caster_ready'` once the caster can act
    - `'cap'` at 100 ticks while still stunned
    - complete on death and on a frozen parallel pause
    - `isPreviewCastInstance` rejects an older same-id cast and accepts the resume cast by start time
  - Run `npm run lint`, `npx tsc --noEmit`, and those two test files.

### Step 2 — Engine: missing select labels (serialized marker; a missing pick fizzles on entry)

- [ ] Carry `missingSelectLabels` from the order onto the cast, and serialize it.
  - Touches: `game/types.ts`, `game/managers/OrderManager.ts`, `game/units/unitToJSON.ts`, and the restore path for `activeAbilities` (find it from `Unit.fromJSON`).
  - `BattleOrder.missingSelectLabels?: string[]`. Doc: select labels this order does not contain, because the previewed cast ended before they were picked. Reaching one in the real timeline pauses the owner for the pick (Step 3); if no pick arrives, the cast fizzles.
  - `ActiveAbility.missingSelectLabels?: string[]` and `ActiveAbility.awaitingPickLabel?: string` (set in Step 3). Both are **serialized** like `pendingSelectGate`, only when non-empty or defined.
  - `applyOrderLogic` copies `missingSelectLabels` onto the new cast next to the `targetsByLabel` copy.
- [ ] The lookahead never pauses for a missing label, and a missing pick fizzles on entry.
  - Touches: `game/interaction/selectTargetLookahead.ts`, `game/units/unitAbilityTick.ts`.
  - `findImpendingNeedForCast`: skip intervals whose label is in `active.missingSelectLabels`.
  - `hasRejectedEnteringSelectPick`: an entering interactive select whose label is still in `active.missingSelectLabels` returns `true`, so it takes the existing fizzle path. Check this **before** the `validatePick`-only filter, so it also applies to selects without `validatePick`. A missing select at `start = 0` (never gated) is handled the same way. Update the doc comment.
  - These checks read only `missingSelectLabels`, never `targetsByLabel`. Say so in a comment.
- [ ] Tests.
  - `game/interaction/selectTargetLookahead.gate.test.ts`: a cast with a missing gated select does not pause, preview flag set or not.
  - New `game/units/missingSelect.test.ts`, using Light Blast (as in the ITS tests) or Stone Tomb in a tiny battle and a committed order with `missingSelectLabels`:
    - the cast fizzles on the select's entry tick, the cost or use is refunded per the interrupt policy, and `waitingForTargetInput` stays null
    - the caster becomes a normal order waiter afterwards
    - a `toJSON` → `fromJSON` round trip mid-cast keeps the field, and the rebuilt engine fizzles on the same tick as the original
  - Run lint, `tsc`, and those two files.

### Step 3 — Engine: missing-pick pause plane and the "update order targets" order

- [ ] Form the missing-pick pause in the real timeline.
  - Touches: `game/units/unitAbilityTick.ts`, `game/GameEngine.ts`, `game/EngineContext.ts`.
  - When a cast's tick is cut at a select gate (`findSelectGateSplit`) for a select whose label is in `active.missingSelectLabels`, and the caster is alive and player-controlled: set `active.awaitingPickLabel = label` and call a new `engine.requestMissingPickPause(unit)`.
    - Share the body with `requestConditionalCancelPause` through a private helper.
    - The pause commits at the end of the gate tick. Its `atTick` is the tick on which the select enters, so an order at the pause applies before the select enters (orders apply at the top of the tick).
  - Not player-controlled → no pause; the select fizzles on entry (Step 2).
  - **Verify** how a mid-cast request survives the per-tick waiter scheduling in `fixedUpdate` (~L1596–1611 assigns a fresh `deferredOrderPause` when it finds other waiters). Make the scheduling **merge** waiters into an existing deferred pause instead of replacing it, and note in the summary whether conditional cancel had the same exposure.
  - Rules copied from conditional cancel: not a natural completion (no teamwork cancel), and merged into a same-tick batch like any other waiter.
- [ ] Previews drop missing-pick waiters (automatic pass-and-fizzle).
  - Touches: `game/GameEngine.ts`.
  - In `commitDeferredOrderPauseAfterCompletedTick`, while a preview is running, remove waiters whose cast has `awaitingPickLabel` from the batch, **on host and non-host**. Clear `awaitingPickLabel` on those casts so the select enters with the label still missing and fizzles on the next tick. Report them through `onItsParallelPauseDecision('drop', …)` with a new optional fourth argument `{ missingPick: true }`.
  - The remaining waiters follow the existing drop/freeze rules unchanged.
  - The preview cast never has `missingSelectLabels` when this runs: new previews start without it, and resume mode clears it (Step 5). Its own picks stay local ITS pauses.
  - If keeping the non-host freeze rule (lobby 39E984) appears to require freezing here instead, **pause and ask**.
- [ ] Add the "update order targets" order.
  - Touches: `game/types.ts`, `game/managers/OrderManager.ts`.
  - `BattleOrder.updateTargets?: true`. Doc: fills in picks on the unit's running cast of `abilityId` that is waiting at a missing-pick pause. It carries `targetsByLabel` (the new picks), `targets` (positional), optional `missingSelectLabels` (labels still missing after it), and `endTurn: true`.
  - Add a missing-pick decision resolver next to the conditional-cancel one, used in `applyOrder` (batch acceptance) and `applyOrderLogic`. At a waiter whose cast has `awaitingPickLabel`:
    - accept only an `updateTargets` order for that cast's ability, or `wait`; reject anything else (a different ability, or a plain recast of the same ability)
    - **`updateTargets`:** for each label in `targetsByLabel`, write the pick into `active.targets` at that label's position in `getSelectTargetDefsFromTimings` order, and into `active.targetsByLabel`. For a single-select ability with a non-empty `targets` array, replace `active.targets` with it (the melee lock-on rule in `buildFinalizedSequentialTargetingOrder`). Set `active.missingSelectLabels` to the order's list (minus anything picked). Clear `awaitingPickLabel`. **No recast, no cost, no use.** Fingerprint with a distinct key (`mixOrderFingerprint(unitId, 'updateTargets:' + abilityId)`).
    - **`wait` (Pass):** clear `awaitingPickLabel` and keep the cast (the existing `wait`-with-active-cast path). The select enters with the label still missing and fizzles.
- [ ] Tests.
  - New `game/units/missingPickPause.test.ts`, with a tiny battle and a committed order with `missingSelectLabels`:
    1. At the gate tick the battle forms an order pause with the caster as waiter and `awaitingPickLabel` set; `waitingForTargetInput` stays null.
    2. An `updateTargets` order at the pause makes the select enter with the pick on the next tick, and the cast uses it (for example the projectile's direction). No extra use or cost is spent.
    3. A `wait` order fizzles the cast with the policy refund, and a normal pause follows later.
    4. A non-player-controlled caster fizzles without pausing.
    5. Any other ability order at the pause is rejected.
    6. Snapshot parity (the illustration in Context, using the real `toJSON`/`fromJSON`):
       - Rebuild an engine from a mid-cast snapshot taken before the pause. Step it alongside the original; both form the pause on the same tick with the same label.
       - Apply the same `updateTargets` order to both, then rebuild again after the select enters but before the pick is used.
       - Both end with identical runtime fingerprints and the same outcome.
    7. During a preview (host), a teammate's missing-pick waiter is dropped, its cast fizzles on the next tick, and the drop hook receives `{ missingPick: true }`.
    8. A same-tick natural-completion waiter and a missing-pick waiter end up in one batch.
  - Run lint, `tsc`, and that file (plus `selectTargetLookahead.gate.test.ts` if touched).

### Step 4 — ITS session: keep playing, commit the ended-early timeline

- [ ] Replace the auto-rewind API with an ended-early query, and commit missing labels.
  - Touches: `game/interaction/InteractiveTargetingSession.ts`.
  - Remove `isPreviewCastInterrupted` and `cancelInterruptedPreview`.
  - Add `getPreviewCastEndedEarly(engine): { reason: 'interrupted' | 'fizzled' | 'caster_died'; atTick: number | null; source?: KnockbackSource } | null`. It reads `engine.sequentialTargetingPreviewCast.endedEarly`, or a dead caster; it is null when ITS is inactive or the preview order is not queued.
  - `buildFinalizedSequentialTargetingOrder`: add `opts.missingSelectLabels` and set it on the order only when non-empty.
  - `commit()`: when the preview ended early, pass the labels not in `collectedTargets`. Nothing else in commit changes: in place vs rollback, persistence and held rows stay as they are.
  - Update the class and method doc comments that mention the lobby 0AD6EA auto-undo.
- [ ] A dropped missing-pick waiter always forces a rollback commit.
  - Touches: `game/BattleSession.ts` (handler ~L486).
  - When the decision carries `{ missingPick: true }`, call `interactiveTargeting.noteMultiplayerUncertaintyDuringPreview()` even if every waiter is local. Log it as "ITS: auto pass-and-fizzle at a missing-pick pause".
- [ ] ITS lobby log lines.
  - Touches: `game/interaction/itsLobbyLog.ts`.
  - Replace the `auto_cast_interrupted` source and `cast_interrupted` cancel reason with two new lines:
    - `logItsPreviewEndedEarly` — "ITS: preview cast ended early — playing forward", with reason, source and atTick
    - `logItsEndedEarlyStop` — "ITS: ended-early playahead stopped", with the `getEndedEarlyPreviewStop` value
  - Add an `endedEarly` field to `logItsAutoCommitEval`.
- [ ] Tests.
  - `game/interactiveTargeting.test.ts`: rewrite the lobby 0AD6EA describe to the new behaviour, using `mountLightBlastSessionFixture` and a real tier knockback, not the bare `interruptUnitAndRefundAbilities` call:
    - interrupt during windup → no restore, preview not complete while knocked back
    - Done once the caster can act
    - an in-place `commit()` persists an order whose `missingSelectLabels` holds the missing label, unpauses, and the next order pause forms for the caster
    - a long stun stops at the 100-tick cap
    - `reset()` during the ended-early playahead restores the mark
    - caster death → complete
    - the existing "not reported when targets complete" and "not reported while paused on select" cases, ported to `getPreviewCastEndedEarly`
  - `game/interaction/previewCanonEquivalence.test.ts`: add an interrupted case. Compare the in-place committed engine with a canonical replay of the finalized order (with missing labels) from the mark, at the caster's next order pause: same `gameTick`, `waitingForOrders.atTick`, caster position and hp, and runtime fingerprint. **If this shows a one-tick pause offset, stop and report it.** Do not patch around it.
  - `game/interaction/itsLobbyLog.test.ts`, if the log signatures it covers changed.
  - Run lint, `tsc`, and those files.

### Step 5 — ITS resume mode: picking at a missing-pick pause

- [ ] `InteractiveTargetingSession.beginResume(unitId, session)`.
  - Touches: `game/interaction/InteractiveTargetingSession.ts`.
  - **Preconditions:** `engine.waitingForOrders` includes the unit, the batch tick is submittable, the local player is expected to act, and the unit's cast has `awaitingPickLabel`.
  - **Setup**, the same as `begin()`:
    - take the mark snapshot and enter the preview timeline
    - set `isSequentialTargetingPreview`
    - queue assumed waits for the other waiters
  - Set `sequentialTargetingPreviewCast = { unitId, abilityId, beganAtGameTime, resumeCastStartTime: active.startTime }`.
  - `_selectLabels` = the cast's `missingSelectLabels`, in timing order.
  - Signal the pause for `awaitingPickLabel` up front, as the deferred first select does today. No ticks run before the pick.
  - On the first `resolveTarget`, queue a **preview** `updateTargets` order for the batch tick: `{ targetsByLabel: { label: pick }, targets, missingSelectLabels: [] }`. With the list empty and `targetsByLabel` defined, later labels pause through the normal local lookahead. Later picks use the existing `resolveTarget` path on the live cast.
  - `commit()` in resume mode builds one `updateTargets` order with every pick collected in this session, plus `missingSelectLabels` = labels still uncollected if this resumed preview ended early. In place vs rollback is decided as today.
  - `reset()` returns to the pause. `replay()` re-queues the preview update order with the collected picks.
- [ ] Tests.
  - `game/interactiveTargeting.test.ts`, new "missing-pick resume" describe:
    - resume at a pause shows the cursor immediately, without ticking
    - picking and committing in place persists an `updateTargets` order, and the cast completes with the pick
    - a two-missing-pick cast collects the second pick through the local lookahead and commits both in one order
    - an ended-early resumed preview commits the still-missing label
    - `reset()` lands back at the pause with `awaitingPickLabel` intact
  - `game/interaction/previewCanonEquivalence.test.ts`: a resume commit in place matches a canonical replay of the committed `updateTargets` order from the mark.
  - Run lint, `tsc`, and those two files.

### Step 6 — Reusable battle notice container (UI)

- [ ] Notice store, presets and shape helper (plain TS, testable).
  - Touches: new `ui/components/battleNotices.ts`.
  - `createBattleNoticeStore({ now?, setTimer? })`, with `show(notice)`, `release(id)`, `subscribe`, `getNotices()`.
  - `BattleNotice { id; title; detail?; minVisibleMs }`. `show` replaces a notice with the same id. `release` removes it once `minVisibleMs` since it was shown has elapsed (it schedules the removal if not).
  - `BATTLE_NOTICE_PRESETS`, with default `minVisibleMs` ~1500:
    - `cast_interrupted` ("Interrupted")
    - `cast_fizzled` ("Fizzled")
    - `caster_defeated` ("Defeated")
    - `pick_required` ("Target needed", detail "{Ability} reached a point that needs a target it doesn't have")
  - Presets are data, so later uses add an entry.
  - `starburstClipPath(spikes, innerRatio)` returns a CSS `polygon(...)` string with points alternating between the outer edge and `innerRatio` (default ~12 spikes, ~0.85).
- [ ] `BattleNoticeSlot` component, placed above the plaque.
  - Touches: new `ui/components/BattleNoticeSlot.tsx`, `ui/components/TurnIndicator.tsx`, `ui/pages/BattlePhase.tsx`.
  - Renders `null` when there are no notices. Otherwise it renders a centred stack of starburst badges:
    - an outer red layer and an inner blue layer inset by the border width, both clipped with `starburstClipPath` (the same two-layer technique as the plaque endcaps)
    - bold white uppercase title, optional detail line
    - `pointer-events-none`, `role="status"`, `aria-live="polite"`, and a short scale/fade-in
  - `TurnIndicator`: add a `noticeSlot?: React.ReactNode` prop. Render it in **one** absolute `bottom-full` centred column together with the existing host catch-up popover, so the two stack instead of overlapping. The popover stays clickable. Do not add an in-flow row: the bottom band has a fixed height.
  - `BattlePhase`: create one store per mount (`useRef`), subscribe for re-render, and pass `<BattleNoticeSlot … />` through `renderTurnIndicator`. Expose the store for Step 7.
- [ ] Tests.
  - New `ui/components/battleNotices.test.ts`, with fake timers:
    - show and release honour `minVisibleMs`
    - showing the same id replaces the notice
    - an empty store reports no notices
    - `starburstClipPath` returns `2 × spikes` points inside 0–100%
  - Run lint, `tsc`, and that file.

### Step 7 — Wire the UI: ended-early playahead and the missing-pick pause

- [ ] Play forward, notify, and auto-commit an ended-early preview.
  - Touches: `ui/pages/battlePhase/useInteractiveTargetingProgress.ts`, `ui/pages/BattlePhase.tsx`, `game/interaction/isITSPreviewComplete.ts`.
  - Add a pure `shouldAutoCommitItsPreview({ previewComplete, allTargetsCollected, endedEarly })` to `isITSPreviewComplete.ts`. It is true when complete and (all targets collected **or** ended early). The 12D040 / 10EA88 guard is otherwise unchanged.
  - In the hook:
    - Remove the auto-rewind branch and the `InterruptedTextEffect` use (drop `hudEffectCanvasRef` from the hook if it becomes unused).
    - On the first poll where `getPreviewCastEndedEarly` is non-null for this ITS run, `show` the matching preset, with the source ability's name as `detail` when known. Log `logItsPreviewEndedEarly`.
    - When the state turns `done` with ended-early set, log `logItsEndedEarlyStop` once.
    - Auto-commit through `shouldAutoCommitItsPreview`.
    - `release` the notice when ITS becomes inactive (commit or Undo).
  - Confirm, without changing code, that cards stay locked through the ended-early playahead and Done (`BattleAbilityBar` `isMyTurn`), and that Esc Undo stays enabled while playing. Note the result in the item summary.
- [ ] The missing-pick pause in the UI.
  - Touches: `ui/pages/battlePhase/useInteractiveTargetingProgress.ts`, `ui/pages/battlePhase/BattleAbilityBar.tsx`, `game/interaction/PlayerInteractionManager.ts`, and a small pure helper (for example `isAtMissingPickDecision(engine, unitId)` next to `isAtConditionalCancelDecision` in `isITSPreviewComplete.ts`).
  - When the local active waiter's cast has `awaitingPickLabel` and no ITS is active:
    - call `beginResume` (this also re-arms after Undo)
    - `show` the `pick_required` notice with the ability's name
    - `release` the notice when the pause resolves
  - Cards and the `1`–`9` hotkeys are locked at a missing-pick decision. Extend `isMyTurn` in `BattleAbilityBar`, and guard `activateAbilityTargeting` / `onKeyDown`. `OrderManager` already rejects other orders (Step 3).
  - **Pass / Space** at a missing-pick decision: end any resume preview (`reset`), then submit `wait` for the batch, which fizzles the cast. Handle it in `handleWait` next to the conditional-cancel branch. Pass is enabled and titled "Pass: skip the pick (the ability fizzles)".
  - Other players see the normal "<Ally>'s Turn" plaque.
- [ ] Remove the canvas "Interrupted" banner.
  - Touches: `game/effect_defs/hudEffects.ts`, `game/GameRenderer/renderers/HudEffectLayer.ts`.
  - Delete `InterruptedTextEffect`, `INTERRUPTED_TEXT_DURATION_SEC` and the two `HudEffectLayer` cases plus `createInterruptedText`, after confirming with Grep that nothing else uses them. Keep `RewindingText`.
- [ ] Tests.
  - `game/interaction/isITSPreviewComplete.test.ts`:
    - `shouldAutoCommitItsPreview` truth table (incomplete without an early end → false, ended early → true, not complete → false)
    - `isAtMissingPickDecision`
  - `game/interaction/PlayerInteractionManager.test.ts`: Pass at a missing-pick decision resets the resume preview and submits `wait`; ability hotkeys are ignored there.
  - Run lint, `tsc`, and those files.

### Step 8 — AbilityTest scenario and docs

- [ ] AbilityTest: a missing pick pauses the battle, and Pass fizzles the cast safely.
  - Touches: new `testing/scenarios/general/castEndedEarly.ts`, `testing/scenarios/registry.ts` (append to `ALL_ABILITY_TEST_SCENARIOS`, add a `GENERAL_GROUP_ORDER` entry for section `'Cast Ended Early'`), and the scenario list in `testing/runner/SimulationRunner.test.ts` if scenarios are listed there.
  - One scenario: the player casts Stone Tomb (reuse the setup from `earthCoreStoneTombScenario`, including rock) with no target and `missingSelectLabels: ['Tomb location']`, so nothing interrupts it.
    - The runner's ordinary pause resolution answers the missing-pick pause with `wait`, which is a Pass.
    - Latch, in a per-engine `WeakMap` from `assertPass`, that the battle paused for the player with `awaitingPickLabel` set.
    - Pass when, after that: the cast fizzled (no active `0530`), rock and the use are refunded per Stone Tomb's interrupt policy (confirm it), no tile became rock, `waitingForTargetInput` was never set, and the battle carried on to a later normal pause.
  - The ITS preview and resume paths stay covered in `game/interactiveTargeting.test.ts`, per the `ability-tests` skill.
- [ ] Docs.
  - Touches: `game/interaction/AGENTS.md`, `docs/interactive-sequential-targeting.md`, `abilities/AGENTS.md`, `.claude/skills/game-sync-data-flow/SKILL.md` and its `.cursor/skills/` mirror.
  - `interaction/AGENTS.md`: replace the "Interrupted preview cast" paragraph with:
    - the ended-early playahead: stop rule, 100-frame cap, Undo and Done, Auto End, missing labels on commit, notice
    - resume mode at a missing-pick pause
  - `docs/interactive-sequential-targeting.md`: add "Ended-early preview" and "Missing-pick pause and resume" sections. Add a Done row for the ended-early stop in the state machine. State the saved-data-only rule for missing picks.
  - `abilities/AGENTS.md`:
    - "Interrupts: one pipeline": `cast_ended_early` is emitted by the pipeline and the fizzle.
    - "Select gate and `validatePick`": missing select labels pause the owner in the real timeline, are auto pass-and-fizzle in other players' previews, fizzle on Pass, and are never paused for by the lookahead.
  - `game-sync-data-flow` skill: one line on the `updateTargets` order (an order in the normal batch that fills picks on a running cast at a missing-pick pause).
  - Run lint.

### Step 9 — Final verification (orchestrator)

- [ ] `npm run lint` and `npx tsc --noEmit`: zero errors.
- [ ] Targeted tests in one run: every test file listed in Steps 1–8.
- [ ] AbilityTests: `npx vitest run app/js/games/minion_battles/testing/runner/SimulationRunner.test.ts`, all passing, including the new scenario. Briefly stub the missing-pick pause request in `unitAbilityTick.ts` and confirm the new scenario fails, then restore it.
- [ ] Broad run: `npx vitest run --changed`, then `npm run test`. Fix failures, re-running only the affected files.
- [ ] Manual browser checklist (for the user):
  1. **Solo, Thornbinder mission:** pick Rock Slide's rock while a Thornbinder Bramble Spike is about to land on you.
     - The preview plays through the knockback, and the starburst "Interrupted" notice (blue fill, red border) appears just above Your Turn.
     - The preview stops once you can move again. Cards stay locked.
     - Done commits. With Auto End checked, it commits on its own and your next turn starts.
  2. **Stone Tomb, same setup:** no tile-pick prompt appears and the same flow runs. No rock is spent (refunded).
  3. **Undo:** press Esc during the knockback; it undoes to before the cast.
  4. **Chained stuns:** the preview stops about 1.7 s after the first interrupt.
  5. **Notice behaviour:** the notice is invisible otherwise, does not block canvas clicks, and stays readable for about 1.5 s even when Auto End commits instantly.
  6. **Multiplayer (non-host):** Done on an interrupted preview rewinds and replays the same outcome. No freeze and no desync (no fingerprint mismatch or resync in the lobby log). The notice stacks with the "Waiting for host" popover if both show.
  7. **Multiplayer, missing-pick pause** (best effort; needs the real timeline to stop the interrupt the preview showed):
     - Everyone pauses, and the owner sees "Target needed" with the cursor up.
     - Picking continues the cast on every client. Pass fizzles it with a refund.
     - The other player's own preview over that moment carries on, and their commit rewinds.
