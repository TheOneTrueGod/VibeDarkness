import type { AbilityModifier } from '../../../researchTrees/types';
import type { Unit } from '../game/units/Unit';

interface EngineWithLocalUnit {
    getLocalPlayerUnit?(): Unit | null;
}

/**
 * Returns the aggregated AbilityModifier for a given ability, resolving from the caster when
 * available (for doCardEffect, beginActiveCast, etc.) or from the engine's local player unit
 * (for getTooltipText where no caster is passed). Falls back to an empty object.
 *
 * Usage in getTooltipText:
 *   const mod = getAbilityModifier(gameState, undefined, CARD_ID);
 *
 * Usage in doCardEffect:
 *   const mod = caster.abilityModifiers[CARD_ID] ?? {};  // direct access is preferred
 */
export function getAbilityModifier(
    gameState: unknown,
    caster: Unit | undefined,
    abilityId: string,
): AbilityModifier {
    if (caster) return caster.abilityModifiers[abilityId] ?? {};
    const eng = gameState as EngineWithLocalUnit | undefined;
    return eng?.getLocalPlayerUnit?.()?.abilityModifiers[abilityId] ?? {};
}
