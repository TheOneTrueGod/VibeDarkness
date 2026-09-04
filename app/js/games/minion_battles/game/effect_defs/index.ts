/**
 * Effect definitions own how effects are drawn.
 * GameRenderer calls renderEffect to create/update effect visuals; the appropriate EffectDef does the drawing.
 */

import { Container, Graphics } from 'pixi.js';
import type { Effect } from '../effects/Effect';

export type { IEffectDef, IEffectRenderContext } from './types';
import type { IEffectDef, IEffectRenderContext } from './types';

// --- Sub-module imports ---
import { punchEffectDef, biteEffectDef, slashingSwordEffectDef, coneFlashEffectDef, collisionClashEffectDef, terrainImpactEffectDef } from './impactEffects';
import { bulletTrailEffectDef, slashTrailEffectDef } from './trailEffects';
import { afterimageEffectDef, stackGhostEffectDef, nudgeArrowEffectDef } from './movementEffects';
import { explosionEffectDef } from './explosionEffects';
import { lightConeBurstEffectDef, LIGHT_CONE_BURST_EFFECT_TYPE } from './lightConeEffects';
import { chargeUpEffectDef } from './chargeEffects';
import { casterChargeUpEffectDef, CASTER_CHARGE_UP_EFFECT_TYPE } from './casterChargeUpEffect';
import { pulseEffectDef, howlShockwaveEffectDef, critShockwaveEffectDef, enrageBurstEffectDef, gravityFieldEffectDef, liftColumnEffectDef } from './aoeEffects';
import {
    darkCreatureIconDeathEffectDef,
    alphaWolfStoryRemnantEffectDef,
    storyHomingParticleEffectDef,
    particleImageEffectDef,
} from './deathEffects';
import { damageNumberEffectDef, floatingTextEffectDef } from './textEffects';
import { corruptionOrbEffectDef, torchProjectileEffectDef } from './corruptionEffects';
import { lanterniteConstParticleEffectDef, auraPulseEffectDef } from './lanterniteEffects';
import { daylightSearEffectDef, DAYLIGHT_SEAR_EFFECT_TYPE } from './dayLightEffects';
import { brambleExplosionEffectDef } from './brambleEffects';
import { spriteEffectDef } from './spriteEffectDefs';
import {
    bloodMistBurstEffectDef,
    bloodMistImpactEffectDef,
    bloodConeFlashEffectDef,
    BLOOD_MIST_BURST_EFFECT_TYPE,
    BLOOD_MIST_IMPACT_EFFECT_TYPE,
    BLOOD_CONE_FLASH_EFFECT_TYPE,
} from './bloodMageEffects';

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
    StackGhost: stackGhostEffectDef,
    punch: punchEffectDef,
    ConeFlash: coneFlashEffectDef,
    Pulse: pulseEffectDef,
    HowlShockwave: howlShockwaveEffectDef,
    CritShockwave: critShockwaveEffectDef,
    EnrageBurst: enrageBurstEffectDef,
    ChargeUpEffect: chargeUpEffectDef,
    [CASTER_CHARGE_UP_EFFECT_TYPE]: casterChargeUpEffectDef,
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
    Explosion: explosionEffectDef,
    [LIGHT_CONE_BURST_EFFECT_TYPE]: lightConeBurstEffectDef,
    DamageNumber: damageNumberEffectDef,
    FloatingText: floatingTextEffectDef,
    LanterniteConstParticle: lanterniteConstParticleEffectDef,
    AuraPulse: auraPulseEffectDef,
    [DAYLIGHT_SEAR_EFFECT_TYPE]: daylightSearEffectDef,
    BrambleExplosion: brambleExplosionEffectDef,
    SpriteEffect: spriteEffectDef,
    GravityField: gravityFieldEffectDef,
    NudgeArrow: nudgeArrowEffectDef,
    CollisionClash: collisionClashEffectDef,
    TerrainImpact: terrainImpactEffectDef,
    LiftColumn: liftColumnEffectDef,
    [BLOOD_MIST_BURST_EFFECT_TYPE]: bloodMistBurstEffectDef,
    [BLOOD_MIST_IMPACT_EFFECT_TYPE]: bloodMistImpactEffectDef,
    [BLOOD_CONE_FLASH_EFFECT_TYPE]: bloodConeFlashEffectDef,
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
