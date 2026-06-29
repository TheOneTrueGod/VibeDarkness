/**
 * abilitySwap.ts — Swap network evaluator.
 *
 * Activates and deactivates abilities in the swap network in response to
 * engine events. Pure logic; no side effects on import.
 *
 * Entry point: `evaluateSwapTriggers(unit, event)`.
 */

import type { Unit } from '../game/units/Unit';
import { getAbility } from './AbilityRegistry';
import { ensureAbilityRuntimeState } from './abilityUses';

export type SwapEvent =
    | { type: 'buffApplied'; buffType: string }
    | { type: 'abilityExhausted'; abilityId: string };

/**
 * Activate a swap-network ability: hide the ability it replaces and
 * mark itself active with the configured number of uses.
 */
function activateSwappedAbility(unit: Unit, abilityId: string): void {
    ensureAbilityRuntimeState(unit, abilityId);
    const runtime = unit.abilityRuntime[abilityId];
    if (!runtime) return;

    const ability = getAbility(abilityId);
    if (!ability?.swapConfig) return;

    const { replacesAbilityId, usesOnActivation } = ability.swapConfig;

    // Guard: only activate if the ability being replaced is currently active.
    ensureAbilityRuntimeState(unit, replacesAbilityId);
    const replacedRuntime = unit.abilityRuntime[replacesAbilityId];
    if (!replacedRuntime || replacedRuntime.active === false) return;

    // Hide the replaced ability.
    replacedRuntime.active = false;

    // Activate this ability.
    runtime.active = true;
    runtime.replacedAbilityId = replacesAbilityId;
    runtime.currentUses = usesOnActivation ?? runtime.maxUses;
}

/**
 * Deactivate a swap-network ability: restore the ability it replaced and
 * clear its own swap state.
 */
function deactivateSwappedAbility(unit: Unit, abilityId: string): void {
    const runtime = unit.abilityRuntime[abilityId];
    if (!runtime) return;

    const { replacedAbilityId } = runtime;
    if (replacedAbilityId === null || replacedAbilityId === undefined) return;

    // Restore the replaced ability.
    ensureAbilityRuntimeState(unit, replacedAbilityId);
    const replacedRuntime = unit.abilityRuntime[replacedAbilityId];
    if (replacedRuntime) {
        replacedRuntime.active = true;
    }

    // Clear this ability's swap state.
    runtime.active = false;
    runtime.replacedAbilityId = null;
}

/**
 * Evaluate swap triggers for all abilities on a unit in response to an engine event.
 *
 * Call this:
 * - After `unit.addBuff(...)` with `{ type: 'buffApplied', buffType: buff._type }`.
 * - After `runtime.currentUses` reaches 0 with `{ type: 'abilityExhausted', abilityId }`.
 */
export function evaluateSwapTriggers(unit: Unit, event: SwapEvent): void {
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
                activateSwappedAbility(unit, abilityId);
            }
        }
        return;
    }

    if (event.type === 'abilityExhausted') {
        const ability = getAbility(event.abilityId);
        if (!ability?.swapConfig) return;

        const { deactivateTrigger } = ability.swapConfig;
        if (deactivateTrigger.type === 'selfExhausted') {
            deactivateSwappedAbility(unit, event.abilityId);
        }
        // selfUsed is not handled by exhaustion events — it fires immediately after each use.
    }
}
