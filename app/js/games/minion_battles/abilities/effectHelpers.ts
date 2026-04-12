/**
 * Shared helpers for one-off effects in abilities (draw cards, deactivate projectile on block, etc.).
 * Use these so ability files stay minimal and read like a list of behaviours.
 */

import type { Unit } from '../game/units/Unit';
import type { AttackBlockedInfo } from './Ability';
import type { TerrainManager } from '../terrain/TerrainManager';
import { computeForcedDisplacement } from '../game/forceMove';
import { Effect } from '../game/effects/Effect';

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

/** Options for CrystalLightEffect. Brief invisible light that decays over time. */
export interface CrystalLightEffectOptions {
    lightAmount?: number;
    radius?: number;
    decayRate?: number;
    decayInterval?: number;
}

const DEFAULT_LIGHT_AMOUNT = 10;
const DEFAULT_RADIUS = 4;
const DEFAULT_DECAY_RATE = 1;
const DEFAULT_DECAY_INTERVAL = 0.25;

/**
 * Create a brief light source with no visuals (e.g. charged crystal, Shining Block retaliation).
 * Uses Torch effect with showVisual: false and decayRate/decayInterval for gradual fade.
 */
export function createCrystalLightEffect(
    x: number,
    y: number,
    options: CrystalLightEffectOptions = {},
): Effect {
    const lightAmount = options.lightAmount ?? DEFAULT_LIGHT_AMOUNT;
    const radius = options.radius ?? DEFAULT_RADIUS;
    const decayRate = options.decayRate ?? DEFAULT_DECAY_RATE;
    const decayInterval = options.decayInterval ?? DEFAULT_DECAY_INTERVAL;
    return new Effect({
        x,
        y,
        duration: 999,
        effectType: 'Torch',
        effectData: {
            lightAmount,
            radius,
            decayRate,
            decayInterval,
            showVisual: false,
        },
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

interface EngineWithDraw {
    drawCardsForPlayer?(playerId: string, count: number): number;
}

/** Draw cards for a player. No-op if engine has no drawCardsForPlayer. */
export function drawCardForPlayer(
    engine: unknown,
    playerId: string | undefined,
    count: number,
): void {
    if (!playerId) return;
    const eng = engine as EngineWithDraw;
    if (typeof eng.drawCardsForPlayer === 'function') {
        eng.drawCardsForPlayer(playerId, count);
    }
}

interface EngineWithGetUnit {
    getUnit?(id: string): Unit | undefined;
    eventBus?: { emit: (event: string, data: unknown) => void };
    cancelActiveAbility?(unitId: string, abilityId: string): void;
}

/**
 * When a charging attack is blocked: knock back the attacker away from the defender and clear the attacker's ability note.
 * Use in onAttackBlocked for charging abilities (e.g. Dark Wolf Bite).
 * abilityId is the attacking ability id (for knockback source).
 */
export function applyChargingBlockKnockback(
    engine: unknown,
    defender: Unit,
    attackInfo: AttackBlockedInfo,
    knockbackMagnitude: number,
    abilityId: string,
    options?: { airTime?: number; slideTime?: number },
): void {
    if (attackInfo.type !== 'charging' || !attackInfo.sourceUnitId) return;
    const eng = engine as EngineWithGetUnit;
    const attacker = eng.getUnit?.(attackInfo.sourceUnitId);
    if (!attacker || !eng.eventBus) return;
    const dx = attacker.x - defender.x;
    const dy = attacker.y - defender.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const dirX = dist > 0 ? dx / dist : 1;
    const dirY = dist > 0 ? dy / dist : 0;
    attacker.applyKnockback(
        0,
        {
            knockbackVector: { x: dirX * knockbackMagnitude, y: dirY * knockbackMagnitude },
            knockbackAirTime: options?.airTime ?? 0.2,
            knockbackSlideTime: options?.slideTime ?? 0.1,
            knockbackSource: { unitId: defender.id, abilityId },
        },
        eng.eventBus,
    );
    eng.cancelActiveAbility?.(attackInfo.sourceUnitId, abilityId);
    attacker.clearAbilityNote();
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
