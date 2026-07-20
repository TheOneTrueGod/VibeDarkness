import type { Unit } from '../game/units/Unit';
import { DEFAULT_PASSIVE_MULT, applyPassiveBonusToBase } from '../../../researchTrees/passiveBonuses';

export const DEFAULT_DAMAGE_MODIFIER_MULTIPLIER = 1;

/**
 * Per-ability overrides to avoid multi-counting flat damage bonuses on multi-hit skills.
 * Keep overrides centralized here for visibility.
 */
export const ABILITY_DAMAGE_MODIFIER_MULTIPLIER_OVERRIDES: Record<string, number> = {
    // Beast Claw does a double slash.
    '0611': 0.5,
    // Pistol fires three shots.
    '0203': 1 / 3,
    // Shotgun fires five pellets.
    '0205': 0.2,
};

/**
 * Applies the attacker's damage modifier to base damage for a specific ability.
 * Formula: `(baseDamage + flatAmt * abilityFlatScale) * multiplier * stackSize`.
 * When `multiplier === 1`, this matches the historical flat Training bonus behaviour.
 * Returns integer damage suitable for `Unit.takeDamage`.
 */
export function getModifiedAbilityDamage(
    attacker: Unit | undefined,
    baseDamage: number,
    abilityDamageModifierMultiplier: number = DEFAULT_DAMAGE_MODIFIER_MULTIPLIER,
): number {
    if (!attacker) return Math.max(0, Math.round(baseDamage));
    const damageModifier = attacker.getDamageModifier();
    const flatPart = damageModifier.flatAmt * abilityDamageModifierMultiplier;
    return Math.max(
        0,
        Math.round((baseDamage + flatPart) * damageModifier.multiplier * attacker.stackSize),
    );
}

/**
 * Apply caster `passiveBonuses.all_damage` to a raw ability base (tooltips / getDamage helpers).
 * When `caster` is omitted, returns the base unchanged (no passive bonuses).
 */
export function applyPassiveDamageBonuses(baseDamage: number, caster?: Unit): number {
    if (!caster) return Math.max(0, Math.floor(baseDamage));
    return Math.max(0, applyPassiveBonusToBase(baseDamage, caster.passiveBonuses?.all_damage));
}

/** Read the caster's all_damage mult, defaulting to 1 when absent / no caster. */
export function getAllDamagePassiveMult(caster?: Unit): number {
    return caster?.passiveBonuses?.all_damage?.mult ?? DEFAULT_PASSIVE_MULT;
}
