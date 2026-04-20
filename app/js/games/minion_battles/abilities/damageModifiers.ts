import type { Unit } from '../game/units/Unit';

export const DEFAULT_DAMAGE_MODIFIER_MULTIPLIER = 1;

/**
 * Per-ability overrides to avoid multi-counting flat damage bonuses on multi-hit skills.
 * Keep overrides centralized here for visibility.
 */
export const ABILITY_DAMAGE_MODIFIER_MULTIPLIER_OVERRIDES: Record<string, number> = {
    // Beast Claw does a double slash.
    '0511': 0.5,
    // Pistol fires three shots.
    '0203': 1 / 3,
    // Shotgun fires five pellets.
    '0205': 0.2,
};

/**
 * Applies the attacker's damage modifier to base damage for a specific ability.
 * Returns integer damage suitable for `Unit.takeDamage`.
 */
export function getModifiedAbilityDamage(
    attacker: Unit | undefined,
    baseDamage: number,
    abilityDamageModifierMultiplier: number = DEFAULT_DAMAGE_MODIFIER_MULTIPLIER,
): number {
    if (!attacker) return Math.max(0, Math.round(baseDamage));
    const damageModifier = attacker.getDamageModifier();
    const flatBonus = damageModifier.flatAmt * damageModifier.multiplier * abilityDamageModifierMultiplier;
    return Math.max(0, Math.round(baseDamage + flatBonus));
}
