/**
 * DeathSequenceDef — a cinematic death (usually a boss): gameplay pauses, the sequence plays,
 * then gameplay resumes (victory/defeat checks run again when the pause ends).
 *
 * Attached per character via `UnitDefEntry.deathSequence`; replaces `onDeathVisualEffects`
 * for that unit. Applied from the engine's `unit_died` listener by `applyDeathSequence`.
 */

import type { VisualEffectDef } from '../effects/visualEffectDef';
import type { SpriteFountainConfig } from '../effects/SpriteFountainEmitter';
import type { DeathRemnantEffectData } from '../effect_defs/deathEffects';

/** The dying unit's sprite left behind, shaking and dissolving. */
export interface DeathRemnantDef extends Omit<DeathRemnantEffectData, 'remnantCharacterKey'> {
    /** Seconds the remnant lasts. */
    duration: number;
    /** Sprite key to draw; defaults to the dying unit's characterId. */
    characterSpriteKey?: string;
}

export type DeathSequenceEmitterDef =
    /** Radial dark burst, then homing particles into living player units. */
    | { type: 'alphaWolfStory'; radialRatePerSecond: number; homingRatePerSecond: number }
    /** Stream of named SpriteEffects; see SpriteFountainEmitter. */
    | { type: 'spriteFountain'; config: SpriteFountainConfig };

export interface DeathSequenceDef {
    /** Story-pause length (game seconds). Should cover the whole animation. */
    pauseSeconds: number;
    /** Story-pause reason string (surfaced on engine.storyPauseReason). */
    pauseReason: string;
    remnant?: DeathRemnantDef;
    emitters?: DeathSequenceEmitterDef[];
    /** Extra one-shot visuals at the unit's position. */
    visualEffects?: VisualEffectDef[];
}
