import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';

export const IMBUED_BAT_ABILITY_ID = `${formatGroupId(AbilityGroupId.Light)}03`;

/** Forward light burst outer radius from the caster (px). */
export const LIGHT_CONE_MAX_RANGE = 100;

export function getImbuedBatLightConeMaxRange(
    caster?: { abilityModifiers?: Record<string, { rangeMult?: number }> },
): number {
    return LIGHT_CONE_MAX_RANGE * (caster?.abilityModifiers?.[IMBUED_BAT_ABILITY_ID]?.rangeMult ?? 1);
}
