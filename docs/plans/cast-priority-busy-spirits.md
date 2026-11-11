# Cast priority + busy / free spirits

> **Completed 2026-11-10** on `master` (uncommitted).
> - **Engine:** cast priority with levels Idle 0, Minor 10 and Major 20 (`game/units/castPriority.ts`).
>   - The priority is stamped on orders and casts (`castPriority`, serialized).
>   - A cast's effective priority is capped at Minor during cooldown and is Major while the unit is held.
>   - `OrderManager` drops an order unless its priority is strictly higher; otherwise `preemptUnitAbilities` ends the running casts with reason `'preempted'`.
> - **Follow-ups:** `BattleOrder.followUpOf` lets a follow-up replace its parent cast (decision (a)). Pounce → Spirit Flurry keeps Major this way.
> - **Pet commands:** Sic 'em, Bramble Patch and Fling Thorns order at Major. Spirit Strike orders at Minor through the generic rule.
> - **Free spirit:** `abilitySource.requireFree` selects the nearest free spirit, Spirit Storm included. Spirit Storm preempts a bite before holding the spirit.
> - **UI:** `no_free_spirit` shows "Not Available". `abilityTooltipLines.ts` adds the tooltip line automatically.
> - **Tests:** two new pet AbilityTests. The full suite passes apart from the two known unrelated failures (`accountKnowledge`, `questBankUi`). tsc and lint are clean.
> - **Still to do:**
>   - The manual browser checklist in Step 6.
>   - Known gap: if Spirit Storm's relocate finds no free spirit, the spin re-picks at the storm window, so a spirit that frees up within 0.15s still gets spun.

## Goal

Spirit commands collide. For example:
- Fling Thorns can fire while the spirit is held in Spirit Storm.
- A command queued on a spirit that is mid-bite runs alongside the bite instead of replacing it.

Add a general **cast priority** to the engine. Then define a spirit's **busy / free** state as a priority level, so the rule isn't a one-off for spirits.

### Agreed design

- **Priority levels.** Named constants with gaps between them; ability defs and callers never use raw numbers.
  - `Idle = 0`
  - `Minor = 10`: AI casts (bite), reactions (Spirit Strike), walking.
  - `Major = 20`: abilities a player directly commanded.
  - 30 and up are reserved for later.
- **Stamped priority.** Each cast records the priority it started with (`ActiveAbility.castPriority`, serialized). The order source sets it:
  - Command cards pass `Major` through `commandPetAbility`.
  - Reactions pass `Minor`.
  - Casts with no stamp (AI, legacy) count as `Minor`.
  - A spirit's follow-up inside a commanded chain inherits its parent's priority. Example: Pounce → Spirit Flurry stays Major.
- **Effective priority** is worked out each tick from serialized state, never stored:
  - Idle unit: `0`.
  - Cast in its cooldown phase: `min(stamped, Minor)`. A Major cast winding down is free, and Spirit Strike still can't cut into a cooldown.
  - Unit held by another unit's cast (`isUnitHeldByCast`, e.g. Spirit Storm): `Major`.
  - Otherwise, the highest effective priority among its casts.
- **Interrupt rule.** An order that carries a `castPriority` only starts when that priority is **strictly greater** than the unit's effective priority.
  - If it starts, every running cast is ended first: `ON_CAST_END`, behaviour `onInterrupt`, a `cast_ended_early` event, and no refund.
  - If it doesn't start, the order is dropped.
  - Orders with no `castPriority` behave exactly as today, so players and enemies are unchanged.
- **Busy** means effective priority ≥ `Major`. **Free** means anything lower.
- **Command cards** need a free spirit:
  - There is no range limit.
  - When there are several spirits, the card controls the **nearest free** one.
  - Without one, the card is disabled: title "Not Available", description "Requires an unoccupied spirit animal."
  - Each card's tooltip gets a line derived from the def field, not written into card text.
- **Order: Move, Guard and Attack** (0709, 0712, 0708) stay always available. They don't interrupt a Major cast; they only change the spirit's anchor or focus.
- **Spirit Strike** keeps its current behaviour. It's Minor, so it can't cut into another Minor cast or any cooldown, and the generic rule covers this.
- Stuns, knockback and juggernaut are **not** part of this. Priority only decides which cast may replace which.

### Key files (minion_battles-relative)

| Area | File |
|---|---|
| Priority constants and effective priority | new `game/units/castPriority.ts` (+ test) |
| Cast record and serialization | `game/types.ts` (`BattleOrder`, `ActiveAbility`), `game/units/unitToJSON.ts`, `game/units/unitFromJSON.ts` |
| Order application | `game/managers/OrderManager.ts` (`applyOrderLogic`), `game/units/unitAbilityLifecycle.ts` (`executeUnitAbility`, a new preempt helper beside `interruptUnitAbilities`), `game/units/Unit.ts` (`executeAbility` signature) |
| Pet commands | `abilities/petCommands.ts` (`commandPetAbility`), `abilities/abilitySourceUnits.ts`, `abilities/targeting.ts` (`resolveCasterPetAnchor`), `abilities/Ability.ts:~490` (`abilitySource` type) |
| Reactions | `game/units/petReactions.ts` (`isPetBusy`) |
| Hold | `game/units/castHold.ts`, `abilities/CastBehaviours/PetBehaviours.ts` |
| Cards | `card_defs/07_command_core/{0704,0707,0713,0714}/*Ability.ts`, `0702_Pounce/0702Ability.ts` (the chain into 0711) |
| UI | `ui/components/abilityDisabledReason.ts`, `ui/components/AbilityTooltip.tsx` (or whatever builds its lines) |
| Scenarios | `testing/scenarios/general/pets.ts`, `testing/scenarios/registry.ts`, `testing/runner/SimulationRunner.test.ts` |

## Agent Instructions

This plan is executed by `/jp-implement-plan`. The **invoking agent is the sole orchestrator**. It spawns one worker per step **synchronously** (never in the background), waits for each to finish, then reports completion to the user. Each worker implements exactly one step, checks its items off with a one-line summary, and **stops without spawning the next agent**. Follow `.claude/skills/jp-implement-plan/SKILL.md`.

- Branch: `master`. **Do not commit.** Leave any unrelated dirty files alone.
- Read "Build the engine, not the feature" in `app/js/games/minion_battles/AGENTS.md`.
  - Priority is a generic engine concept, so no `if (pet)` checks in `castPriority.ts` or `OrderManager`.
  - Spirit-specific wording lives only in the disabled reason and the tooltip line.
- **Determinism.** Effective priority is derived from serialized state (`castPriority`, phase from cast elapsed, `castBehaviourPayloads`).
  - Serialize `castPriority` on both `BattleOrder` and `ActiveAbility`.
  - Omit it when undefined, so old checkpoints and orders load unchanged.
- **Write a failing test first** for each engine behaviour (CLAUDE.md).
- Tests use **Vitest** (`npx vitest run <file>`), never jest.
- Verify each step with `npm run lint` and `npx tsc --noEmit -p .` (every step crosses interfaces), plus **only** the test files that step lists. No full suite and no AbilityTest runs until Step 6.
- Relevant skills:
  - `game-engine`, `game-object-def-pattern`, `game-sync-data-flow` (order serialization).
  - `editing-card-behaviour`, `creating-an-ability`, `ability-tests`.
  - `time-dilation` (use `getCastElapsed` for the phase lookup).
  - `scoped-testing`, `editing-and-creating-components`.

## Steps

### Step 1 — Cast priority data and effective priority

Touches: new `game/units/castPriority.ts` (+ `castPriority.test.ts`), `game/types.ts`, `game/units/unitToJSON.ts`, `game/units/unitFromJSON.ts`, `game/units/castHold.ts` (read only).

- [x] Add `CAST_PRIORITY = { Idle: 0, Minor: 10, Major: 20 } as const` and a `CastPriority` type. Add optional `castPriority?: number` to `BattleOrder` and `ActiveAbility`, with doc comments pointing at `castPriority.ts`. Serialize `ActiveAbility.castPriority` in `unitToJSON`/`unitFromJSON`, omitted when undefined, and check how `BattleOrder` already round-trips so the field survives with it.
  - Done: `CAST_PRIORITY`/`CastPriority` in new `game/units/castPriority.ts`; `castPriority?` on `BattleOrder` + `ActiveAbility` (types.ts); `unitToJSON` writes it only when defined, `unitFromJSON` keeps it via its existing `...a` spread; `BattleOrder` round-trips via the `{ ...o.order }` spread in `engineSerialization.ts`, so no change needed there.
- [x] Implement `getCastEffectivePriority(unit, active, engine)`: `min(stamped ?? Minor, Minor)` in the cooldown phase (via `getCoveringAbilityPhaseAtElapsed`, the same helper `interruptUnitAbilities` uses), otherwise `stamped ?? Minor`.
  - Also implement `getUnitEffectivePriority(unit, units, engine)`, the max over casts. It is `Major` when `isUnitHeldByCast` holds the unit, and `Idle` when the unit has no casts.
  - Add `isUnitBusy(unit, units, engine)` (≥ Major) and `canPreempt(unit, priority, units, engine)` (strictly greater).
  - Done: all four in `castPriority.ts`. `engine` is a minimal `CastPriorityEngine = { gameTime }` (any `EngineContext` fits); phase via `resolveAbilityTimingEntries` → `normalizeAbilityTimingsToIntervals` → `getCoveringAbilityPhaseAtElapsed` on `getCastElapsed`; unregistered ability ids fall back to the stamp.
- [x] Tests in `castPriority.test.ts` cover:
  - Idle is 0.
  - An unstamped cast is Minor.
  - A Major cast is Major in windup and active, and Minor in cooldown.
  - A held unit is Major.
  - Equal priority can't preempt.
  - A `castPriority` survives a unit `toJSON` / `fromJSON` round trip.
  - Done: 7 tests (plus max-over-casts and omitted-when-undefined) using a registered test ability with windup/active/cooldown; all pass. Lint (known warning only) and `tsc --noEmit -p .` clean.
- Verify: `npx vitest run app/js/games/minion_battles/game/units/castPriority.test.ts`

### Step 2 — Preempting orders in the engine

Touches: `game/units/unitAbilityLifecycle.ts`, `game/units/Unit.ts`, `game/managers/OrderManager.ts`, a new `game/units/castPreempt.test.ts`.

- [x] First, write a failing test. A unit mid-cast (windup) of an unstamped ability A receives a `castPriority: Major` order for ability B. After it applies:
  - Only B is active.
  - A fired `ON_CAST_END` and `cast_ended_early`, and its cast behaviours' `onInterrupt` ran.
  - A was not refunded.
  - Done: new `game/units/castPreempt.test.ts` drives `OrderManager.applyOrderLogic` on a stub engine (registered phased test abilities, mocked `triggerAbilityEvent`, spied `refundAbilityCost`); confirmed failing before the implementation. Also asserts B is stamped Major and the ability note is cleared.
- [x] Add `preemptUnitAbilities(unit, engine)` next to `interruptUnitAbilities`. It ends **every** running cast, cooldowns included, with no refund and no interrupt-policy lookup.
  - Emit `cast_ended_early` with a new end reason (e.g. `'preempted'`). Extend its union and check any switch that reads it.
  - Clear the ability note.
  - Done: `preemptUnitAbilities` in `unitAbilityLifecycle.ts` (outcome `ended` in cooldown, `cancelled` otherwise). `'preempted'` added to `CastEndedEarlyEvent.reason` and the readers' unions (`isITSPreviewComplete.ts` `endedEarly`, `InteractiveTargetingSession.getPreviewCastEndedEarly`, `itsLobbyLog.logItsPreviewEndedEarly`); `useInteractiveTargetingProgress.ts` maps it to the `cast_interrupted` notice.
- [x] In `OrderManager.applyOrderLogic`, before `executeAbility`, when `order.castPriority !== undefined`:
  - If `!canPreempt(...)`, drop the order: return before any movement or wait handling, and don't mix the order fingerprint.
  - Otherwise, preempt if the unit has casts, then pass `order.castPriority` through `executeAbility` → `executeUnitAbility`, which stamps `active.castPriority`.
  - Orders without `castPriority` follow today's path byte for byte.
  - Done: the check + preempt sit right after the frozen-unit re-queue and before conditional-cancel / missing-pick handling (so a dropped order has zero side effects, and a preempting order sees no stale casts). `canPreempt(unit, p, ctx.units, ctx)`. `Unit.executeAbility` / `executeUnitAbility` gained a trailing optional `castPriority`, spread onto the new `ActiveAbility` only when defined.
- [x] More tests:
  - A Minor order on a unit whose Minor cast is running is dropped, and the running cast is untouched.
  - A Minor order on a unit whose Major cast is in cooldown is dropped.
  - A Major order on a unit in a Major cooldown preempts it.
  - An order with no `castPriority` on a casting unit behaves as before (both casts run).
  - Done: all four in `castPreempt.test.ts` (the dropped-order test also checks no movement change, no event and no fingerprint mix). 5/5 + castPriority 7/7 pass; lint (known warning only) and `tsc --noEmit -p .` clean.
- Verify: `npx vitest run app/js/games/minion_battles/game/units/castPreempt.test.ts app/js/games/minion_battles/game/units/castPriority.test.ts`

### Step 3 — Pet commands carry priority; reactions use the generic rule

Touches: `abilities/petCommands.ts`, `game/units/petReactions.ts`, `card_defs/07_command_core/0702_Pounce/0702Ability.ts`, `0704_SicEm/0704Ability.ts`, `0707_BramblePatchCommand/0707Ability.ts`, `0714_FlingThornCommand/0714Ability.ts`, their co-located tests, and `game/units/petSystem.test.ts`.

- [x] Add `priority?: number` to `CommandPetAbilityOpts` and copy it onto each queued order as `castPriority`.
  - The **charge grant must not leak**: when `priority` is set and `!canPreempt(pet, priority, ...)` at queue time, skip that pet (no charge, no order).
  - `applyOrderLogic` re-checks when the order applies on the next tick.
  - Done: `commandPetAbility` skips pets it can't preempt (before the charge grant), spreads `castPriority` onto the order only when set, and plays the command cue only to pets it actually ordered. `AbilityEngineContext.state.orderMgr.queueOrder`'s order type gained `castPriority?`.
- [x] Pass `CAST_PRIORITY.Major` from 0704 (Pounce order), 0707 and 0714.
  - Pounce's chain into Spirit Flurry (0702 → 0711) passes the running cast's own `castPriority`, so the follow-up keeps its parent's level. Read it from `ctx`'s active cast. If the context doesn't expose that, add a small accessor rather than hard-coding Major.
  - Done. 0704, 0707 and 0714 pass `CAST_PRIORITY.Major`. **Decided: option (a)** (a follow-up order replaces its parent). New serialized `BattleOrder.followUpOf?: string` (omitted when undefined; survives checkpoints through the `{ ...o.order }` spread in `engineSerialization.ts`), `CommandPetAbilityOpts.followUpOf` copied onto the order, and an optional `excludeAbilityId` on `getUnitEffectivePriority` / `canPreempt`, used by both the queue-time check and `applyOrderLogic` (held-by-cast still counts; the preempt then ends the parent with every other cast). 0702's onHit reads Pounce's stamp via the new `getRunningCastPriority(unit, abilityId)` and passes `priority` + `followUpOf: Pounce` (unstamped Pounce keeps today's unstamped Flurry).
  - Original note: **0702 → 0711 was blocked on a design question (left unchanged, Flurry still unstamped as today):** Pounce's dash `withOnHit` fires during Pounce's *active* phase, and Pounce keeps running (the dash only stops moving; the window and cooldown continue). Stamping Flurry with the parent's Major makes it an order at Major on a unit whose effective priority is Major (its own Pounce), so the strict `>` rule drops it at queue time (`commandPetAbility`) and again in `applyOrderLogic`: the chain would break. Options: (a) a follow-up order names its parent (e.g. new serialized `BattleOrder.followUpOf?: abilityId`), and the gate measures priority excluding that parent cast, then preempts it (ends Pounce early); (b) a "stamp only, don't gate" flag on the order; (c) leave Flurry unstamped (Minor, today's behaviour: runs alongside Pounce, but the spirit counts as free during Flurry, so Fling Thorns could cut into it).
- [x] In `petReactions.ts`, have reactions pass `CAST_PRIORITY.Minor` and replace `isPetBusy` with `canPreempt(pet, Minor, ...)`.
  - The behaviour must stay identical: a pet with any running cast, including a cooldown, or held by a cast, gets no Spirit Strike.
  - Delete `isPetBusy` if nothing else uses it.
  - Done: reactions gate on `canPreempt(pet, CAST_PRIORITY.Minor, engine.units, engine)` and pass `priority: Minor`; `isPetBusy` deleted (its only other user, `castHold.test.ts`, now asserts `canPreempt` instead).
- [x] Tests:
  - Fling Thorns (0714) commanded while the spirit is mid-bite preempts the bite and fires.
  - Fling Thorns commanded while the spirit is mid-Fling Thorns windup is dropped and grants no charge.
  - A Spirit Strike reaction on a spirit in a bite cooldown is still skipped.
  - Sic 'em → Pounce → Spirit Flurry: the 0711 cast is stamped Major.
  - Done. Follow-ups: `castPreempt.test.ts` adds a follow-up replacing its parent at equal priority, a follow-up also ending other outranked casts, and a follow-up naming a non-running parent being gated (dropped) normally; new `0702Ability.test.ts` runs Sic 'em → Pounce (Major) → onHit → Flurry through a real `OrderManager`: the order carries Major + `followUpOf`, 0711 is stamped Major and Pounce gets `cast_ended_early` `'preempted'`. Lint (known warning only) and `tsc --noEmit -p .` clean; 0702/0707/0714, petSystem, castHold, castPreempt, castPriority all pass (39/39).
  - Earlier: `0714Ability.test.ts` covers the queued order carrying Major, mid-bite preempt (real `OrderManager.applyOrderLogic` on a stub engine: only 0705 remains, stamped Major, bite gets `cast_ended_early` `'preempted'`), and the dropped mid-windup order with an unchanged `abilityRuntime`. `castHold.test.ts` covers the bite-cooldown reaction skip and the Minor stamp. The Sic 'em → Flurry Major test waits on the 0702 question above. Lint (known warning only), `tsc --noEmit -p .` clean; 0707, 0714, petSystem, castHold, castPreempt, castPriority tests all pass (35/35).
- Verify: the co-located `0704/0707/0714` `*Ability.test.ts`, `0702Ability.test.ts`, and `game/units/petSystem.test.ts` (plus any `petReactions` test that exists).

### Step 4 — "Nearest free spirit" source, Spirit Storm included

Touches: `abilities/Ability.ts` (`abilitySource` type), `abilities/abilitySourceUnits.ts`, `abilities/targeting.ts`, `abilities/CastBehaviours/PetBehaviours.ts`, `card_defs/07_command_core/0713_SpiritStorm/0713Ability.ts` (+ test), and the source consts in 0704/0707/0714.

- [x] Extend `abilitySource` with `requireFree?: true`.
  - `resolveAbilitySourceUnits` gains optional engine context. With `requireFree`, it filters to pets where `!isUnitBusy`, then applies `'nearest'` or `'all'` as before.
  - Check every caller compiles. Callers without the context (preview, renderer) pass `engine.units` and the engine, or a minimal context that exposes the same busy check.
  - Done: new exported `PetAbilitySource` type in `Ability.ts` (`requireFree?: true`, documented). `resolveAbilitySourceUnits(ability, caster, units, aimPoint?, engine?: CastPriorityEngine)` filters out `isUnitBusy` pets when `requireFree` and an engine is given (no engine = no busy filter). New `asCastPriorityEngine(unknown)` narrows preview `gameState`; `createPetSourcedMovementPreview` and `PreviewRenderer` pass the engine; 0704/0707/0714 pass theirs. `tsc` clean. **Import cycle fix:** `castPriority.ts` no longer imports `AbilityRegistry` statically (previewHelpers → abilitySourceUnits → castPriority → registry → card defs → previewHelpers broke `previewHelpers.test.ts`); it uses `setCastPriorityAbilityLookup`, wired in `AbilityRegistry` next to `setAbilityTagResolver` (unwired = casts count at their stamp).
- [x] Set `requireFree: true` on the source consts of 0704, 0707 and 0714. Give Spirit Storm 0713 `abilitySource: { type: 'pet', selector: 'nearest', requireFree: true }`.
  - Leave 0708, 0709 and 0712 **without** `requireFree` (always available).
  - Done. Note: 0713 now has a pet source, so the existing `no_pet_source` disabled reason (and `unitAbilityQueries` pet check) applies to Spirit Storm without a spirit; its header doc was updated (it used to say the storm plays on the player without a spirit).
- [x] Make `resolveCasterPetAnchor` honour an optional `requireFree`. Use it from:
  - `PetRelocateBehaviour` / `PetSpinBehaviour`, which pick the pet once at their window start.
  - Spirit Storm's `withLink`.
  - 0714's preview anchor.

  If no free pet exists at the relocate window's start, the behaviour does nothing, and the storm still plays on the player.
  - Done: `resolveCasterPetAnchor(caster, engine, { requireFree })`. With `requireFree`, a pet one of the caster's **own** casts already holds is returned first (new `isUnitHeldByCastOf(unit, holder)` in `castHold.ts`; `isUnitHeldByCast` now uses it) — needed because the relocate/spin holds make the pet Major, which would otherwise hide it from the spin's setup (entry runs before the relocate's exit on the boundary tick) and the per-tick link. Otherwise nearest free pet. Used by relocate, spin (always requireFree: holding is a Major claim), 0713 `withLink`, 0714's preview cone. Also `resolveSelectAnchorPoint` (`anchorUnit: 'casterPet'`, used by 0713/0714) now prefers the nearest free pet, falling back to the nearest pet so the clamp keeps a centre (doc updated in `timingTargetDef.ts`). Known gap: if the relocate found no free pet, the spin re-picks at the storm window start, so a spirit that became free in those 0.15s would be spun/linked.
- [x] When the relocate picks a pet that is running a Minor cast (bite, Spirit Strike), call `preemptUnitAbilities` on it first, so the hold never overlaps the pet's own cast.
  - Done: new `Unit.preemptAllAbilities(engine)` wrapper (avoids importing the lifecycle into CastBehaviours); `PetRelocateBehaviour.onSetup` calls it when the picked (free) pet has any casts.
- [x] Tests (0713 test plus a source-units test):
  - With two pets, one busy, the source resolves to the free one even when it's farther away.
  - Spirit Storm cast while the only spirit is mid–Fling Thorns windup doesn't relocate it.
  - Spirit Storm cast while the spirit is biting preempts the bite and holds it.
  - Done: new `abilities/abilitySourceUnits.test.ts` (4: free-over-nearer busy for nearest/all and unchanged without requireFree; all busy → none; Major cooldown is free; anchor skips busy and prefers a caster-held pet). `0713Ability.test.ts` +3 (source def; mid-Fling Thorns windup: no move, no preempt, no hold, anchor null; biting spirit: bite `cast_ended_early` `'preempted'`, then relocated). Updated the `abilitySource` expectations in `0707Ability.test.ts` / `0714Ability.test.ts`. Lint (known warning only), `tsc --noEmit -p .` clean; 0713, castHold, abilitySourceUnits, 0702/0704/0707/0714, previewHelpers, petSystem, castPriority, castPreempt, targeting.range all pass (68/68).
- Verify: `0713Ability.test.ts`, `game/units/castHold.test.ts`, and the source-units test you add or extend.

### Step 5 — Disabled reason and tooltip line

Touches: `ui/components/abilityDisabledReason.ts` (+ its test if one exists, otherwise a new one), the tooltip line builder (find what feeds `AbilityTooltip` from an `AbilityStatic`), and `ui/components/BattleAbilityBar` only if it must pass the engine context.

- [x] Add `DisabledReasonId` `'no_free_spirit'`, displayed as `{ title: 'Not Available', description: 'Requires an unoccupied spirit animal.' }`.
  - In `getAbilityDisabledReason`, after the `no_pet_source` check: when `abilitySource.requireFree` is set and no living pet is free (by the same `isUnitBusy` check), return it.
  - Pass in whatever context the busy check needs. Keep it a pure function of its params.
  - Done: `getAbilityDisabledReason` takes optional `engine?: CastPriorityEngine`; with `requireFree` and every living pet `isUnitBusy` it returns `no_free_spirit` (no engine = no busy check, matching `resolveAbilitySourceUnits`). `RowSlotAbilities` passes `asCastPriorityEngine(gameState)` (BattleAbilityBar already passes the engine as `gameState`, so it is untouched).
- [x] Derive a tooltip line "Requires an unoccupied spirit animal" from `abilitySource.requireFree` in the shared tooltip builder, so 0704, 0707, 0713 and 0714 all get it with no card text edits.
  - Done: there was no shared builder (both UI callers used `ability.getTooltipText` directly), so added `abilities/abilityTooltipLines.ts` (`getAbilityTooltipLines` = card lines + `getDerivedAbilityTooltipLines`, which appends `REQUIRES_FREE_SPIRIT_TOOLTIP_LINE` "Requires an unoccupied spirit animal." for `requireFree`). `AbilitySlot` and the `RowSlotAbilities` mobile tooltip use it.
- [x] Tests:
  - With a busy spirit the reason is `no_free_spirit`.
  - With a spirit in a Major cooldown the card is enabled.
  - With no pet, the reason is still `no_pet_source`.
  - The tooltip line appears for `requireFree` abilities and not for Order: Move.
  - Done: `abilityDisabledReason.test.ts` +3 (busy Fling Thorns windup → `no_free_spirit` with the display text; Major cooldown → enabled; no pet → `no_pet_source`), new `abilities/abilityTooltipLines.test.ts` (0704/0707/0713/0714 get the line last, 0709 unchanged). Lint (known warning only), `tsc --noEmit -p .` clean, 10/10 pass.
- Verify: the disabled-reason test file and the tooltip builder's test.

### Step 6 — AbilityTest scenarios + final verification

Touches: `testing/scenarios/general/pets.ts`, `testing/scenarios/registry.ts`, `testing/runner/SimulationRunner.test.ts`.

- [x] Add two high-level scenarios to `pets.ts`, register them, and add headless runs next to the existing pet ones in `SimulationRunner.test.ts`:
  - **`pet_command_preempts_bite`**: the spirit is engaging and biting a dummy, and the player commands Fling Thorns at it. Pass when thorn damage lands (dummy damage exceeds what bites alone could do in the window).
  - **`pet_busy_blocks_command`**: the player casts Spirit Storm, then a Fling Thorns order arrives mid-storm. Pass when the storm completes with the spirit at its storm point, and no Fling Thorns cast or thorn projectile ever existed. Track this in the scenario via an event-bus listener.
  - Done: `petCommandPreemptsBiteScenario` / `petBusyBlocksCommandScenario` in `pets.ts` (registered in `registry.ts`, headless runs in `SimulationRunner.test.ts`), sharing a per-engine `WeakMap` event-bus tracker (`ability_used`, `cast_ended_early` `'preempted'`, `attack_hit` 0705). `spawnDog` gained `extraAbilities` (the dog gets 0705). Preempt: stationary dummy (`createTargetDummyAtWorld`; an AI dummy walked out of the pre-aimed cone), card at tick 20; the bite starts tick 1 and is preempted tick 21. Busy: Storm point 40 px north of the owner (inside the anchor radius); mid-storm a Major 0705 order straight to the spirit (tick 90, the engine gate) and the player's 0714 card (tick 100, the `requireFree` source). Mutation check: raising that order to Major + 1 makes the scenario fail (spirit casts 0705), so it discriminates.
- [x] Run once:
  - The new scenarios plus the existing pet scenarios (`npx vitest run app/js/games/minion_battles/testing/runner/SimulationRunner.test.ts`).
  - The full suite (`npm run test`), then `npx tsc --noEmit -p .` and `npm run lint`.
  - Report any failures unrelated to this plan (the known `accountKnowledge.test.ts` and `questBankUi.test.ts` failures from other work) without fixing them.
  - Done: SimulationRunner 114/114. The first full run also failed `game/units/spiritAnimal.test.ts` "orders an idle spirit to Spirit Strike…", a stale exact-order expectation from Step 3 (reaction orders now carry `castPriority: Minor`). Updated the expectation. Final full suite: 528 files (526 passed, 2 failed); 4336 tests (4332 passed, 2 failed, 2 skipped). The only failures are the known `accountKnowledge.test.ts` and `questBankUi.test.ts`. `tsc --noEmit -p .` clean; lint 0 errors, 1 known warning (`unlock.questBanks.test.ts`).
- [x] Manual browser checklist for the user. Don't run it; list it in the completion report:
  - Done: not run (manual); the four checks below are for the completion report.
  - The Fling Thorns card shows "Not Available" during Spirit Storm and comes back during the storm's cooldown.
  - Commanding Fling Thorns mid-bite fires immediately.
  - Order: Move and Guard stay usable during Spirit Storm.
  - Tooltips show the new line.

## Follow-ups (not in this plan)

- Let player and enemy orders opt into `castPriority` (e.g. boss phases at 30+), once there's a use for it.
- Multi-spirit selection beyond "nearest free" (e.g. choosing a spirit with a click).
