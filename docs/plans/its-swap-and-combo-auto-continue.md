# ITS ability swap and combo auto-continue

**Completed 2026-11-18:** all seven steps are done and nothing is committed. Clicking another card during an ITS preview now swaps to it with a quick 150 ms rewind, and a Combo pause auto-starts the same ability once per pause plane; the memory for that lives on `InteractiveTargetingSession`, because every rewind rebuilds `PlayerInteractionManager`. Pass during a follow-up preview rewinds and stops the combo. Results: lint clean; tsc shows only the known `defineDirectionalShield.ts` error; the Step 1-6 test files pass 71/71; `npm run test:sim` passes 191/191. `game/interactiveTargeting.test.ts` has 21 failures, and a clean HEAD checkout has the same 21 (stub `netAdapter` lacks `isReactionClaimUndecidedFor`). Follow-ups: the manual browser checklist; fixing that stub; maybe a setting to turn auto-continue off, or an aim-first variant.

## Context

Comboing feels clunky. At a Combo window you usually want the same ability again (Knife, Knife, Knife), but sometimes something else (Knife, Knife, Ice Shards). Today you must click the card every time, and switching mid-preview means Undo (Esc) and then a second click.

Two general systems fix this:

1. **Swap during a preview.** While an ITS (Interactive Targeting Session) preview is running and Undo is allowed, clicking another ability card (or pressing its number key) rewinds to the preview's mark and starts the new ability's preview. That is one action instead of Undo plus click. This applies to every ITS preview, not only combos.
2. **Combo auto-continue.** At a combo pause, the same ability's follow-up preview starts by itself. For Throw Knife the next windup plays and stops for aim. To switch, click another card (system 1). To stop the combo, press Pass, which rewinds and continues the current cast.

The rewind for a swap must be quick. The standard rewind overlay holds at least 1 s (`REWIND_OVERLAY_FADE_MS`), which is too slow for a swap that usually throws away only a few windup frames.

### Existing parts this builds on

- `InteractiveTargetingSession.reset()` already restores to the mark (the combo pause, for a follow-up preview), clears collected targets and ends the session.
- **Rewind, then a new order, already exists:** `PlayerInteractionManager.handleWait` at a missing-pick pause runs `interactiveTargeting.reset(...).then(() => this.submitOrder('wait', []))`. A swap is the same chain, calling `activateAbilityTargeting(newCard)` instead.
- **Combo follow-ups already start an ITS from the combo pause:** `sessionOrders.ts` (`conditional_cancel_follow_up`) commits the previous preview in place and begins the new one, so the new preview's mark is the combo pause.
- **Single sources that must stay single:** `getConditionalCancelDecisionCast` (Pass at a decision, lobby 810373) and `isItsUndoDisabled` (Undo button and hotkey). New predicates follow the same rule: one function, used by both the button and the handler.
- **Throws pause for aim after the windup:** their select is `pickAtEntry` (`card_defs/throwSharedTimings.ts`), so an auto-started Knife preview plays the windup, then pauses for aim.

### Decisions

- **The auto-continue setting is data, not code.** Add `followUpDefault?: 'same_ability'` to `ConditionalCancelDef`. `buildComboCancelDef` sets it; Entombed does not, so Entombed follow-ups are unchanged. The pause copies it onto the paused `ActiveAbility` as `conditionalCancelFollowUp`, the same way `conditionalCancelTagFilter` is copied today (`unitAbilityTick.ts:635`), and it is serialized with it.
- **Auto-continue fires at most once per pause plane** (`unitId` plus the pause `atTick`). Undo or a swap returns to that same plane, and the auto-continue must not restart the preview there. Otherwise Undo would loop.
- **Auto-continue is skipped** when the ability can't be cast now (`canUseAbilityNow`), when its card isn't in the hand, or while `shouldForceItsCommitAtComboWindow()` is true. In that last, multiplayer case it fires later, on the real combo pause after the forced commit.
- **No swap when Undo isn't allowed:** not when `isItsUndoDisabled` is true, not during a rewind crossfade, not in missing-pick resume mode, and not at an ended-early Done stop (those keep their current rules). Clicking the card already being previewed does nothing; the preview keeps running.
- **Swap rewinds use a new reason, `'swap'`**, on `SequentialTargetingRewindReason`, with a short fade (`REWIND_OVERLAY_QUICK_FADE_MS`, about 150 ms) and no "Rewinding" banner. The `refreshRemoteOrdersBeforeInteractiveTargetingAction` call in `reset` stays: multiplayer correctness needs it.
- **Pass during a follow-up preview** (any preview that began on a conditional-cancel pause, auto-started or clicked) means "rewind, then continue the current cast": `reset(..., 'swap')`, then the existing Pass-at-decision path. Today Pass is disabled there (`its_preview_active`).
- **Not in scope:** a user setting to turn auto-continue off, and an "aim first, then play" variant (at the combo pause, show Throw Knife's aim cursor without starting a preview, so switching needs no rewind). Record both as follow-ups if playtesting asks for them.

## Agent Instructions

This plan is run by `/jp-implement-plan`. The agent that invokes it is the only orchestrator. It spawns one worker per step synchronously (never in the background), waits for each worker to finish, and reports plan completion to the user. Each worker implements exactly one step, checks off its items with a one-line summary, and stops without spawning the next agent. Follow `.claude/skills/jp-implement-plan/SKILL.md`.

Relevant project material:
- `app/js/games/minion_battles/AGENTS.md`, especially "Build the engine, not the feature".
- `app/js/games/minion_battles/game/interaction/AGENTS.md` and `docs/interactive-sequential-targeting.md` (ITS lifecycle, commit, rewind overlay, controls).
- `game-object-def-pattern` skill (Step 1's def field mirrored onto the instance).
- `game-sync-data-flow` skill (why `reset` refreshes remote orders; do not bypass `BattleNet`).
- `scoped-testing` skill.

Rules:
- **Keep verification scoped.** Run `npm run lint:changed`, then only the test files named in the step. Run `npx tsc --noEmit` whenever a step changes an interface or type. Never run `npm run test:all`.
- **Known failures that predate this plan:**
  - tsc: `abilities/archetypes/defineDirectionalShield.ts(302,9)` (`allowMiss`).
  - `app/js/accountKnowledge.test.ts` (expects tier 1 or 2; Reactions and Combos are tier 3).
  - `game/BattleSession.submitOrder.test.ts`, 2 tests failing with `netAdapter?.isReactionClaimUndecidedFor is not a function`.
- **Don't touch unrelated uncommitted files.** Leave alone any you didn't create in this plan.
- `game/interactiveTargeting.test.ts` is over 4,000 lines. Put new ITS tests in a new file next to it and reuse its harness. If the harness must be shared, move it into a small helper module that both files import.
- Mind line endings: keep each file's existing CRLF or LF.

## AbilityTest coverage

None. The engine-side change (Step 1) is a data field that the existing combo scenarios (`weapons_throw_knife_combo_chain`, the Rapid Throw scenario) already exercise. Everything else is in the interaction layer, which the headless runner skips: it calls `orderMgr` directly. Cover swap, auto-continue and Pass with ITS session tests (Steps 3, 5 and 6), then run `npm run test:sim` once in the final step as a regression check.

## Steps

### Step 1: `followUpDefault` on conditional-cancel defs

Touches: `abilities/abilityTimings.ts`, `abilities/comboCancel/comboCancelDef.ts`, `game/types.ts`, `game/units/unitAbilityTick.ts`, `game/units/unitToJSON.ts`, `game/units/unitFromJSON.ts`, `game/managers/OrderManager.ts`, `game/comboCancel.test.ts` (all paths under `app/js/games/minion_battles/`).

- [x] Add `followUpDefault?: 'same_ability'` to `ConditionalCancelDef`, with a doc comment (the UI starts this follow-up automatically at the pause). Set it in `buildComboCancelDef`.
  Done: added `followUpDefault` to `ConditionalCancelDef` (abilityTimings.ts) and set it in `buildComboCancelDef`.
- [x] Add `conditionalCancelFollowUp?: 'same_ability'` to the active-ability type next to `conditionalCancelTagFilter` (`game/types.ts`). Set it where the tag filter is set at the pause (`unitAbilityTick.ts`), clear it where the filter is cleared (`OrderManager.ts`), and serialize it in `unitToJSON` / `unitFromJSON`.
  Done: new field on the active ability (types.ts), set at the pause in unitAbilityTick.ts, cleared on `wait` in OrderManager.ts (follow-up path cancels the cast, so it vanishes), serialized in unitToJSON/unitFromJSON.
- [x] Tests in `game/comboCancel.test.ts`: a Throw Knife combo pause has `conditionalCancelFollowUp === 'same_ability'` and keeps it through a unit JSON round trip. The field is cleared once the follow-up applies. An Entombed pause (any existing Entombed fixture) leaves it undefined. Run tsc.
  Done: 3 new tests in comboCancel.test.ts (knife pause + JSON round trip + follow-up clears; wait clears; Entombed def has no followUpDefault). tsc: only the known defineDirectionalShield error.

### Step 2: Quick `'swap'` rewind presentation

Touches: `game/BattleSession.ts` (`SequentialTargetingRewindReason`), `game/interaction/InteractiveTargetingSession.ts` (`reset`), `game/interaction/itsCommit.ts` (`itsRestoreToMark`), `game/interaction/itsLobbyLog.ts`, `game/effect_defs/hudEffects.ts`, `ui/pages/battlePhase/useRewindOverlay.ts`, `ui/pages/battlePhase/RewindOverlay.tsx`, `ui/pages/BattlePhase.tsx`.

- [x] Add `'swap'` to `SequentialTargetingRewindReason`. Give `reset()` an optional `rewindReason` argument that it passes to `_restoreToMark` (`itsRestoreToMark` already accepts `reason`). Add `'ui_swap'` to `ItsActionSource` and `'user_swap'` to `ItsCancelReason`.
  Done: `'swap'` added (BattleSession.ts); `reset()` takes 4th arg `rewindReason` passed as `{ reason }` to `_restoreToMark`; `'ui_swap'` / `'user_swap'` added in itsLobbyLog.ts, plus an `ItsEndDetail` `'user_swap'` and a button-click log message so swap cancels log as `user_swap` rather than `terminal_outcome`.
- [x] Choose the fade length in one place: `rewindFadeMsForReason(reason)` in `useRewindOverlay.ts`, returning `REWIND_OVERLAY_QUICK_FADE_MS` (about 150) for `'swap'` and `REWIND_OVERLAY_FADE_MS` otherwise. `RewindOverlay.tsx` takes the duration as a prop instead of importing the constant. Skip `RewindingTextEffect` for `'swap'` (update `REWIND_BANNER_LABELS` typing as needed).
  Done: new `ui/pages/battlePhase/rewindFade.ts` holds `REWIND_OVERLAY_FADE_MS`, `REWIND_OVERLAY_QUICK_FADE_MS` (150) and `rewindFadeMsForReason`; `useRewindOverlay.ts` re-exports them, stores `fadeMs` in the overlay state, uses it for the timer, and skips `RewindingTextEffect` for `'swap'`. `RewindOverlay.tsx` reads `overlay.fadeMs`; `BattlePhase.tsx` passes `rewindOverlay?.fadeMs` to ITSTimelineControls. `REWIND_BANNER_LABELS` and `RewindingTextEffect` are typed `Exclude<..., 'swap'>`.
- [x] Test: a small `useRewindOverlay` helper test (new `ui/pages/battlePhase/rewindFade.test.ts`) for `rewindFadeMsForReason`. Run tsc.
  Done: rewindFade.test.ts (2 tests) passes; tsc shows only the known defineDirectionalShield error; lint:changed clean for these files.

### Step 3: Swap during an ITS preview

Touches: `game/interaction/PlayerInteractionManager.ts`, a new `game/interaction/itsSwap.ts`, a new `game/interaction/itsSwap.test.ts`, a new `game/interactiveTargeting.swap.test.ts`, and `game/BattleSession.ts` if a rewind-pending getter is needed.

- [x] Add a pure predicate `getItsSwapBlockReason(input)` in `itsSwap.ts`. It returns `null` when a swap is allowed, otherwise a reason such as `'not_active' | 'same_ability' | 'undo_disabled' | 'rewind_pending' | 'resume_mode' | 'ended_early_done'`. Undo rules go through `isItsUndoDisabled`, not a copy. Write unit tests in `itsSwap.test.ts`.
  Done: new `game/interaction/itsSwap.ts` with `getItsSwapBlockReason` (reasons not_active, resume_mode, ended_early_done, same_ability, rewind_pending, undo_disabled; Undo rules via `isItsUndoDisabled`); 6 unit tests in `itsSwap.test.ts`.
- [x] Add `PlayerInteractionManager.swapItsPreviewAbility(cardIndex, ability)`. It checks the predicate, deactivates the tool, runs `reset(session, 'ui_swap', 'user_swap', 'swap')`, then calls `activateAbilityTargeting(cardIndex, ability)`, following the missing-pick Pass precedent. In `activateAbilityTargeting`, route to it while ITS is active, but only when the call is not the existing conditional-cancel follow-up path (that path is unchanged). Card number keys already go through `activateAbilityTargeting`.
  Done: `swapItsPreviewAbility` added; `activateAbilityTargeting` routes to it first while ITS is active and not at a conditional-cancel / missing-pick decision (existing follow-up path untouched). NOTE: `reset` rebuilds the manager (`restoreFromInMemorySnapshot` -> `startEngine`), so the swap continues on `session.getInteractionManager()` after copying canUseOrderUi / myAbilityIds / mode resolver / pause plane via new `adoptOrderUiState` (the React bridge only re-pushes on its next render). `InteractionTool.ts` session interface gained optional `getInteractionManager`, `abilityId`, `unitId`, `collectedTargets` and a wider `reset` signature. Specials and uncastable abilities do not swap.
- [x] ITS session tests in `game/interactiveTargeting.swap.test.ts`, reusing the `interactiveTargeting.test.ts` harness:
  - Begin a Throw Rock preview at a normal pause, tick into the windup, then swap to another ITS ability. ITS is active for the new ability, the engine tick equals the mark tick (before the new preview ticks), and the old collected targets are gone.
  - Swapping to the same ability is a no-op.
  - The swap is refused when `ONLY_UNDO_AT_START` would disable Undo (inject through the predicate input).
  - Run `game/interaction/PlayerInteractionManager.test.ts` too.
  Done: 3 session tests (swap rewinds to mark and starts the new preview with no collected targets; same-ability no-op; second swap blocked while one is rewinding); ONLY_UNDO_AT_START refusal is covered in `itsSwap.test.ts` via the predicate input. PlayerInteractionManager.test.ts (18) passes; lint:changed clean; tsc only the known defineDirectionalShield error; `interactiveTargeting.test.ts -t "Rapid Throw"`: 7 pass, 1 fails with the known `isReactionClaimUndecidedFor` error (fails identically without these changes).

### Step 4: Cards clickable during a preview

Orchestrator-requested cleanup (done first): moved the pure `isItsUndoDisabled` into new `game/interaction/itsUndoRules.ts`; `itsSwap.ts` imports it from there (no more `game/` -> `ui/` import) and `ui/components/itsUndoHotkey.ts` re-exports it so UI imports are unchanged.

Touches: `ui/pages/battlePhase/BattleAbilityBar.tsx`, `ui/components/battleUiSlots/RowSlotAbilities.tsx`, `ui/components/battleUiSlots/abilityHandCardFlags.ts` and its test.

- [x] In `BattleAbilityBar`, compute `canSwapDuringPreview` from `getItsSwapBlockReason` (the same predicate as Step 3, including the rewind-crossfade input). Pass it to the card row so other cards are clickable while `isMyTurn` is false. Leave Pass and Wait behaviour unchanged here; that is Step 6.
  Done: `BattleAbilityBar` builds per-card `canSwapToAbility(ability)` from `getItsSwapBlockReason` (inputs from `its`, `atEndedEarlyDone`, new `isRewindCrossfade` prop = `rewindOverlay != null` from BattlePhase); special / uncastable (`canUseAbilityNow`) / missing-pick are excluded; passed to `RowSlotAbilities`. Pass and Wait unchanged.
- [x] Card chrome: the previewed card keeps its green in-use highlight. Swappable cards look normally clickable, with the title "Switch to <name> (rewinds)". Cards that can't be cast stay greyed out. Extend `abilityHandCardFlags` only if the chrome needs a new flag, and add a test case there.
  Done: `RowSlotAbilities` treats a swap target as turn-enabled for `getAbilityDisabledReason` (so unaffordable cards stay greyed), and titles it "Switch to <name> (rewinds)"; the previewed card keeps its green flag (same ability is blocked). No new `abilityHandCardFlags` flag was needed, so no test case added there.
- [x] Run `ui/components/battleUiSlots/abilityHandCardFlags.test.ts` and `ui/pages/battlePhase/turnIndicatorState.test.ts`, plus lint and tsc.
  Done: abilityHandCardFlags (8), turnIndicatorState (11), itsSwap (6) and itsUndoHotkey (6) tests pass; lint:changed clean; tsc only the known defineDirectionalShield error.

### Step 5: Combo auto-continue

Touches: `game/interaction/PlayerInteractionManager.ts`, `ui/pages/battlePhase/useInteractiveTargetingProgress.ts`, a new `game/interactiveTargeting.comboAutoContinue.test.ts`.

- [x] Add `PlayerInteractionManager.maybeAutoContinueCombo()`. It reads the decision cast through `getConditionalCancelDecisionCast` and acts only when that cast has `conditionalCancelFollowUp === 'same_ability'`. It skips when `shouldForceItsCommitAtComboWindow()` is true, when the ability fails `canUseAbilityNow`, or when it has no hand slot (resolve the mode the same way the number-key path does). It records `${unitId}:${atTick}` so each pause plane fires at most once. Otherwise it calls `activateAbilityTargeting(slotIndex, ability)`.
  Done: `maybeAutoContinueCombo()` added (local waiter + `canUseOrderUi` only; decision cast must have `conditionalCancelFollowUp === 'same_ability'`; skips on forced commit, missing hand slot, `canUseAbilityNow` false, commit/swap in flight). The fired-plane memory is `InteractiveTargetingSession._comboFollowUpStartedPlanes` (`hasComboFollowUpStarted` / `noteComboFollowUpStarted`), NOT on the manager: the session persists across the `startEngine` manager rebuild. `activateAbilityTargeting` records the plane when any follow-up starts at a combo pause (auto or clicked), so Undo/swap back to it never auto-restarts.
- [x] Call it from both places a combo decision can surface: `setWaitingForOrders` (a real-timeline combo pause, including after a forced multiplayer commit) and the ITS progress hook when a preview enters `done` at a conditional-cancel pause. If auto-commit is about to run there, call it after that commit, not alongside it. Undo or swap back to the same plane must not fire it again.
  Done: called from `setWaitingForOrders` (new plane) and from `useInteractiveTargetingProgress` when a preview is `done` (after the auto-commit promise when one starts, not alongside it). The bridge now pushes the hand/mode before the waiting plane so the hand is set when the plane arrives (`useInteractionManagerBridge.ts`).
- [x] ITS session tests in `game/interactiveTargeting.comboAutoContinue.test.ts`, with Throw Knife plus Flurry research (`comboUnlimited`):
  - At knife 1's combo pause, knife 2's preview starts by itself, and its mark is the combo pause.
  - Undo returns to the pause and does not restart the preview.
  - Swap to another ability works (Step 3).
  - An Entombed pause does not auto-continue.
  - A caster who can't cast the ability does not auto-continue.
  Done: 7 tests in `game/interactiveTargeting.comboAutoContinue.test.ts` (knife 2 auto-starts, mark noted; Undo on the REBUILT manager does not restart; swap to Throw Rock works; no follow-up default (stripped field, Entombed-style) / card not in hand / no uses left / UI unusable do not fire). Note: the mark of the auto-started preview is the committed-in-place engine state (needs a netAdapter stub with `isOrderSubmitPathAvailable`).

### Step 6: Pass during a follow-up preview

Touches: `game/interaction/InteractiveTargetingSession.ts` / `game/interaction/itsBegin.ts`, `game/interaction/isITSPreviewComplete.ts`, `game/interaction/PlayerInteractionManager.ts` (`handleWait`), `ui/pages/battlePhase/BattleAbilityBar.tsx`, `game/interactiveTargeting.comboAutoContinue.test.ts`.

- [x] Record at `begin` whether the preview started on a conditional-cancel pause for its caster (`itsBegin.ts` already looks up `pausedCast`). Expose one predicate, `isAtFollowUpPreview(its)`, next to `getConditionalCancelDecisionCast`.
  Done: `InteractiveTargetingSession._beganAtFollowUpPause` set in `itsBegin` (`pausedCast != null`), cleared in `_clearActive`; `isAtFollowUpPreview(its)` added next to `getConditionalCancelDecisionCast` in isITSPreviewComplete.ts.
- [x] Have `handleWait` and the Pass button both resolve through it. Pass during a follow-up preview runs `reset(..., 'swap')`, then the existing Pass-at-decision path, which continues the paused cast. Button title: "Pass: stop the combo (Space)". Missing-pick and ended-early rules keep their current order of precedence.
  Done: `handleWait` (after the decision case, so missing-pick / ended-early / decision keep precedence) and `BattleAbilityBar` (`atFollowUpPreview` enables Pass, title "Pass: stop the combo (Space)") resolve through it. Pass runs `reset(..., 'swap')` then submits `wait` on `session.getInteractionManager()` after `adoptOrderUiState` (private `passFromFollowUpPreview`); `InteractionTool.ts` session-manager interface gained `submitOrder`.
- [x] Test, in the Step 5 file: after an auto-continue, Pass leaves no ITS active, applies no follow-up order, and knife 1 finishes its cooldown with no further combo pause.
  Done: new test: auto-continue, Pass rebuilds the manager, no ITS active (plane memory blocks re-start), exactly one `wait` order submitted, and once applied knife 1 finishes with no further combo pause. Fixture netAdapter stub gained `handleParallelPlaneClosed`. Step 6 tests: 8/8 in the file; lint clean; tsc only the known error.

### Step 7: Docs and final verification

Touches: `docs/interactive-sequential-targeting.md`, `app/js/games/minion_battles/game/interaction/AGENTS.md`, and this plan.

- [x] Docs:
  - In `docs/interactive-sequential-targeting.md`, add "Swap during a preview" and "Combo auto-continue" sections, update the Controls table (card click while previewing, Pass in a follow-up preview), and mention the `'swap'` rewind reason.
  - Add one line each to `game/interaction/AGENTS.md`.
  Done: `docs/interactive-sequential-targeting.md` gained "Swap during a preview" and "Combo auto-continue" sections (swap predicate, `'swap'` quick rewind, manager-rebuild gotcha, `followUpDefault` -> `conditionalCancelFollowUp`, `maybeAutoContinueCombo`, once-per-plane memory, Pass via `isAtFollowUpPreview`), two new Controls rows, key-file rows, and the quick-fade note in the rewind overlay section. `game/interaction/AGENTS.md` got one paragraph each for swap and auto-continue.
- [x] Run `npm run lint:changed`, then `npx tsc --noEmit`, then every test file named in Steps 1–6, then `npm run test:sim` once. Write the results here.
  Results: lint:changed exit 0. tsc: only the known `defineDirectionalShield.ts(302,9)` error. Vitest (unit) 9 files, 71/71 pass: comboCancel (9), rewindFade (2), itsSwap (6), interactiveTargeting.swap (3), PlayerInteractionManager (18), abilityHandCardFlags (8), turnIndicatorState (11), itsUndoHotkey (6), interactiveTargeting.comboAutoContinue (8). `game/interactiveTargeting.test.ts` whole file: 21 failed / 49 passed, ALL 21 with `session.netAdapter?.isReactionClaimUndecidedFor is not a function`. That is more than the 4 the orchestrator listed, but a clean HEAD worktree gives the identical 21 failed / 49 passed (file and `sessionEngineBinding.ts` untouched), so none are from this plan. `npm run test:sim`: 2 files, 191/191 pass.
- [ ] Manual browser checklist (for the user; leave unchecked if not run):
  - Throw Knife with Flurry auto-continues knife after knife.
  - Clicking Ice Shards (or any other card) during the auto-started windup swaps it in with a quick fade.
  - Esc returns to the combo pause and the knife preview does not restart.
  - Pass stops the combo.
  - Rapid Throw still works.
  - The Digging Claws Entombed pause does not auto-continue.
  - In a two-player lobby with a teammate still choosing, the combo is committed, and auto-continue runs after the rewind.
