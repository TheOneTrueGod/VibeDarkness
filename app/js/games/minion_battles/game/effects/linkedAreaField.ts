/**
 * Linked area field - the visual for `LinkedAreaPulseBehaviour`: a faint outline of the area (a circle round
 * each end and the band between), a field of small slow motes drifting inside it, and a large burst of
 * motes at each pulse share. Both ends follow the live caster and linked unit. Painted by `LinkedAreaField`
 * in `effect_defs/linkedAreaEffects.ts`. Holds at a pause plane so bursts stay on the damage beats.
 */
import { Effect } from './Effect';
import { getThemeById, themeGlowPair } from '../../themes/abilityTheme';

export const LINKED_AREA_FIELD_EFFECT_TYPE = 'LinkedAreaField';

export interface LinkedAreaFieldColors {
    /** Motes and burst cores. */
    color: number;
    /** Halos, outline and the pulse flash. */
    glowColor: number;
}

export interface LinkedAreaFieldEffectData extends LinkedAreaFieldColors {
    casterId: string;
    linkId: string | null;
    /** Fallback positions once a unit is gone. */
    ax: number;
    ay: number;
    bx: number | null;
    by: number | null;
    radius: number;
    lineHalfWidth: number;
    /** Shares of the effect's life at which a pulse lands. */
    pulseShares: number[];
}

/** A theme's field colours: lighter colour for motes, darker for halos. */
export function themedLinkedAreaField(themeId: string): LinkedAreaFieldColors {
    const { light, dark } = themeGlowPair(getThemeById(themeId));
    return { color: light, glowColor: dark };
}

interface FieldUnit {
    id: string;
    x: number;
    y: number;
}

export function createLinkedAreaField(opts: {
    caster: FieldUnit;
    link: FieldUnit | null;
    radius: number;
    lineHalfWidth: number;
    seconds: number;
    pulseShares: number[];
    colors: LinkedAreaFieldColors;
}): Effect {
    const data: LinkedAreaFieldEffectData = {
        ...opts.colors,
        casterId: opts.caster.id,
        linkId: opts.link?.id ?? null,
        ax: opts.caster.x,
        ay: opts.caster.y,
        bx: opts.link?.x ?? null,
        by: opts.link?.y ?? null,
        radius: opts.radius,
        lineHalfWidth: opts.lineHalfWidth,
        pulseShares: [...opts.pulseShares],
    };
    return new Effect({
        x: opts.caster.x,
        y: opts.caster.y,
        duration: Math.max(0.05, opts.seconds),
        effectType: LINKED_AREA_FIELD_EFFECT_TYPE,
        pauseBehaviour: 'hold',
        effectData: { ...data },
    });
}
