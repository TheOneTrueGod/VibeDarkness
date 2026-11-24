# Playahead off: expected bugs

ITS playahead is now a per-player setting (Debug Console → Debug Toggles → Targeting → "Playahead targeting (ITS)", stored in this browser, default on; commit `392eaaa7`). With it off, clicking an ability opens the upfront `AbilityTargetingTool` and asks for every target before the order is sent. This report lists the bugs that are likely when it is off, found by reading the code. The upfront tool stayed in the code while ITS grew, but its order shape fell behind. Nothing here has been reproduced in a live game yet.

- **Low:** a few changes to a few files.
- **Medium:** overhauls a small subsystem.
- **Large:** touches many parts of the code and likely needs a data migration.

Baseline: `tsc` clean. One unit test covers the off path: `PlayerInteractionManager.test.ts`, "with playahead off, the card opens the upfront targeting tool". The sim / AbilityTest harness skips the UI, so no test covers the orders the upfront tool builds.

---

## P0: Fix before relying on playahead off

### [x] P0.1 Upfront orders send only the last step's targets
**Complexity:** Low (one call site, plus a parity test). **Helps:** every multi-select ability (Double Punch, claw combos, Spirit Storm, More Rock).

Findings:
- `AbilityTargetingTool.onCanvasClick` submits `stepOrderTargets` as `order.targets` when the last step is picked. That holds only the final step's pick, lock-ons and aim pixel. `targetsByLabel` does carry every step.
- ITS commits build positional `targets` with one entry per label (`buildFinalizedSequentialTargetingOrder` in `itsOrderBuilders.ts`). The AI does the same (`buildAiSelectTargets`).
- `targetsByLabel` is not serialized. After `toJSON` / `fromJSON`, `resolveCastBehaviourTarget` falls back to `active.targets[selectIdx]`. With the upfront shape, "Target 1" then resolves to the last step's pick, and later labels resolve to nothing (or to the caster-position fallback).
- That restore happens on other players' engines whenever they rewind an ITS preview, and on checkpoints and resync. In co-op, a teammate using playahead while you cast Double Punch upfront is the likely trigger for a **desync**. A solo game may look fine.

Proposal: build the upfront order with the same helpers as the ITS commit (`buildFinalizedSequentialTargetingOrder`, with the single-label melee override), so there is a single order shape. Add a parity test: the same picks through the upfront tool and through ITS produce equal `targets` / `targetsByLabel`, including a toJSON round trip.

Done: `AbilityTargetingTool` now builds the order with `buildFinalizedSequentialTargetingOrder`. Test: "a multi-select ability sends one positional target per label" in `PlayerInteractionManager.test.ts` (Double Punch, two picks, labels pointing at their own entries). There is no toJSON round-trip test yet.

### [x] P0.2 Self-cast abilities need an extra canvas click
**Complexity:** Low.

Findings: `PlayerInteractionManager.activateAbilityTargeting` submits at once for abilities with nothing to pick (Gather Light), but only inside the `isSequentialTargetingEnabled()` branch. With playahead off, these abilities open the targeting tool instead, and the cast fires only on the next canvas click (`staticTargets.length === 0` in `AbilityTargetingTool`). Confirm-radius-only abilities (Bramble Patch Command, `0707Ability.ts`) behave the same way, with no radius preview.

Proposal: move the "nothing to pick → submit now" check above the flag. It must count select and confirm-radius steps (`getInteractiveTargetDefsFromTimings`) as well as static `targets`, because an ability with only select steps has empty `getAbilityTargets`.

Done: the check now runs with playahead on or off and counts select steps only. Confirm-radius-only abilities (Bramble Patch Command) also submit on the card click with playahead off, because the confirm step only exists inside ITS. Test: "an ability with nothing to pick submits on the card click".

---

## P1: Likely friction

### P1.1 Later steps are previewed and clamped from the caster's position at click time
**Complexity:** Medium (design question rather than code).

Findings: the upfront tool clamps and previews every step from where the caster is now (`clampSelectTarget`, `constrainSelectAim`, `onCanvasMouseMove`). The engine clamps each pick again when it enters (`resolveCastBehaviourTarget`), from where the caster is by then. With lunges, slides and windup movement (Double Punch, Windup Lunge melee, claw combos, Spirit Storm `turnLimit`), the attack lands somewhere other than where the preview showed. `validatePick` also runs again at entry (`hasRejectedEnteringSelectPick`), so a pick that has become illegal (a rock already gone) fizzles more often than with ITS. This is the trade-off of upfront targeting, not a defect, but players will report it as one.

> [!DECISION] With playahead off, should later steps be previewed from where the caster will be?
> - Accept it: playahead off means aiming blind for later steps. No work.
> - Project the caster's position for each step (a dry-run simulation without pauses). Accurate, but this is most of what ITS already does.
> **Recommendation:** accept it for now and say so in the toggle's help text.

### P1.2 The upfront tool has its own copy of select-pick logic
**Complexity:** Low.

Findings: ITS clicks go through `resolveSelectPickForAim` (`abilities/targeting.ts`), which resolves lock-ons at click time. The upfront tool repeats that logic inline and reads lock-on candidates from a cache filled by mouse moves. A click with no mouse move at that step (fast double-clicks, touch) gets no lock-on: the pick becomes a pixel, or is refused when `allowMiss === false`. ITS fixes made since 2026-07 (59 commits under `game/interaction/`) did not reach this copy.

Proposal: have `AbilityTargetingTool` call `resolveSelectPickForAim` and `buildMeleeSelectOrderTargets`, the same as `resolveItsSelectTargetForClick`. Keep the cache for hover rendering only.

### P1.3 A missing label in the real timeline can stall the game
**Complexity:** Low (guard plus test).

Findings: `findImpendingNeedForCast` (`selectTargetLookahead.ts`) treats any cast with `targetsByLabel !== undefined` as a preview, and upfront orders set `targetsByLabel`. If such a cast reaches a select whose label it lacks, the real engine sets `waitingForTargetInput`, and only ITS answers that. Upfront picks cover every label at click time, so this needs the select list to change between the click and the cast: research-dependent `getAbilityTimings` (Throw Rock / More Rock, Blood Shard, Ice Shards and others, 13 files) or an ability mode switch. That is unlikely, but the game would hang. Engines restored from a snapshot lose `targetsByLabel` and would not pause, so the clients would also diverge.

Proposal: upfront orders should declare any label they lack in `missingSelectLabels` (the existing serialized path). The lookahead should pause only for real preview casts. Today a preview cast is recognised by `targetsByLabel` being set at all; replace that with an explicit flag such as `active.isPreviewCast`.

---

## P2: Nice to do

### P2.1 Combo windows auto-arm the upfront cursor
**Complexity:** Low.

Findings: `maybeAutoContinueCombo` calls `activateAbilityTargeting` at every Combo pause. With playahead off, that now opens the upfront targeting tool by itself. It is probably what you want (the same ability again), but it is new behaviour. Pass, and clicking the card again, still cancel it. Check it in play.

### P2.2 No movement re-input between steps
**Complexity:** Medium.

Findings: ITS lets the player right-click new movement during a step's pause (`movementByLabel`). The upfront tool can't do this, so lunge abilities that flush `movementByLabel` at cooldown never get a path. This is a missing feature, not a bug.

### P2.3 Turning the setting off mid-preview
**Complexity:** Low.

Findings: the flag is read on each ability click. Turning it off during an ITS preview leaves that preview running. The next card click swaps (`swapItsPreviewAbility` → reset → `activateAbilityTargeting`) and opens the upfront tool after the rewind. This should be safe. Check it once.

---

## Suggested order

- P0.1 and P0.2 first. P0.1 is the only likely desync.
- P1.2 next (it makes P0.1's parity test simpler), then P1.3.
- P1.1 decision whenever playahead off goes beyond debugging.
