import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';

export const GATHER_LIGHT_ABILITY_ID = `${formatGroupId(AbilityGroupId.Light)}04`;

export const GATHER_LIGHT_AMOUNT = 2;
/** Extra Light gained when Devour Light succeeds. */
export const GATHER_LIGHT_DEVOUR_BONUS = 1;
/** Darkness applied per Light granted (negative light on each chosen tile). */
export const GATHER_LIGHT_DARKNESS_PER_LIGHT_GAINED = 0.5;

export function getGatherLightAmount(
    caster?: { abilityModifiers?: Record<string, { resourceGainFlat?: number }> },
): number {
    return GATHER_LIGHT_AMOUNT + (caster?.abilityModifiers?.[GATHER_LIGHT_ABILITY_ID]?.resourceGainFlat ?? 0);
}

export function getGatherLightDarknessAmount(lightGained: number): number {
    return -GATHER_LIGHT_DARKNESS_PER_LIGHT_GAINED * Math.max(0, lightGained);
}

/** Bright magnitude of the light source dropped at the caster (same preset as Light Blast). */
export const GATHER_LIGHT_BRIGHT_MAGNITUDE = 1;
/** Marker alpha multiplier for the dropped light source (+50%); render-only. */
export const GATHER_LIGHT_BRIGHT_ALPHA_SCALE = 1.5;
