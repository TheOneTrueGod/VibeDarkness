/**
 * Reusable AI utilities for UnitAITree nodes.
 * Abilities are selected via AISettings (priority, ranges); nodes use these helpers.
 */

import type { Unit } from '../Unit';
import type { UnitAIContext } from './contextTypes';
import type { DefaultAITreeContext } from './default/context';
import type { AbilityStatic } from '../../../abilities/Ability';
import type { ResolvedTarget } from '../../types';
import type { SpecialTile } from '../../specialTiles/SpecialTile';
import type { AIContext } from './types';
import { areEnemies } from '../../teams';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { getPerceptionRange } from '../unit_defs/unitDef';
import { getAbilityTargets } from '../../../abilities/Ability';

/** Euclidean distance between two points. */
export function distance(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

/** Get all living units hostile to the given unit. Enemies cannot see units with tag 'protectedByCrystal'. */
export function findEnemies(unit: Unit, units: Unit[]): Unit[] {
    const hostile = units.filter((u) => u.isAlive() && areEnemies(unit.teamId, u.teamId));
    return hostile.filter((u) => !u.tags?.includes('protectedByCrystal'));
}

/**
 * Filter enemies to those within perception range and line-of-sight, sorted by distance (closest first).
 */
export function getEnemiesInPerceptionAndLOS(
    unit: Unit,
    enemies: Unit[],
    perceptionRange: number,
    hasLineOfSight: (fromX: number, fromY: number, toX: number, toY: number) => boolean,
): Unit[] {
    const inRange = enemies.filter((e) => {
        if (distance(unit.x, unit.y, e.x, e.y) > perceptionRange) return false;
        return hasLineOfSight(unit.x, unit.y, e.x, e.y);
    });
    inRange.sort((a, b) => distance(unit.x, unit.y, a.x, a.y) - distance(unit.x, unit.y, b.x, b.y));
    return inRange;
}

/** Build ResolvedTarget[] for an ability aimed at a single unit. */
export function buildResolvedTargets(ability: AbilityStatic, targetUnit: Unit): ResolvedTarget[] {
    const targetDefs = getAbilityTargets(ability, targetUnit, null);
    return targetDefs.map((t) => {
        if (t.type === 'pixel') {
            return { type: 'pixel' as const, position: { x: targetUnit.x, y: targetUnit.y } };
        }
        if (t.type === 'unit') {
            return { type: 'unit' as const, unitId: targetUnit.id };
        }
        return { type: 'player' as const, playerId: targetUnit.ownerId, unitId: targetUnit.id };
    });
}

export interface GridLike {
    worldToGrid(x: number, y: number): { col: number; row: number };
    gridToWorld(col: number, row: number): { x: number; y: number };
}

/** Look up the current defend point by id stored in unit.aiContext, if any. Only valid for default tree. */
export function getDefendPointFromContext(unit: Unit, defendPoints: SpecialTile[]): SpecialTile | undefined {
    const ctx = unit.aiContext as DefaultAITreeContext;
    return ctx.defensePointTargetId
        ? defendPoints.find((t) => t.id === ctx.defensePointTargetId)
        : undefined;
}

/**
 * Resolve the defend point this unit should move toward: existing target if still alive, else closest by distance.
 */
export function getOrPickClosestDefendPoint(
    unit: Unit,
    defendPoints: SpecialTile[],
    grid: GridLike | null,
): SpecialTile | null {
    if (!grid || defendPoints.length === 0) return null;
    const ctx = unit.aiContext as DefaultAITreeContext;
    const current = ctx.defensePointTargetId
        ? defendPoints.find((t) => t.id === ctx.defensePointTargetId)
        : undefined;
    if (current) return current;
    const unitGrid = grid.worldToGrid(unit.x, unit.y);
    let best: SpecialTile | null = null;
    let bestDist = Infinity;
    for (const tile of defendPoints) {
        const world = grid.gridToWorld(tile.col, tile.row);
        const d = distance(unit.x, unit.y, world.x, world.y);
        if (d < bestDist) {
            bestDist = d;
            best = tile;
        }
    }
    const chosen = best ?? defendPoints[0] ?? null;
    if (chosen) {
        ctx.defensePointTargetId = chosen.id;
    }
    return chosen;
}

/** Queue a wait order for the unit and emit turn end. */
export function queueWaitAndEndTurn(unit: Unit, context: AIContext): void {
    context.queueOrder(context.gameTick, { unitId: unit.id, abilityId: 'wait', targets: [] });
    context.emitTurnEnd(unit.id);
}

export interface ApplyAIMovementParams {
    unit: Unit;
    target: { x: number; y: number };
    worldWidth: number;
    worldHeight: number;
    findGridPath: (fromCol: number, fromRow: number, toCol: number, toRow: number) => { col: number; row: number }[] | null;
    worldToGrid: (x: number, y: number) => { col: number; row: number };
    gameTick: number;
    targetUnitId?: string;
}

/**
 * Set movement on an AI unit so it stays within its preferred range of a target position.
 */
export function applyAIMovementToPosition(params: ApplyAIMovementParams): void {
    const { unit, target, worldWidth, worldHeight, findGridPath, worldToGrid, gameTick, targetUnitId } = params;
    const ai = unit.aiSettings;
    if (!ai) return;

    const dx = target.x - unit.x;
    const dy = target.y - unit.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;

    const angleToTarget = Math.atan2(dy, dx);
    const jitterOffset = ((unit.moveJitter ?? 0.5) - 0.5) * (Math.PI / 4);
    const angledDirX = Math.cos(angleToTarget + jitterOffset);
    const angledDirY = Math.sin(angleToTarget + jitterOffset);

    const idealRange = (ai.minRange + ai.maxRange) / 2;
    let destX: number;
    let destY: number;

    if (dist > ai.maxRange) {
        const moveToDistance = dist - idealRange;
        destX = unit.x + angledDirX * moveToDistance;
        destY = unit.y + angledDirY * moveToDistance;
    } else if (dist < ai.minRange) {
        const retreatDistance = idealRange - dist;
        destX = unit.x - angledDirX * retreatDistance;
        destY = unit.y - angledDirY * retreatDistance;
    } else {
        return;
    }

    destX = Math.max(0, Math.min(worldWidth, destX));
    destY = Math.max(0, Math.min(worldHeight, destY));
    const destGrid = worldToGrid(destX, destY);

    if (
        !unit.pathInvalidated &&
        unit.movement &&
        unit.movement.targetUnitId === targetUnitId &&
        unit.movement.path.length > 0
    ) {
        const pathEnd = unit.movement.path[unit.movement.path.length - 1];
        if (pathEnd.col === destGrid.col && pathEnd.row === destGrid.row) return;

        const subPath = findGridPath(pathEnd.col, pathEnd.row, destGrid.col, destGrid.row);
        if (subPath && subPath.length > 0) {
            let currentTrimAt = unit.movement.path.length;
            let subPathStart = 0;
            for (let s = 0; s < subPath.length; s++) {
                let found = false;
                for (let c = currentTrimAt - 1; c >= 0; c--) {
                    if (
                        unit.movement!.path[c].col === subPath[s].col &&
                        unit.movement!.path[c].row === subPath[s].row
                    ) {
                        currentTrimAt = c;
                        subPathStart = s + 1;
                        found = true;
                        break;
                    }
                }
                if (!found) break;
            }
            unit.movement!.path.length = currentTrimAt;
            unit.movement!.path.push(...subPath.slice(subPathStart));
            unit.movement!.pathfindingTick = gameTick;
            return;
        }
    }

    const unitGrid = worldToGrid(unit.x, unit.y);
    const path = findGridPath(unitGrid.col, unitGrid.row, destGrid.col, destGrid.row);
    if (path && path.length > 0) {
        unit.setMovement(path, targetUnitId, gameTick);
    } else {
        unit.clearMovement();
    }
}

/** Apply movement toward/away from another unit to stay in AISettings range. */
export function applyAIMovementToUnit(
    unit: Unit,
    targetUnit: Unit,
    context: {
        findGridPath: (fromCol: number, fromRow: number, toCol: number, toRow: number) => { col: number; row: number }[] | null;
        worldToGrid: (x: number, y: number) => { col: number; row: number };
        gameTick: number;
        worldWidth: number;
        worldHeight: number;
    },
): void {
    applyAIMovementToPosition({
        unit,
        target: { x: targetUnit.x, y: targetUnit.y },
        worldWidth: context.worldWidth,
        worldHeight: context.worldHeight,
        findGridPath: context.findGridPath,
        worldToGrid: context.worldToGrid,
        gameTick: context.gameTick,
        targetUnitId: targetUnit.id,
    });
}

/**
 * Pick the best ability to use from unit.abilities based on AISettings (priority, range).
 * Returns { ability, target } or null if no valid ability.
 */
export function pickBestAbility(
    unit: Unit,
    candidateEnemies: Unit[],
    context: AIContext,
): { ability: AbilityStatic; target: Unit } | null {
    const randomInt = (min: number, max: number) => context.generateRandomInteger(min, max);
    const candidates: { ability: AbilityStatic; target: Unit; priority: number }[] = [];

    for (const abilityId of unit.abilities) {
        const ability = getAbility(abilityId);
        if (!ability) continue;

        const ai = ability.aiSettings;
        if (ai?.maxUsesPerRound != null && context.getAbilityUsesThisRound) {
            const used = context.getAbilityUsesThisRound(unit.id, ability.id);
            if (used >= ai.maxUsesPerRound) continue;
        }

        if (ability.targets.length === 0) {
            if (candidateEnemies.length > 0) {
                candidates.push({ ability, target: candidateEnemies[0]!, priority: ai?.priority ?? 0 });
            }
            continue;
        }

        const validTarget = findAIAbilityTarget(unit, ability, candidateEnemies, randomInt);
        if (validTarget) {
            candidates.push({ ability, target: validTarget, priority: ai?.priority ?? 0 });
        }
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.priority - a.priority);
    const best = candidates[0]!;
    return { ability: best.ability, target: best.target };
}

function findAIAbilityTarget(
    unit: Unit,
    ability: AbilityStatic,
    enemies: Unit[],
    randomInt: (min: number, max: number) => number,
): Unit | null {
    const ai = ability.aiSettings;
    if (!ai) {
        return enemies.length > 0 ? enemies[randomInt(0, enemies.length - 1)] ?? null : null;
    }
    const inRange = enemies.filter((e) => {
        const dx = e.x - unit.x;
        const dy = e.y - unit.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return dist >= ai.minRange && dist <= ai.maxRange;
    });
    if (inRange.length === 0) return null;
    return inRange[randomInt(0, inRange.length - 1)] ?? null;
}

/**
 * Try to queue one ability order. Uses pickBestAbility (priority-based). Returns true if queued.
 */
export function tryQueueAbilityOrder(unit: Unit, context: AIContext, candidateEnemies: Unit[]): boolean {
    const pick = pickBestAbility(unit, candidateEnemies, context);
    if (!pick) return false;

    const { ability, target } = pick;
    const resolvedTargets =
        ability.targets.length === 0 ? [] : buildResolvedTargets(ability, target);

    context.queueOrder(context.gameTick, {
        unitId: unit.id,
        abilityId: ability.id,
        targets: resolvedTargets,
        movePath: unit.pathInvalidated ? undefined : (unit.movement?.path ? [...unit.movement.path] : undefined),
    });
    context.emitTurnEnd(unit.id);
    return true;
}
