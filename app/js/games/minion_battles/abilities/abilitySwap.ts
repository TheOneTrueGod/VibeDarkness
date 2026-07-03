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
import { ensureAbilityRuntimeState } from './abilityUses';

export type SwapEvent =
    | { type: 'buffApplied'; buffType: string }
    | { type: 'abilityExhausted'; abilityId: string };

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

    const { replacesAbilityId, usesOnActivation } = ability.swapConfig;

    // Guard: only activate if the ability being replaced is currently active.
    ensureAbilityRuntimeState(unit, replacesAbilityId);
    const replacedRuntime = unit.abilityRuntime[replacesAbilityId];
    if (!replacedRuntime || replacedRuntime.active === false) return false;

    // Hide the replaced ability.
    replacedRuntime.active = false;

    // Activate this ability.
    runtime.active = true;
    runtime.replacedAbilityId = replacesAbilityId;
    runtime.currentUses = usesOnActivation ?? runtime.maxUses;

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

/**
 * Evaluate swap triggers for all abilities on a unit in response to an engine event.
 *
 * Call this:
 * - After `unit.addBuff(...)` with `{ type: 'buffApplied', buffType: buff._type }`.
 * - After `runtime.currentUses` reaches 0 with `{ type: 'abilityExhausted', abilityId }`.
 */
export function evaluateSwapTriggers(unit: Unit, event: SwapEvent, eventBus?: EventBus): void {
    let changed = false;

    if (event.type === 'buffApplied') {
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
        }
    }

    if (changed) {
        notifyAbilityBarChanged(unit, eventBus);
    }
}
