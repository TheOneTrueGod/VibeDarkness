import type { Unit } from '../game/units/Unit';
import type { DamageModifier } from '../game/units/unitTypes';
import {
    DEFAULT_PASSIVE_MULT,
    getOutgoingDamageMultiplier,
    computePassiveBonuses,
} from '../../../researchTrees/passiveBonuses';
import type { ResearchNodeLevels } from '../../../researchTrees/types';
import type { TooltipResolveContext } from './tooltipTokens';
import { getStackDamageMultiplier } from '../game/units/stackRules';

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
 * Pure damage formula shared by combat and tooltips (no rounding).
 * `(base + flatAmt * abilityFlatScale) * multiplier * getStackDamageMultiplier(stackSize)`.
 */
export function applyDamageModifier(
    baseDamage: number,
    damageModifier: Pick<DamageModifier, 'flatAmt' | 'multiplier'>,
    stackSize: number = 1,
    abilityFlatScale: number = DEFAULT_DAMAGE_MODIFIER_MULTIPLIER,
): number {
    const flatPart = damageModifier.flatAmt * abilityFlatScale;
    return Math.max(
        0,
        (baseDamage + flatPart) * damageModifier.multiplier * getStackDamageMultiplier(stackSize),
    );
}

/**
 * Applies the attacker's damage modifier to base damage for a specific ability.
 * Uses {@link applyDamageModifier} then integer `Math.round` for `Unit.takeDamage`.
 * When `multiplier === 1`, this matches the historical flat Training bonus behaviour.
 */
export function getModifiedAbilityDamage(
    attacker: Unit | undefined,
    baseDamage: number,
    abilityDamageModifierMultiplier: number = DEFAULT_DAMAGE_MODIFIER_MULTIPLIER,
): number {
    if (!attacker) return Math.max(0, Math.round(baseDamage));
    return Math.max(
        0,
        Math.round(
            applyDamageModifier(
                baseDamage,
                attacker.getDamageModifier(),
                attacker.stackSize,
                abilityDamageModifierMultiplier,
            ),
        ),
    );
}

/**
 * Tooltip / display damage: same formula as combat, but **without** combat's final
 * `Math.round`. Callers should pass the result through `formatTooltipNumber`.
 *
 * Resolution: attacker → damageModifier on ctx → unmodified base.
 */
export function getAbilityDamageForDisplay(base: number, ctx: TooltipResolveContext): number {
    const abilityFlatScale = ctx.abilityFlatScale ?? DEFAULT_DAMAGE_MODIFIER_MULTIPLIER;
    if (ctx.attacker) {
        return applyDamageModifier(
            base,
            ctx.attacker.getDamageModifier(),
            ctx.attacker.stackSize,
            abilityFlatScale,
        );
    }
    if (ctx.damageModifier) {
        return applyDamageModifier(
            base,
            ctx.damageModifier,
            ctx.stackSize ?? 1,
            abilityFlatScale,
        );
    }
    return Math.max(0, base);
}

/**
 * Build the same `DamageModifier` mission spawn bakes into player combatSettings
 * (`BaseMissionDef`: the outgoing multiplier from the passive bag, i.e. all_damage and Attack).
 */
export function buildDamageModifierFromResearch(
    researchTrees: Record<string, string[]> | undefined,
    levels?: ResearchNodeLevels,
): DamageModifier {
    const passiveBonuses = computePassiveBonuses(researchTrees, levels);
    return { flatAmt: 0, multiplier: getOutgoingDamageMultiplier(passiveBonuses) };
}

/**
 * Apply caster `passiveBonuses.all_damage` only (Mighty mult) — incomplete for global damage.
 * Do **not** use in tooltips or `getDamage` helpers: use {@link getAbilityDamageForDisplay}
 * (or `{{DAMAGE}}` tokens via `formatTooltipLegacyLines`) so Training flat + Mighty both apply.
 * When `caster` is omitted, returns the base unchanged.
 */
export function applyPassiveDamageBonuses(baseDamage: number, caster?: Unit): number {
    if (!caster) return Math.max(0, Math.floor(baseDamage));
    return Math.max(0, Math.floor(baseDamage * getOutgoingDamageMultiplier(caster.passiveBonuses)));
}

/** Read the caster's all_damage mult, defaulting to 1 when absent / no caster. */
export function getAllDamagePassiveMult(caster?: Unit): number {
    return caster ? getOutgoingDamageMultiplier(caster.passiveBonuses) : DEFAULT_PASSIVE_MULT;
}
