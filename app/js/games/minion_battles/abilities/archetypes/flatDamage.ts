/**
 * flatDamage — research-aware damage for archetype abilities with one base damage number.
 *
 * Research adds `abilityModifiers[abilityId].damageFlat` to the base (e.g. Empower Pet →
 * `ability_0701_damage` on Dog Bite). These helpers are the single place archetypes read it, for the hit
 * itself, `getDamage`, and the `{{DAMAGE}}` tooltip token.
 */
import type { Unit } from '../../game/units/Unit';
import { getAbilityDamageForDisplay } from '../damageModifiers';
import { resolveTooltipContext } from '../abilityModifierHelpers';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../tooltipTokens';

/** Base damage plus the caster's `damageFlat` research on this ability. */
export function flatDamageFor(abilityId: string, base: number, caster: Unit | undefined): number {
    return base + (caster?.abilityModifiers?.[abilityId]?.damageFlat ?? 0);
}

/** `AbilityStatic.getDamage`: flat research plus display-time damage modifiers. */
export function flatDamageGetDamage(abilityId: string, base: number): (caster?: Unit) => number {
    return (caster?: Unit) =>
        getAbilityDamageForDisplay(flatDamageFor(abilityId, base, caster), caster ? { attacker: caster } : {});
}

/**
 * `AbilityStatic.getTooltipText` with a research-aware `{{DAMAGE}}` token. Legacy `{base}` placeholders in
 * the templates are rewritten to `{{DAMAGE}}`.
 */
export function flatDamageTooltip(
    abilityId: string,
    base: number,
    getTemplates: (gameState?: unknown) => string[],
    extraBindings?: TooltipTokenBindings,
): (gameState?: unknown) => string[] {
    return (gameState?: unknown) => {
        const templates = getTemplates(gameState).map((line) =>
            line.includes('{{DAMAGE}}') ? line : line.split(`{${base}}`).join('{{DAMAGE}}'),
        );
        const tipCtx = resolveTooltipContext(gameState, { ability: { id: abilityId } });
        const bindings: TooltipTokenBindings = {
            ...extraBindings,
            DAMAGE: { kind: 'damage', base: flatDamageFor(abilityId, base, tipCtx.attacker) },
        };
        return formatTooltipLegacyLines(templates, bindings, tipCtx);
    };
}
