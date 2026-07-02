/**
 * Guard wander — pacing loop while a pet waits near its owner in pet_follow.
 *
 * Picks a random point in a ring around the owner (> 1 unit radius, < tether range),
 * paths there, dwells briefly (0.5–1 s, deterministic per stop), then repeats.
 */

import type { Unit } from '../../Unit';
import type { AIContext } from '../types';
import type { PetAITreeContext } from './context';
import { distance } from '../utils';

/** Distance to guard target considered "arrived" (px). */
const ARRIVAL_THRESHOLD_PX = 30;

/** Dwell duration bounds (seconds), inclusive — randomized per stop via AIContext RNG. */
const DWELL_MIN_SEC = 0.5;
const DWELL_MAX_SEC = 1.0;

export function clearPetGuardWander(ctx: PetAITreeContext): void {
    ctx.guardTargetX = undefined;
    ctx.guardTargetY = undefined;
    ctx.guardDwellUntilGameTime = undefined;
}

function guardTargetStillValid(
    owner: Unit,
    targetX: number,
    targetY: number,
    minDist: number,
    maxDist: number,
): boolean {
    const d = distance(owner.x, owner.y, targetX, targetY);
    return d >= minDist && d <= maxDist;
}

function pickGuardDwellSeconds(context: AIContext): number {
    const minTenths = Math.round(DWELL_MIN_SEC * 100);
    const maxTenths = Math.round(DWELL_MAX_SEC * 100);
    return context.generateRandomInteger(minTenths, maxTenths) / 100;
}

function pickNewGuardTarget(
    owner: Unit,
    context: AIContext,
    ctx: PetAITreeContext,
    minDist: number,
    maxDist: number,
): void {
    const angle = context.generateRandomInteger(0, 628) / 100;
    const dist = context.generateRandomInteger(minDist, maxDist);
    ctx.guardTargetX = Math.max(0, Math.min(context.WORLD_WIDTH, owner.x + Math.cos(angle) * dist));
    ctx.guardTargetY = Math.max(0, Math.min(context.WORLD_HEIGHT, owner.y + Math.sin(angle) * dist));
    ctx.guardDwellUntilGameTime = undefined;
}

function pathTowardGuardTarget(unit: Unit, context: AIContext, ctx: PetAITreeContext): void {
    const grid = context.terrainManager?.grid;
    if (!grid || ctx.guardTargetX == null || ctx.guardTargetY == null) return;

    if (!unit.pathInvalidated && unit.movement && unit.movement.path.length > 0) {
        return;
    }

    const from = grid.worldToGrid(unit.x, unit.y);
    const to = grid.worldToGrid(ctx.guardTargetX, ctx.guardTargetY);
    const path = context.findGridPathForUnit(unit, from.col, from.row, to.col, to.row);
    if (path && path.length > 1) {
        unit.setMovement(path.slice(1), ownerIdOrUndefined(unit), context.gameTick);
    } else {
        clearPetGuardWander(ctx);
    }
}

function ownerIdOrUndefined(unit: Unit): string | undefined {
    return unit.petState.ownerUnitId ?? undefined;
}

/**
 * Run one guard-wander tick while the pet is within tether range of its owner.
 * Returns false when the ring is too tight to wander (caller should idle in place).
 */
export function runPetGuardWander(
    unit: Unit,
    owner: Unit,
    context: AIContext,
    ctx: PetAITreeContext,
    tetherRange: number,
): boolean {
    const unitSize = unit.radius;
    const minDist = unitSize + 1;
    const maxDist = tetherRange - 1;
    if (minDist >= maxDist) return false;

    const grid = context.terrainManager?.grid;
    if (!grid) return false;

    if (
        ctx.guardTargetX != null
        && ctx.guardTargetY != null
        && !guardTargetStillValid(owner, ctx.guardTargetX, ctx.guardTargetY, minDist, maxDist)
    ) {
        clearPetGuardWander(ctx);
    }

    if (ctx.guardTargetX != null && ctx.guardTargetY != null) {
        const distToTarget = distance(unit.x, unit.y, ctx.guardTargetX, ctx.guardTargetY);

        if (distToTarget <= ARRIVAL_THRESHOLD_PX) {
            if (ctx.guardDwellUntilGameTime == null) {
                ctx.guardDwellUntilGameTime = context.gameTime + pickGuardDwellSeconds(context);
            }
            if (context.gameTime < ctx.guardDwellUntilGameTime) {
                return true;
            }
            clearPetGuardWander(ctx);
        } else {
            pathTowardGuardTarget(unit, context, ctx);
            return true;
        }
    }

    pickNewGuardTarget(owner, context, ctx, minDist, maxDist);
    pathTowardGuardTarget(unit, context, ctx);
    return true;
}

/** Retrigger pathing after a movement interrupt while heading to a guard point. */
export function retriggerPetGuardWanderPath(unit: Unit, context: AIContext): void {
    const ctx = unit.aiContext as PetAITreeContext;
    if (ctx.guardTargetX == null || ctx.guardTargetY == null) return;
    if (ctx.guardDwellUntilGameTime != null && context.gameTime < ctx.guardDwellUntilGameTime) return;
    pathTowardGuardTarget(unit, context, ctx);
}
