import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';

export const LIGHT_BLAST_ABILITY_ID = `${formatGroupId(AbilityGroupId.Light)}01`;

/** FireLight leftover at the blast point — Bright 3 (amount 4, radius 2, 3 rounds). */
export const LIGHT_BLAST_BRIGHT_MAGNITUDE = 3;

export const LIGHT_BLAST_RADIUS = 40;

export function getLightBlastRadius(
    caster?: { abilityModifiers?: Record<string, { rangeMult?: number }> },
): number {
    return LIGHT_BLAST_RADIUS * (caster?.abilityModifiers?.[LIGHT_BLAST_ABILITY_ID]?.rangeMult ?? 1);
}
