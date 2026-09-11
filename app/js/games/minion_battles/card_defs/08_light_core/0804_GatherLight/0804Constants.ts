import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';

export const GATHER_LIGHT_ABILITY_ID = `${formatGroupId(AbilityGroupId.Light)}04`;

export const GATHER_LIGHT_AMOUNT = 1;

export function getGatherLightAmount(
    caster?: { abilityModifiers?: Record<string, { resourceGainFlat?: number }> },
): number {
    return GATHER_LIGHT_AMOUNT + (caster?.abilityModifiers?.[GATHER_LIGHT_ABILITY_ID]?.resourceGainFlat ?? 0);
}
