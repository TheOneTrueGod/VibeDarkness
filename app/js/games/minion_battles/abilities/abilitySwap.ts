/**
 * abilitySwap.ts — Swap network evaluator.
 *
 * Activates and deactivates abilities in the swap network in response to
 * engine events. Pure logic; no side effects on import.
 *
 * Entry point: `evaluateSwapTriggers(unit, event)`.
 */

import type { Unit } from '../game/units/Unit';
import type { EventBus } from '../game/EventBus';
import { getAbility } from './AbilityRegistry';
import { canUseAbilityNow, ensureAbilityRuntimeState } from './abilityUses';
import { canAffordAbility, type AbilityStatic } from './Ability';

/**
 * `refresh` re-checks the state triggers (`whileCastable`). Send it once per unit tick and after
 * anything that changes uses outside a tick (round start).
 */
export type SwapEvent =
    | { type: 'buffApplied'; buffType: string }
    | { type: 'abilityExhausted'; abilityId: string }
    | { type: 'refresh' };

/**
 * Swap two entries in `unit.abilities` so the swap ability occupies the
 * replaced ability's bar slot (and vice versa). No-op when either id is missing.
 */
export function swapAbilityBarSlots(unit: Unit, abilityIdA: string, abilityIdB: string): boolean {
    const idxA = unit.abilities.indexOf(abilityIdA);
    const idxB = unit.abilities.indexOf(abilityIdB);
    if (idxA < 0 || idxB < 0 || idxA === idxB) return false;
    unit.abilities[idxA] = abilityIdB;
    unit.abilities[idxB] = abilityIdA;
    return true;
}

function notifyAbilityBarChanged(unit: Unit, eventBus?: EventBus): void {
    eventBus?.emit('ability_bar_changed', { unitId: unit.id });
}

/**
 * Activate a swap-network ability: hide the ability it replaces and
 * mark itself active with the configured number of uses.
 */
function activateSwappedAbility(unit: Unit, abilityId: string): boolean {
    ensureAbilityRuntimeState(unit, abilityId);
    const runtime = unit.abilityRuntime[abilityId];
    if (!runtime) return false;

    const ability = getAbility(abilityId);
    if (!ability?.swapConfig) return false;

    const { replacesAbilityId, usesOnActivation, activateTrigger } = ability.swapConfig;

    // Guard: only activate if the ability being replaced is currently active.
    ensureAbilityRuntimeState(unit, replacesAbilityId);
    const replacedRuntime = unit.abilityRuntime[replacesAbilityId];
    if (!replacedRuntime || replacedRuntime.active === false) return false;

    // Hide the replaced ability.
    replacedRuntime.active = false;

    // Activate this ability.
    runtime.active = true;
    runtime.replacedAbilityId = replacesAbilityId;
    // A `whileCastable` swap keeps its own uses: granting uses on activation would make it castable forever.
    if (activateTrigger.type !== 'whileCastable') {
        runtime.currentUses = usesOnActivation ?? runtime.maxUses;
    }

    // Show the swap ability in the replaced ability's bar slot.
    swapAbilityBarSlots(unit, abilityId, replacesAbilityId);
    return true;
}

/**
 * Deactivate a swap-network ability: restore the ability it replaced and
 * clear its own swap state.
 */
function deactivateSwappedAbility(unit: Unit, abilityId: string): boolean {
    const runtime = unit.abilityRuntime[abilityId];
    if (!runtime) return false;

    const { replacedAbilityId } = runtime;
    if (replacedAbilityId === null || replacedAbilityId === undefined) return false;

    // Restore the replaced ability.
    ensureAbilityRuntimeState(unit, replacedAbilityId);
    const replacedRuntime = unit.abilityRuntime[replacedAbilityId];
    if (replacedRuntime) {
        replacedRuntime.active = true;
    }

    // Clear this ability's swap state.
    runtime.active = false;
    runtime.replacedAbilityId = null;

    // Restore original bar order.
    swapAbilityBarSlots(unit, abilityId, replacedAbilityId);
    return true;
}

/** The unit could start a cast of this ability right now: a use left and the resource cost paid. */
function isCastableNow(unit: Unit, ability: AbilityStatic): boolean {
    return canUseAbilityNow(unit, ability) && canAffordAbility(unit, ability);
}

/**
 * True while either card of a swap pair (or one of their mode abilities) is mid-cast. The slot is left
 * alone then and settles on the first refresh after the cast ends.
 */
function isSwapSlotMidCast(unit: Unit, swapAbilityId: string, replacedAbilityId: string): boolean {
    if (unit.activeAbilities.length === 0) return false;
    const ids = new Set<string>([swapAbilityId, replacedAbilityId]);
    for (const id of [swapAbilityId, replacedAbilityId]) {
        for (const modeId of Object.values(getAbility(id)?.abilityModes?.modeAbilityIds ?? {})) ids.add(modeId);
    }
    return unit.activeAbilities.some((active) => ids.has(active.abilityId));
}

/**
 * Settle every `whileCastable` swap on the unit: swap in while castable, give the slot back when not.
 * Returns true when any slot changed.
 */
function settleWhileCastableSwaps(unit: Unit): boolean {
    let changed = false;
    // Copy: activating / deactivating reorders `unit.abilities`.
    for (const abilityId of [...unit.abilities]) {
        const ability = getAbility(abilityId);
        const swapConfig = ability?.swapConfig;
        if (!ability || !swapConfig) continue;
        const { activateTrigger, deactivateTrigger, replacesAbilityId } = swapConfig;
        if (activateTrigger.type !== 'whileCastable' && deactivateTrigger.type !== 'whileCastable') continue;

        ensureAbilityRuntimeState(unit, abilityId);
        const runtime = unit.abilityRuntime[abilityId];
        if (!runtime) continue;
        const isSwappedIn = runtime.active !== false && runtime.replacedAbilityId != null;
        const isHidden = runtime.active === false;
        if (!isSwappedIn && !isHidden) continue;

        const wantsIn = isHidden && activateTrigger.type === 'whileCastable' && isCastableNow(unit, ability);
        const wantsOut = isSwappedIn && deactivateTrigger.type === 'whileCastable' && !isCastableNow(unit, ability);
        if (!wantsIn && !wantsOut) continue;

        const replacedId = runtime.replacedAbilityId ?? replacesAbilityId;
        if (isSwapSlotMidCast(unit, abilityId, replacedId)) continue;

        if (wantsIn ? activateSwappedAbility(unit, abilityId) : deactivateSwappedAbility(unit, abilityId)) {
            changed = true;
        }
    }
    return changed;
}

/**
 * Evaluate swap triggers for all abilities on a unit in response to an engine event.
 *
 * Call this:
 * - After `unit.addBuff(...)` with `{ type: 'buffApplied', buffType: buff._type }`.
 * - After `runtime.currentUses` reaches 0 with `{ type: 'abilityExhausted', abilityId }`.
 * - Once per unit tick and at round start with `{ type: 'refresh' }` (state triggers such as `whileCastable`).
 *
 * Emits `ability_bar_changed` only when a slot actually changed.
 */
export function evaluateSwapTriggers(unit: Unit, event: SwapEvent, eventBus?: EventBus): void {
    let changed = false;

    if (event.type === 'refresh') {
        changed = settleWhileCastableSwaps(unit);
    } else if (event.type === 'buffApplied') {
        // Scan for inactive abilities whose activateTrigger matches this buff.
        for (const abilityId of unit.abilities) {
            ensureAbilityRuntimeState(unit, abilityId);
            const runtime = unit.abilityRuntime[abilityId];
            if (!runtime || runtime.active !== false) continue;

            const ability = getAbility(abilityId);
            if (!ability?.swapConfig) continue;

            const { activateTrigger } = ability.swapConfig;
            if (
                activateTrigger.type === 'buffApplied'
                && activateTrigger.buffType === event.buffType
            ) {
                if (activateSwappedAbility(unit, abilityId)) {
                    changed = true;
                }
            }
        }
    } else if (event.type === 'abilityExhausted') {
        const ability = getAbility(event.abilityId);
        if (ability?.swapConfig) {
            const { deactivateTrigger } = ability.swapConfig;
            if (deactivateTrigger.type === 'selfExhausted') {
                if (deactivateSwappedAbility(unit, event.abilityId)) {
                    changed = true;
                }
            }
            // selfUsed is not handled by exhaustion events — it fires immediately after each use.
            // whileCastable is not either: the use is spent as its cast starts, so it settles on the
            // first refresh after that cast ends.
        }
    }

    if (changed) {
        notifyAbilityBarChanged(unit, eventBus);
    }
}
