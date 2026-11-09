/**
 * Command cue - the visual for a unit commanding another (the player commanding their spirit animal): a
 * stream of motes arcs from the commander to the commanded unit, following both, then bursts round it.
 * Painted by `CommandCue` in `effect_defs/commandEffects.ts`.
 *
 * Every pet command goes through `abilities/petCommands.ts`, which plays this once per commanded pet, so
 * every order (Pet, Sic 'em, Bramble Patch, Order: Attack, Order: Move) shares one look. Colours come from
 * a theme (Command by default), so another commander family can reuse it with its own palette.
 */
import { Effect } from './Effect';
import { getThemeById, themeGlowPair } from '../../themes/abilityTheme';

export const COMMAND_CUE_EFFECT_TYPE = 'CommandCue';

/** Wall-ish seconds the cue plays (stream, then burst). */
export const COMMAND_CUE_DURATION = 0.55;

export interface CommandCueEffectData {
    /** The commanding unit; the stream falls back to `fromX/fromY` once it is gone. */
    fromUnitId: string;
    /** The commanded unit. */
    toUnitId: string;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    moteColor: number;
    glowColor: number;
    /** Motes in the stream. */
    count: number;
}

interface CueUnit {
    id: string;
    x: number;
    y: number;
}

/**
 * The cue from `from` to `to`, in `themeId` colours. Pure; does not add it anywhere. Keeps playing at a
 * pause plane (`pauseBehaviour: 'continue'`), since orders are usually given while the battle is paused.
 */
export function createCommandCue(from: CueUnit, to: CueUnit, themeId = 'command'): Effect {
    const { light, dark } = themeGlowPair(getThemeById(themeId));
    const data: CommandCueEffectData = {
        fromUnitId: from.id,
        toUnitId: to.id,
        fromX: from.x,
        fromY: from.y,
        toX: to.x,
        toY: to.y,
        moteColor: light,
        glowColor: dark,
        count: 7,
    };
    return new Effect({
        x: from.x,
        y: from.y,
        duration: COMMAND_CUE_DURATION,
        effectType: COMMAND_CUE_EFFECT_TYPE,
        pauseBehaviour: 'continue',
        effectData: { ...data },
    });
}
