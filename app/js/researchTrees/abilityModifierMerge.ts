/**
 * How two `AbilityModifier`s combine: flats add, multipliers multiply, tiers and combo caps take the max,
 * tags union. Shared by research (`computeAbilityModifiersFromResearch`) and pets inheriting their
 * owner's modifiers (`inheritOwnerAbilityModifiers`). A leaf module (type imports only).
 */
import type { AbilityModifier } from './types';

/** Merge `modifier` into `entry` in place. */
export function mergeAbilityModifierInto(entry: AbilityModifier, modifier: AbilityModifier): void {
    if (modifier.damageFlat !== undefined) entry.damageFlat = (entry.damageFlat ?? 0) + modifier.damageFlat;
    if (modifier.maxUsesFlat !== undefined) entry.maxUsesFlat = (entry.maxUsesFlat ?? 0) + modifier.maxUsesFlat;
    if (modifier.roundRecoveryFlat !== undefined) {
        entry.roundRecoveryFlat = (entry.roundRecoveryFlat ?? 0) + modifier.roundRecoveryFlat;
    }
    if (modifier.explosionDamageFlat !== undefined) entry.explosionDamageFlat = (entry.explosionDamageFlat ?? 0) + modifier.explosionDamageFlat;
    if (modifier.durationMult !== undefined) entry.durationMult = (entry.durationMult ?? 1) * modifier.durationMult;
    if (modifier.rangeMult !== undefined) entry.rangeMult = (entry.rangeMult ?? 1) * modifier.rangeMult;
    if (modifier.areaMult !== undefined) entry.areaMult = (entry.areaMult ?? 1) * modifier.areaMult;
    if (modifier.repeatCountFlat !== undefined) {
        entry.repeatCountFlat = (entry.repeatCountFlat ?? 0) + modifier.repeatCountFlat;
    }
    if (modifier.tileAreaRadiusFlat !== undefined) {
        entry.tileAreaRadiusFlat = (entry.tileAreaRadiusFlat ?? 0) + modifier.tileAreaRadiusFlat;
    }
    if (modifier.resourceGainFlat !== undefined) {
        entry.resourceGainFlat = (entry.resourceGainFlat ?? 0) + modifier.resourceGainFlat;
    }
    if (modifier.resourceCostFlat !== undefined) {
        entry.resourceCostFlat = (entry.resourceCostFlat ?? 0) + modifier.resourceCostFlat;
    }
    if (modifier.knockbackTier !== undefined) entry.knockbackTier = Math.max(entry.knockbackTier ?? 0, modifier.knockbackTier);
    if (modifier.addTags?.length) {
        const existing = entry.addTags ? [...entry.addTags] : [];
        for (const tag of modifier.addTags) {
            if (!existing.includes(tag)) existing.push(tag);
        }
        entry.addTags = existing;
    }
    if (modifier.healPenaltyPctOverride !== undefined) {
        entry.healPenaltyPctOverride = entry.healPenaltyPctOverride !== undefined
            ? Math.min(entry.healPenaltyPctOverride, modifier.healPenaltyPctOverride)
            : modifier.healPenaltyPctOverride;
    }
    /** Only one source expected (Rapid Throw); take max when multiple nodes contribute. */
    if (modifier.comboMax !== undefined) {
        entry.comboMax = Math.max(entry.comboMax ?? 0, modifier.comboMax);
    }
}
