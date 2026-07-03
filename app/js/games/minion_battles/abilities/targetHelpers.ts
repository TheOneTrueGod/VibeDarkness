/**
 * Shared helpers for resolving and testing targets in abilities.
 * Use these so ability files stay minimal and read like a list of behaviours.
 */

import type { ResolvedTarget } from '../game/types';
import type { Unit } from '../game/units/Unit';
import type { EventBus } from '../game/EventBus';
import { tryDamageOrBlock } from './blockingHelpers';
import type { TryDamageOrBlockParams } from './blockingHelpers';
import { areEnemies } from '../game/teams';
import { pointInCone as pointInConeGeom } from './coneGeometry';

export { pointInCone } from './coneGeometry';

/** Get pixel target position from resolved targets, or null if missing/invalid. */
export function getPixelTargetPosition(
    targets: ResolvedTarget[],
    index: number = 0,
): { x: number; y: number } | null {
    const target = targets[index];
    if (!target || target.type !== 'pixel' || !target.position) return null;
    return target.position;
}

/** Direction and distance from one point to another. */
export interface DirectionFromTo {
    dirX: number;
    dirY: number;
    dist: number;
}

/** Normalized direction from (fromX, fromY) to (toX, toY). dist is 0 if points are equal. */
export function getDirectionFromTo(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
): DirectionFromTo {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const dirX = dist > 0 ? dx / dist : 1;
    const dirY = dist > 0 ? dy / dist : 0;
    return { dirX, dirY, dist };
}

/** Point at max range from caster toward target (for line abilities that cap at max range). */
export function getAimPointClampedToMaxRange(
    caster: { x: number; y: number },
    target: { x: number; y: number },
    maxR: number,
): { x: number; y: number } {
    const { dirX, dirY } = getDirectionFromTo(caster.x, caster.y, target.x, target.y);
    return {
        x: caster.x + dirX * maxR,
        y: caster.y + dirY * maxR,
    };
}

interface AoEEngine {
    units: Unit[];
    gameTime: number;
    eventBus: EventBus;
}

/**
 * Damage all enemy units within `radius` of `center` using `tryDamageOrBlock`.
 * When `onHit` is provided it replaces the standard damage call, allowing custom
 * damage types (e.g. un-blockable `unit.takeDamage`) or per-unit side effects.
 */
export function damageEnemiesInCircle(options: {
    engine: AoEEngine;
    caster: Unit;
    center: { x: number; y: number };
    radius: number;
    damage: number;
    abilityId: string;
    attackType?: string;
    /** When set, only the closest `maxTargets` enemies in the circle are damaged. */
    maxTargets?: number;
    onHit?: (unit: Unit) => void;
}): void {
    const { engine: eng, caster, center, radius, damage, abilityId, attackType = 'melee', maxTargets, onHit } = options;
    const r2 = radius * radius;
    let candidates: Unit[] = [];
    for (const unit of eng.units) {
        if (!unit.isAlive() || !areEnemies(caster.teamId, unit.teamId)) continue;
        const dx = unit.x - center.x;
        const dy = unit.y - center.y;
        if (dx * dx + dy * dy > r2) continue;
        candidates.push(unit);
    }
    if (maxTargets != null && candidates.length > maxTargets) {
        candidates = candidates
            .map((unit) => ({
                unit,
                distSq: (unit.x - center.x) ** 2 + (unit.y - center.y) ** 2,
            }))
            .sort((a, b) => a.distSq - b.distSq)
            .slice(0, maxTargets)
            .map((entry) => entry.unit);
    }
    for (const unit of candidates) {
        if (onHit) {
            onHit(unit);
        } else {
            tryDamageOrBlock(unit, {
                engine: eng,
                gameTime: eng.gameTime,
                eventBus: eng.eventBus,
                attackerX: center.x,
                attackerY: center.y,
                attackerId: caster.id,
                abilityId,
                damage,
                attackType: attackType as 'melee' | 'charging',
            });
        }
    }
}

/**
 * Damage enemies inside a truncated cone (inner cut-off + max range) aimed from caster toward (aimX, aimY).
 * When `maxTargets` is set, only the closest enemies are damaged.
 */
export function damageEnemiesInTruncatedCone(options: {
    engine: AoEEngine;
    caster: Unit;
    aimX: number;
    aimY: number;
    minR: number;
    maxR: number;
    halfAngleRad: number;
    damage: number;
    abilityId: string;
    attackType?: string;
    maxTargets?: number;
    /** Cone apex; defaults to caster position. */
    originX?: number;
    originY?: number;
}): void {
    const {
        engine: eng,
        caster,
        aimX,
        aimY,
        minR,
        maxR,
        halfAngleRad,
        damage,
        abilityId,
        attackType = 'ranged',
        maxTargets,
        originX = caster.x,
        originY = caster.y,
    } = options;
    const { dirX, dirY } = getDirectionFromTo(originX, originY, aimX, aimY);
    let candidates: Unit[] = [];
    for (const unit of eng.units) {
        if (!unit.isAlive() || !areEnemies(caster.teamId, unit.teamId)) continue;
        if (!pointInConeGeom(originX, originY, unit.x, unit.y, dirX, dirY, minR, maxR, halfAngleRad)) continue;
        candidates.push(unit);
    }
    if (maxTargets != null && candidates.length > maxTargets) {
        candidates = candidates
            .map((unit) => ({
                unit,
                distSq: (unit.x - originX) ** 2 + (unit.y - originY) ** 2,
            }))
            .sort((a, b) => a.distSq - b.distSq)
            .slice(0, maxTargets)
            .map((entry) => entry.unit);
    }
    for (const unit of candidates) {
        tryDamageOrBlock(unit, {
            engine: eng,
            gameTime: eng.gameTime,
            eventBus: eng.eventBus,
            attackerX: caster.x,
            attackerY: caster.y,
            attackerId: caster.id,
            abilityId,
            damage,
            attackType: attackType as 'melee' | 'charging',
        });
    }
}

/**
 * Damage all living enemies that overlap the caster (touch semantics: dist <= caster.radius + unit.radius),
 * skipping units in `alreadyHitIds` and units with active iFrames.
 * Appends newly-hit unit ids to `alreadyHitIds` (the caller owns the array so it round-trips through
 * ability notes / checkpoints unchanged).
 */
export function damageEnemiesTouchingCaster(options: {
    engine: AoEEngine;
    caster: Unit;
    abilityId: string;
    damage: number;
    attackType: TryDamageOrBlockParams['attackType'];
    alreadyHitIds: string[];
    respectIFrames?: boolean;
    /** Cap on distinct enemies damaged across the cast (`alreadyHitIds` length). */
    maxTargets?: number;
}): void {
    const { engine: eng, caster, abilityId, damage, attackType, alreadyHitIds, respectIFrames = true, maxTargets } = options;
    const slotsRemaining = maxTargets != null ? maxTargets - alreadyHitIds.length : Infinity;
    if (slotsRemaining <= 0) return;

    const candidates: Unit[] = [];
    for (const unit of eng.units) {
        if (!unit.isAlive() || !areEnemies(caster.teamId, unit.teamId)) continue;
        if (alreadyHitIds.includes(unit.id)) continue;
        if (respectIFrames && unit.hasIFrames(eng.gameTime)) continue;
        const dx = unit.x - caster.x;
        const dy = unit.y - caster.y;
        const touchDist = Math.sqrt(dx * dx + dy * dy);
        if (touchDist > caster.radius + unit.radius) continue;
        candidates.push(unit);
    }

    const toHit = maxTargets != null && candidates.length > slotsRemaining
        ? candidates
            .map((unit) => ({
                unit,
                distSq: (unit.x - caster.x) ** 2 + (unit.y - caster.y) ** 2,
            }))
            .sort((a, b) => a.distSq - b.distSq)
            .slice(0, slotsRemaining)
            .map((entry) => entry.unit)
        : candidates;

    for (const unit of toHit) {
        const outcome = tryDamageOrBlock(unit, {
            engine: eng,
            gameTime: eng.gameTime,
            eventBus: eng.eventBus,
            attackerX: caster.x,
            attackerY: caster.y,
            attackerId: caster.id,
            abilityId,
            damage,
            attackType,
        });
        if (outcome.hit) alreadyHitIds.push(unit.id);
    }
}
