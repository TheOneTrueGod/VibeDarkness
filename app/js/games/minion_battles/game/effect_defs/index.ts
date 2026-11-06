/**
 * Effect definitions own how effects are drawn.
 * GameRenderer calls renderEffect to create/update effect visuals; the appropriate EffectDef does the drawing.
 */

import { Container, Graphics } from 'pixi.js';
import type { Effect } from '../effects/Effect';

import { ARC_SEGMENT_EFFECT_TYPE, arcSegmentEffectDef } from './arcSegmentEffects';
import { GROUND_SLAM_EFFECT_TYPE, groundSlamEffectDef } from './groundSlamEffects';
import { CHAIN_LINK_EFFECT_TYPE, chainLinkEffectDef } from './chainEffects';
import { BEAM_SEGMENT_EFFECT_TYPE, beamSegmentEffectDef } from './beamEffects';
import {
    LIGHTNING_BOLT_EFFECT_TYPE,
    STORM_SPARK_EFFECT_TYPE,
    lightningBoltEffectDef,
    stormSparkEffectDef,
} from './stormEffects';
export type { IEffectDef, IEffectRenderContext } from './types';
import type { IEffectDef, IEffectRenderContext } from './types';

// --- Sub-module imports ---
import { punchEffectDef, biteEffectDef, slashingSwordEffectDef, coneFlashEffectDef, collisionClashEffectDef, terrainImpactEffectDef } from './impactEffects';
import { bulletTrailEffectDef, slashTrailEffectDef } from './trailEffects';
import { afterimageEffectDef, stackGhostEffectDef, nudgeArrowEffectDef } from './movementEffects';
import { explosionEffectDef } from './explosionEffects';
import { spriteAfterimageEffectDef } from './projectileAfterimageEffects';
import { SPRITE_AFTERIMAGE_EFFECT_TYPE } from '../projectiles/projectile_defs/spriteAfterimage';
import { lightConeBurstEffectDef, LIGHT_CONE_BURST_EFFECT_TYPE } from './lightConeEffects';
import { chargeUpEffectDef } from './chargeEffects';
import { casterChargeUpEffectDef, CASTER_CHARGE_UP_EFFECT_TYPE } from './casterChargeUpEffect';
import { pulseEffectDef, howlShockwaveEffectDef, critShockwaveEffectDef, enrageBurstEffectDef, gravityFieldEffectDef, liftColumnEffectDef } from './aoeEffects';
import {
    darkCreatureIconDeathEffectDef,
    deathRemnantEffectDef,
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
    coneCollapseEffectDef,
    tetherRibbonEffectDef,
    flingTrailEffectDef,
    CONE_COLLAPSE_EFFECT_TYPE,
    TETHER_RIBBON_EFFECT_TYPE,
    FLING_TRAIL_EFFECT_TYPE,
} from './collapseEffects';
import {
    bloodMistBurstEffectDef,
    bloodMistImpactEffectDef,
    bloodConeFlashEffectDef,
    BLOOD_MIST_BURST_EFFECT_TYPE,
    BLOOD_MIST_IMPACT_EFFECT_TYPE,
    BLOOD_CONE_FLASH_EFFECT_TYPE,
} from './bloodMageEffects';
import { CLAW_SLASH_EFFECT_TYPE, clawSlashEffectDef } from './clawSlashEffects';
import { tempoOrbEffectDef, tempoSpeedLineEffectDef } from './tempoAuraEffects';
import { TEMPO_ORB_EFFECT_TYPE, TEMPO_SPEED_LINE_EFFECT_TYPE } from '../effects/buffParticleAura';
import {
    weaponDiscardArcEffectDef,
    weaponOrbitEffectDef,
    weaponWhirlEffectDef,
    WEAPON_DISCARD_ARC_EFFECT_TYPE,
    WEAPON_ORBIT_EFFECT_TYPE,
    WEAPON_WHIRL_EFFECT_TYPE,
} from './weaponEffects';

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
    [SPRITE_AFTERIMAGE_EFFECT_TYPE]: spriteAfterimageEffectDef,
    punch: punchEffectDef,
    ConeFlash: coneFlashEffectDef,
    Pulse: pulseEffectDef,
    HowlShockwave: howlShockwaveEffectDef,
    CritShockwave: critShockwaveEffectDef,
    EnrageBurst: enrageBurstEffectDef,
    ChargeUpEffect: chargeUpEffectDef,
    [CASTER_CHARGE_UP_EFFECT_TYPE]: casterChargeUpEffectDef,
    DeathRemnant: deathRemnantEffectDef,
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
    [CONE_COLLAPSE_EFFECT_TYPE]: coneCollapseEffectDef,
    [TETHER_RIBBON_EFFECT_TYPE]: tetherRibbonEffectDef,
    [FLING_TRAIL_EFFECT_TYPE]: flingTrailEffectDef,
    [BLOOD_MIST_BURST_EFFECT_TYPE]: bloodMistBurstEffectDef,
    [BLOOD_MIST_IMPACT_EFFECT_TYPE]: bloodMistImpactEffectDef,
    [BLOOD_CONE_FLASH_EFFECT_TYPE]: bloodConeFlashEffectDef,
    [CLAW_SLASH_EFFECT_TYPE]: clawSlashEffectDef,
    [TEMPO_ORB_EFFECT_TYPE]: tempoOrbEffectDef,
    [TEMPO_SPEED_LINE_EFFECT_TYPE]: tempoSpeedLineEffectDef,
    [WEAPON_ORBIT_EFFECT_TYPE]: weaponOrbitEffectDef,
    [WEAPON_DISCARD_ARC_EFFECT_TYPE]: weaponDiscardArcEffectDef,
    [WEAPON_WHIRL_EFFECT_TYPE]: weaponWhirlEffectDef,
    [ARC_SEGMENT_EFFECT_TYPE]: arcSegmentEffectDef,
    [GROUND_SLAM_EFFECT_TYPE]: groundSlamEffectDef,
    [CHAIN_LINK_EFFECT_TYPE]: chainLinkEffectDef,
    [BEAM_SEGMENT_EFFECT_TYPE]: beamSegmentEffectDef,
    [LIGHTNING_BOLT_EFFECT_TYPE]: lightningBoltEffectDef,
    [STORM_SPARK_EFFECT_TYPE]: stormSparkEffectDef,
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
