/**
 * Named DeathSequenceDef presets referenced by unit defs (`UnitDefEntry.deathSequence`).
 */

import type { DeathSequenceDef } from './deathSequenceDef';

/** Alpha wolf: remnant wipes away while dark particles burst out, then home into the party. */
export const ALPHA_WOLF_DEATH_SEQUENCE: DeathSequenceDef = {
    pauseSeconds: 5,
    pauseReason: 'alpha_wolf_death',
    remnant: { duration: 2, shakeFrequencyHz: 7, shakeAmplitudePx: 2, dissolve: 'wipe', sizePx: 42 },
    emitters: [{ type: 'alphaWolfStory', radialRatePerSecond: 24, homingRatePerSecond: 20 }],
};

/**
 * Displacer Spirit: shakes harder as it fades, while spirit clones peel off in a flame-shaped
 * plume (wide sideways launch, damped horizontally, accelerating upward).
 */
export const DISPLACER_SPIRIT_DEATH_SEQUENCE: DeathSequenceDef = {
    pauseSeconds: 3.6,
    pauseReason: 'displacer_spirit_death',
    remnant: {
        duration: 2.2,
        shakeFrequencyHz: 11,
        shakeAmplitudePx: 1,
        shakeAmplitudeEndPx: 4,
        dissolve: 'fade',
    },
    emitters: [{
        type: 'spriteFountain',
        config: {
            spriteEffectId: 'displacerCloneWisp',
            ratePerSecond: 22,
            emitSeconds: 2.0,
            centerAngle: -Math.PI / 2,
            angleSpread: Math.PI,
            angleBiasExponent: 2,
            speedMin: 70,
            speedMax: 150,
            vyMin: -25,
            vyMax: 5,
            spawnRadius: 6,
            ay: -170,
            dampingKx: 3.2,
            dampingKy: 0,
        },
    }],
};
