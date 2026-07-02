/**
 * Shared helpers for one-off effects in abilities (draw cards, deactivate projectile on block, etc.).
 * Use these so ability files stay minimal and read like a list of behaviours.
 */

import type { Unit } from '../game/units/Unit';
import type { AttackBlockedInfo } from './Ability';
import type { TerrainManager } from '../terrain/TerrainManager';
import { computeForcedDisplacement } from '../game/forceMove';
import { Effect } from '../game/effects/Effect';
import { SPRITE_EFFECT_DEFS, type SpriteEffectDef } from '../game/effect_defs/spriteEffectDefs';

/** Default slash trail color (light cyan). */
const DEFAULT_SLASH_TRAIL_COLOR = 0x7fdfef;

/**
 * Create a slash trail effect: thick fading line from (startX, startY) to (endX, endY).
 * Used by LaserSword and BeastClaw. Color defaults to light cyan; pass color for BeastClaw (amber).
 * @param delay - Optional delay in seconds before the effect starts.
 */
export function createSlashTrailEffect(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    duration: number,
    thickness: number,
    color: number = DEFAULT_SLASH_TRAIL_COLOR,
    delay?: number,
): Effect {
    return new Effect({
        x: startX,
        y: startY,
        duration,
        effectType: 'SlashTrail',
        effectRadius: thickness,
        effectData: { endX, endY, color },
        delay,
    });
}

/**
 * Find the nearest alive ally (same team, not self) to the caster.
 */
export function getNearestAlly(units: Unit[], caster: Unit): Unit | null {
    let nearest: Unit | null = null;
    let nearestDistSq = Infinity;
    for (const u of units) {
        if (!u.isAlive() || u.id === caster.id || u.teamId !== caster.teamId) continue;
        const dx = u.x - caster.x;
        const dy = u.y - caster.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < nearestDistSq) {
            nearestDistSq = d2;
            nearest = u;
        }
    }
    return nearest;
}


/** Deactivate a projectile when this ability's attack is blocked. Use in onAttackBlocked for projectile abilities. */
export function deactivateProjectileOnBlock(attackInfo: AttackBlockedInfo): void {
    if (attackInfo.type === 'projectile' && attackInfo.projectile) {
        (attackInfo.projectile as { active: boolean }).active = false;
    }
}

export interface ApplyForcedDisplacementOptions {
    terrainManager?: TerrainManager | null;
    /** Step size (px) when testing passability along the path. */
    step?: number;
}

/**
 * Move a unit toward a target position by a given distance, respecting terrain.
 * Uses computeForcedDisplacement and unit.moveUnit. Caller should invalidate movement path if needed.
 */
export function applyForcedDisplacementToward(
    engine: unknown,
    caster: Unit,
    targetX: number,
    targetY: number,
    moveDistance: number,
    options: ApplyForcedDisplacementOptions = {},
): void {
    const terrainManager = (engine as { terrainManager?: TerrainManager | null }).terrainManager ?? null;
    const { distance } = computeForcedDisplacement(
        caster.x,
        caster.y,
        targetX,
        targetY,
        moveDistance,
        { terrainManager, step: options.step ?? 4 },
    );
    if (distance <= 0) return;
    caster.invalidateMovementPath();
    caster.moveUnit(targetX, targetY, distance);
}

/** Engine interface required by spawnSpriteEffect. */
interface EffectEngine {
    addEffect(effect: Effect): void;
}

/**
 * Spawn a named, def-based sprite effect at the given world position.
 *
 * `defId` must be a key in `SPRITE_EFFECT_DEFS`. Per-call `overrides` can
 * customise appearance (tint, scale, fadeOut, rotation) or supply motion
 * data (vx, vy, ay, dampingK) — these are stored in effectData and handled
 * by Effect.ts's renderUpdate, exactly like ParticleImage.
 *
 * The `aimX` / `aimY` overrides compute an aim angle for `rotation: 'aim'`
 * defs; pass them when the visual should point toward a target.
 */
export function spawnSpriteEffect(
    engine: EffectEngine,
    defId: string,
    x: number,
    y: number,
    overrides?: Partial<SpriteEffectDef> & {
        /** Motion: horizontal velocity (px/s). */
        vx?: number;
        /** Motion: vertical velocity (px/s). */
        vy?: number;
        /** Motion: vertical acceleration (px/s²). */
        ay?: number;
        /** Motion: exponential velocity damping coefficient (1/s). Default: 8. */
        dampingK?: number;
        /** Rotation target for rotation:'aim' defs. */
        aimX?: number;
        /** Rotation target for rotation:'aim' defs. */
        aimY?: number;
    },
): void {
    const def = SPRITE_EFFECT_DEFS[defId];
    if (!def) {
        if (import.meta.env.MODE !== 'production') {
            console.warn('[spawnSpriteEffect] Unknown defId:', defId);
        }
        return;
    }

    // Compute aimAngle if aimX/aimY provided (used when rotation === 'aim').
    let aimAngle: number | undefined;
    if (overrides?.aimX !== undefined && overrides.aimY !== undefined) {
        aimAngle = Math.atan2(overrides.aimY - y, overrides.aimX - x);
    }

    // Build effectData: defId + per-call overrides packed with override-suffix keys
    // so the SpriteEffectDef renderer can distinguish "not set" from "set to default".
    const effectData: Record<string, unknown> = { defId };

    if (overrides?.tint !== undefined) effectData.tintOverride = overrides.tint;
    if (overrides?.scale !== undefined) effectData.scaleOverride = overrides.scale;
    if (overrides?.fadeOut !== undefined) effectData.fadeOutOverride = overrides.fadeOut;
    if (overrides?.rotation !== undefined) effectData.rotationOverride = overrides.rotation;
    if (aimAngle !== undefined) effectData.aimAngle = aimAngle;

    // Motion fields (passed through to Effect.ts renderUpdate).
    if (overrides?.vx !== undefined) effectData.vx = overrides.vx;
    if (overrides?.vy !== undefined) effectData.vy = overrides.vy;
    if (overrides?.ay !== undefined) effectData.ay = overrides.ay;
    if (overrides?.dampingK !== undefined) effectData.dampingK = overrides.dampingK;

    engine.addEffect(new Effect({
        x,
        y,
        duration: def.duration,
        effectType: 'SpriteEffect',
        effectData,
    }));
}
