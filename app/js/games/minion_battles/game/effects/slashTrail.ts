/**
 * Slash trail - a bright cut left along a fast straight dash (e.g. the spirit's dash strikes): it grows from
 * the start to the end over the dash, then thins and fades. Painted by `SpiritSlash` in
 * `effect_defs/spiritSlashEffects.ts`. Purely visual.
 */
import { Effect } from './Effect';
import { getThemeById, themeGlowPair } from '../../themes/abilityTheme';

export const SPIRIT_SLASH_EFFECT_TYPE = 'SpiritSlash';

/** Seconds the slash lingers after the dash reaches its end. */
export const SLASH_TRAIL_FADE_SECONDS = 0.3;

export interface SlashTrailColors {
    /** Bright core of the cut. */
    color: number;
    /** Wide soft edge. */
    glowColor: number;
}

export interface SlashTrailEffectData extends SlashTrailColors {
    /** End of the cut, relative to the effect's position (its start). */
    dx: number;
    dy: number;
    /** Share of the effect's life the cut takes to grow to full length. */
    growShare: number;
}

/** A theme's slash colours: its lighter colour as the core, its darker as the glow. */
export function themedSlashTrail(themeId: string): SlashTrailColors {
    const { light, dark } = themeGlowPair(getThemeById(themeId));
    return { color: light, glowColor: dark };
}

/** The slash from `start` to `end`, growing over `growSeconds` then fading. Pure; does not add it. */
export function createSlashTrail(
    start: { x: number; y: number },
    end: { x: number; y: number },
    growSeconds: number,
    colors: SlashTrailColors,
): Effect {
    const duration = Math.max(0.01, growSeconds) + SLASH_TRAIL_FADE_SECONDS;
    const data: SlashTrailEffectData = {
        ...colors,
        dx: end.x - start.x,
        dy: end.y - start.y,
        growShare: Math.max(0.01, growSeconds) / duration,
    };
    return new Effect({
        x: start.x,
        y: start.y,
        duration,
        effectType: SPIRIT_SLASH_EFFECT_TYPE,
        effectData: { ...data },
    });
}
