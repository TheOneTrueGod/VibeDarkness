/**
 * Effect definitions own how effects are drawn.
 * GameRenderer calls renderEffect to create/update effect visuals; the appropriate EffectDef does the drawing.
 */

import { Container, Graphics } from 'pixi.js';
import type { Effect } from '../effects/Effect';

export type { IEffectDef, IEffectRenderContext } from './types';
import type { IEffectDef, IEffectRenderContext } from './types';

// --- Sub-module imports ---
import { punchEffectDef, biteEffectDef, slashingSwordEffectDef, coneFlashEffectDef } from './impactEffects';
import { bulletTrailEffectDef, slashTrailEffectDef } from './trailEffects';
import { afterimageEffectDef } from './movementEffects';
import { chargedRockExplosionEffectDef, energyBlastExplosionEffectDef } from './explosionEffects';
import { chargeUpEffectDef } from './chargeEffects';
import { pulseEffectDef, howlShockwaveEffectDef, critShockwaveEffectDef, enrageBurstEffectDef } from './aoeEffects';
import {
    darkCreatureIconDeathEffectDef,
    alphaWolfStoryRemnantEffectDef,
    storyHomingParticleEffectDef,
    particleImageEffectDef,
} from './deathEffects';
import { damageNumberEffectDef, floatingTextEffectDef } from './textEffects';
import { corruptionOrbEffectDef, torchProjectileEffectDef } from './corruptionEffects';
import { lanterniteConstParticleEffectDef, auraPulseEffectDef } from './lanterniteEffects';
import { brambleExplosionEffectDef } from './brambleEffects';

/** Default effect: expanding ring that fades out. */
const defaultEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const alpha = 1 - effect.progress;
        const radius = 10 + effect.progress * 30;
        g.circle(0, 0, radius);
        g.stroke({ color: 0xffd700, width: 2, alpha });
    },
};

export const effectDefRegistry: Record<string, IEffectDef> = {
    default: defaultEffectDef,
    Afterimage: afterimageEffectDef,
    punch: punchEffectDef,
    ConeFlash: coneFlashEffectDef,
    Pulse: pulseEffectDef,
    HowlShockwave: howlShockwaveEffectDef,
    CritShockwave: critShockwaveEffectDef,
    EnrageBurst: enrageBurstEffectDef,
    ChargeUpEffect: chargeUpEffectDef,
    AlphaWolfStoryRemnant: alphaWolfStoryRemnantEffectDef,
    DarkCreatureIconDeath: darkCreatureIconDeathEffectDef,
    StoryHomingParticle: storyHomingParticleEffectDef,
    bite: biteEffectDef,
    CorruptionOrb: corruptionOrbEffectDef,
    TorchProjectile: torchProjectileEffectDef,
    ParticleImage: particleImageEffectDef,
    RockChipParticle: particleImageEffectDef,
    BulletTrail: bulletTrailEffectDef,
    SlashingSword: slashingSwordEffectDef,
    SlashTrail: slashTrailEffectDef,
    ChargedRockExplosion: chargedRockExplosionEffectDef,
    EnergyBlastExplosion: energyBlastExplosionEffectDef,
    DamageNumber: damageNumberEffectDef,
    FloatingText: floatingTextEffectDef,
    LanterniteConstParticle: lanterniteConstParticleEffectDef,
    AuraPulse: auraPulseEffectDef,
    BrambleExplosion: brambleExplosionEffectDef,
};

/** Get the effect def for an effect type. Falls back to default. */
export function getEffectDef(effectType: string): IEffectDef {
    return effectDefRegistry[effectType] ?? defaultEffectDef;
}

/**
 * Create an effect visual. Uses the effect's effectType to look up the EffectDef and delegates drawing.
 */
export function createEffectVisual(effect: Effect, context: IEffectRenderContext): Container {
    const def = getEffectDef(effect.effectType);
    return def.createVisual(effect, context);
}

/**
 * Update an effect visual for the current frame. Call each frame from GameRenderer.
 */
export function updateEffectVisual(visual: Container, effect: Effect, context: IEffectRenderContext): void {
    const def = getEffectDef(effect.effectType);
    def.updateVisual(visual, effect, context);
}
