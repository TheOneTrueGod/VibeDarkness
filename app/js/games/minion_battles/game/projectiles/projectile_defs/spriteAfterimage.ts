/**
 * Sprite afterimages — shared, Pixi-free pieces of `SpriteProjectileConfig.afterimage`.
 *
 * Emission lives in `game/effects/projectileAfterimages.ts` (render tick, wall time); drawing lives in
 * `game/effect_defs/projectileAfterimageEffects.ts`. This file holds the presets, the effect type and its data,
 * and the sprite rotation both the live projectile and its copies use, so a copy matches the frame it left.
 */

import type { SpriteAfterimageDef, SpriteFramesDef, SpriteProjectileConfig } from './types';

export const SPRITE_AFTERIMAGE_EFFECT_TYPE = 'SpriteAfterimage';

/** Named presets. */
export const SPRITE_AFTERIMAGE_PRESETS = {
    /** Thrown armory weapons: a quick, dense smear of spinning copies. */
    thrownWeapon: {
        ratePerSec: 30,
        durationSec: 0.18,
        initialAlpha: 0.45,
        driftPx: 10,
    },
} as const satisfies Record<string, SpriteAfterimageDef>;

export interface SpriteAfterimageEffectData {
    sprite: SpriteFramesDef;
    /** Radians, the sprite's rotation when the copy spawned. */
    rotation: number;
    initialAlpha: number;
    tint?: number;
}

/**
 * Rotation (radians) of a sprite projectile's visual. Mirrors `spriteProjectileDef.applyAnimations` plus the
 * `Projectile.rotationSpeed` override applied by `ProjectileRenderer`.
 */
export function resolveSpriteRotation(
    proj: { velocityX: number; velocityY: number; rotationSpeed?: number; rotation: number },
    config: SpriteProjectileConfig,
    gameTime: number,
): number {
    if (proj.rotationSpeed) return (proj.rotation * Math.PI) / 180;
    let rotation = 0;
    for (const anim of config.animations ?? []) {
        if (anim.type !== 'rotation') continue;
        if (anim.mode === 'velocity-facing') {
            rotation = Math.atan2(proj.velocityY, proj.velocityX) + Math.PI / 2;
        } else if (anim.mode === 'constant') {
            rotation = (gameTime * anim.degreesPerSecond * Math.PI / 180) % (Math.PI * 2);
        }
    }
    return rotation;
}
