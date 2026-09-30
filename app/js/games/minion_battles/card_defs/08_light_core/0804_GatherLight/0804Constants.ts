import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';

export const GATHER_LIGHT_ABILITY_ID = `${formatGroupId(AbilityGroupId.Light)}04`;

export const GATHER_LIGHT_AMOUNT = 1;
/** Darkness applied per Light granted (negative light on the 3×3). */
export const GATHER_LIGHT_DARKNESS_PER_LIGHT_GAINED = 0.5;

export function getGatherLightAmount(
    caster?: { abilityModifiers?: Record<string, { resourceGainFlat?: number }> },
): number {
    return GATHER_LIGHT_AMOUNT + (caster?.abilityModifiers?.[GATHER_LIGHT_ABILITY_ID]?.resourceGainFlat ?? 0);
}

export function getGatherLightDarknessAmount(lightGained: number): number {
    return -GATHER_LIGHT_DARKNESS_PER_LIGHT_GAINED * Math.max(0, lightGained);
}
