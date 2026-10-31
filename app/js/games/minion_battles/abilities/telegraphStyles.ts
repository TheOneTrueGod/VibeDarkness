/**
 * Named telegraph palettes for ground previews (tile areas, rock picks, arrows).
 *
 * Use these instead of inline hex values so that abilities with the same visual language stay in step.
 */

import { getAbilityTheme, getThemeById } from '../themes/abilityTheme';

export interface TelegraphStyle {
    color: number;
    lineWidth: number;
    fillAlpha: number;
    strokeAlpha: number;
}

export const TELEGRAPH_STYLES: {
    readonly danger: TelegraphStyle;
    readonly earth: TelegraphStyle;
    readonly invalid: TelegraphStyle;
} = {
    /** Red telegraph used by Stone Tomb and Rock Slide. */
    danger: { color: 0xff2a2a, lineWidth: 2, fillAlpha: 0.12, strokeAlpha: 0.9 },
    /** Amber telegraph used by Gather Stone. */
    earth: { color: getThemeById('earth').primaryNum, lineWidth: 2, fillAlpha: 0.14, strokeAlpha: 0.6 },
    /** Grey preview for a pick the ability would reject (`validatePick` false). */
    invalid: { color: 0x9ca3af, lineWidth: 2, fillAlpha: 0.16, strokeAlpha: 0.7 },
};

/**
 * Ground telegraph in the ability's theme primary (the "mass" role), with the same widths and alphas
 * as {@link TELEGRAPH_STYLES.earth}. Groups without a theme get the `generic` primary.
 */
export function themedTelegraphStyle(abilityId: string): TelegraphStyle {
    return { ...TELEGRAPH_STYLES.earth, color: getAbilityTheme(abilityId).primaryNum };
}
