/**
 * Reusable AI utilities for UnitAITree nodes.
 * Abilities are selected via AISettings (priority, ranges); nodes use these helpers.
 */

import type { Unit } from '../Unit';
import type { DefaultAITreeContext } from './default/context';
import type { AbilityStatic } from '../../../abilities/Ability';
import type { ResolvedTarget } from '../../types';
import type { SpecialTile } from '../../specialTiles/SpecialTile';
import type { AIContext } from './types';
import { areEnemies } from '../../teams';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { getAbilityTargets, canAffordAbility } from '../../../abilities/Ability';
import { getSelectTargetDefsFromTimings, buildAiSelectTargets } from '../../../abilities/targeting';
import { UnitTag, hasUnitTag } from '../unitTag';
import { meetsTagRequirements } from '../../../abilities/abilityUses';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { MIN_FOLLOW_RADIUS, ROUND_DURATION } from '../../gameConstants';

export { ROUND_DURATION } from '../../gameConstants';

/** Fraction of the current round elapsed at `gameTime`, in [0, 1). */
export function getRoundFraction(gameTime: number): number {
    const t = gameTime % ROUND_DURATION;
    return t / ROUND_DURATION;
}

/** True when `gameTime` falls inside `[window.start, window.end)` of the current round. */
export function isInRoundWindow(gameTime: number, window: { start: number; end: number }): boolean {
    const f = getRoundFraction(gameTime);
    return f >= window.start && f < window.end;
}

/** Euclidean distance between two points. */
export function distance(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * True once every `intervalTicks` game ticks (e.g. `everyAITicks(context.gameTick, 10)` to throttle
 * a perception scan to once per 10 ticks instead of every tick). Formalizes the `gameTick % N === 0`
 * idiom already used ad hoc elsewhere (e.g. `LevelEventManager`'s victory-check throttle,
 * `default_siegeDefendPoint`'s path-retrigger check). `intervalTicks <= 0` always returns false.
 */
export function everyAITicks(gameTick: number, intervalTicks: number): boolean {
    return intervalTicks > 0 && gameTick % intervalTicks === 0;
}

/** Get all living units hostile to the given unit. Enemies cannot see crystal-protected or invincible units. */
export function findEnemies(unit: Unit, units: Unit[]): Unit[] {
    const hostile = units.filter((u) => u.isAlive() && areEnemies(unit.teamId, u.teamId));
    return hostile.filter((u) => !u.tags?.includes(UnitTag.ProtectedByCrystal) && !u.isInvincible() && !u.isUntargetable());
}

/** Living hostile units tagged `UnitTag.Structure` (e.g. lanternite_nest, swarm_nest). The
 *  generic "find any enemy structure" helper — any AI tree that needs to target/path toward a
 *  hostile structure should use this rather than a def-specific or speed-based proxy.
 *  Excludes invincible structures (same filter as {@link findEnemies}) — use
 *  {@link findEnemyStructuresForTravel} when marching toward nests that may be invulnerable. */
export function findEnemyStructures(unit: Unit, units: Unit[]): Unit[] {
    return findEnemies(unit, units).filter((u) => hasUnitTag(u, UnitTag.Structure));
}

/**
 * Hostile structures eligible as **travel destinations** (e.g. `networkHunt` march). Includes
 * invincible structures so waves still advance toward an invulnerable nest; combat/perception
 * continue to use {@link findEnemies} / {@link findEnemyStructures}, which exclude them.
 * Still skips crystal-protected and mid-spawn units.
 */
export function findEnemyStructuresForTravel(unit: Unit, units: Unit[]): Unit[] {
    return units.filter(
        (u) =>
            u.isAlive() &&
            areEnemies(unit.teamId, u.teamId) &&
            hasUnitTag(u, UnitTag.Structure) &&
            !u.tags?.includes(UnitTag.ProtectedByCrystal) &&
            !u.isUntargetable(),
    );
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
            return {
                type: 'pixel' as const,
                position: { x: targetUnit.x, y: targetUnit.y },
                trackUnitId: targetUnit.id,
            };
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

/** Grid cell containing a world position. */
function cellOfPoint(x: number, y: number): { col: number; row: number } {
    return { col: Math.floor(x / CELL_SIZE), row: Math.floor(y / CELL_SIZE) };
}

/** Back away from (fromX, fromY) by `retreatDistance` px, if there is somewhere reachable to go. */
function retreatFrom(unit: Unit, fromX: number, fromY: number, retreatDistance: number, context: AIContext): void {
    const dx = unit.x - fromX;
    const dy = unit.y - fromY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;
    const destX = Math.max(0, Math.min(context.WORLD_WIDTH, unit.x + (dx / dist) * retreatDistance));
    const destY = Math.max(0, Math.min(context.WORLD_HEIGHT, unit.y + (dy / dist) * retreatDistance));
    const dest = cellOfPoint(destX, destY);
    if (!context.nav.isReachable(unit, dest.col, dest.row)) return;
    context.nav.moveToCell(unit, dest.col, dest.row);
}

/**
 * Keep an AI unit within its AISettings range of a fixed position: approach when too far, back
 * off when too close, otherwise leave whatever it is doing alone.
 */
export function applyAIMovementToPosition(unit: Unit, target: { x: number; y: number }, context: AIContext): void {
    const ai = unit.aiSettings;
    if (!ai) return;

    const dx = target.x - unit.x;
    const dy = target.y - unit.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;

    const idealRange = (ai.minRange + ai.maxRange) / 2;
    if (dist > ai.maxRange) {
        // Already walking to a cell that puts us in range? Keep it: re-deriving the approach point
        // every turn would flip between neighbouring cells as the unit moves.
        const intent = unit.walkIntent;
        if (intent?.managed && intent.targetUnitId === undefined) {
            const destX = intent.dest.col * CELL_SIZE + CELL_SIZE / 2;
            const destY = intent.dest.row * CELL_SIZE + CELL_SIZE / 2;
            if (distance(destX, destY, target.x, target.y) <= ai.maxRange) return;
        }
        const approach = dist - idealRange;
        context.nav.moveToPoint(unit, unit.x + (dx / dist) * approach, unit.y + (dy / dist) * approach);
    } else if (dist < ai.minRange) {
        retreatFrom(unit, target.x, target.y, idealRange - dist, context);
    }
}

/**
 * Keep an AI unit within its AISettings range of another unit: chase when too far (stopping at
 * the ideal range), back off when too close, otherwise leave whatever it is doing alone.
 */
export function applyAIMovementToUnit(unit: Unit, targetUnit: Unit, context: AIContext): void {
    const ai = unit.aiSettings;
    if (!ai) return;

    const dist = distance(unit.x, unit.y, targetUnit.x, targetUnit.y);
    if (dist === 0) return;

    const idealRange = (ai.minRange + ai.maxRange) / 2;
    if (dist > ai.maxRange) {
        // Bodies cannot overlap, so never ask to stand closer than touching distance — but stay
        // inside maxRange or the unit could never act.
        const touching = unit.radius + targetUnit.radius + MIN_FOLLOW_RADIUS;
        const stopRange = Math.min(ai.maxRange, Math.max(idealRange, touching));
        context.nav.chaseUnit(unit, targetUnit, { stopRange });
    } else if (dist < ai.minRange) {
        retreatFrom(unit, targetUnit.x, targetUnit.y, idealRange - dist, context);
    }
}

/**
 * Engine view handed to `buildAiSelectTargets`: the unit lookup, plus the terrain that
 * `SelectTargetDef.validatePick` reads. AI contexts provide the real TerrainManager at runtime.
 */
function aiSelectEngine(context: AIContext): { getUnit(id: string): Unit | undefined; terrainManager: unknown } {
    return { getUnit: context.getUnit, terrainManager: context.terrainManager };
}

/**
 * True when the AI's select picks for `ability` against `target` all pass `validatePick`. Abilities
 * without select steps are always usable. A rejected plan is not a candidate, so the AI can use a
 * different ability instead.
 */
function aiSelectPlanIsUsable(unit: Unit, ability: AbilityStatic, target: Unit, context: AIContext): boolean {
    return buildAiSelectTargets(unit, ability, target, aiSelectEngine(context)).valid;
}

/**
 * Pick the best ability to use from unit.abilities based on AISettings (priority, range).
 * Returns { ability, target } or null if no valid ability.
 *
 * `nearbyEnemies` defaults to `candidateEnemies` — pass a broader list (e.g. every enemy the
 * tree currently perceives, not just the locked target) to support abilities whose
 * `aiSettings.candidateScope` is `'anyNearby'`.
 */
export function pickBestAbility(
    unit: Unit,
    candidateEnemies: Unit[],
    context: AIContext,
    nearbyEnemies: Unit[] = candidateEnemies,
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
        if (!meetsTagRequirements(unit, ability)) continue;
        if (ai?.roundWindow && !isInRoundWindow(context.gameTime, ai.roundWindow)) continue;
        if (ai?.requireAffordable && !canAffordAbility(unit, ability)) continue;
        if (ai?.canUse && !ai.canUse(unit, context)) continue;

        const enemyPool = ai?.candidateScope === 'anyNearby' ? nearbyEnemies : candidateEnemies;

        if (ability.targets.length === 0) {
            if (ai?.enforceRangeWhenUntargeted) {
                const validTarget = findAIAbilityTarget(unit, ability, enemyPool, randomInt);
                if (validTarget && aiSelectPlanIsUsable(unit, ability, validTarget, context)) {
                    candidates.push({ ability, target: validTarget, priority: ai?.priority ?? 0 });
                }
                continue;
            }
            if (enemyPool.length > 0 && aiSelectPlanIsUsable(unit, ability, enemyPool[0]!, context)) {
                candidates.push({ ability, target: enemyPool[0]!, priority: ai?.priority ?? 0 });
            }
            continue;
        }

        const validTarget = findAIAbilityTarget(unit, ability, enemyPool, randomInt);
        if (validTarget && aiSelectPlanIsUsable(unit, ability, validTarget, context)) {
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
 * Try to queue one ability order. Uses pickBestAbility (priority-based). Returns true if queued (or deferred).
 * When ninjutsuManager is present and the ability participates in a pool, the order is deferred to
 * NinjutsuManager.resolveRequests() rather than queued immediately.
 *
 * `nearbyEnemies` (optional) is forwarded to `pickBestAbility` for abilities with
 * `aiSettings.candidateScope: 'anyNearby'`; omit it and every ability behaves as before.
 */
export function tryQueueAbilityOrder(
    unit: Unit,
    context: AIContext,
    candidateEnemies: Unit[],
    nearbyEnemies?: Unit[],
): boolean {
    const pick = pickBestAbility(unit, candidateEnemies, context, nearbyEnemies);
    if (!pick) return false;

    const { ability, target } = pick;
    const selectDefs = getSelectTargetDefsFromTimings(ability, unit, { getUnit: context.getUnit });
    let resolvedTargets: ResolvedTarget[];
    let targetsByLabel: Record<string, ResolvedTarget> | undefined;
    if (selectDefs.length > 0) {
        const built = buildAiSelectTargets(unit, ability, target, aiSelectEngine(context));
        // pickBestAbility filters rejected plans already; this guards any other caller.
        if (!built.valid) return false;
        resolvedTargets = built.targets;
        targetsByLabel = built.targetsByLabel;
    } else {
        resolvedTargets = ability.targets.length === 0 ? [] : buildResolvedTargets(ability, target);
    }
    // AI orders never carry a path: `movePath: undefined` leaves the unit's walk goal untouched.
    // (Re-applying a copy of the live path would turn a managed chase goal into a stale fixed path.)
    const movePath = undefined;

    const ninjutsuCfg = ability.aiSettings?.ninjutsu;
    const mgr = context.ninjutsuManager;
    if (mgr && !ninjutsuCfg?.ignore) {
        const poolType = ninjutsuCfg?.type ?? 'shadow';
        const pool = mgr.getPool(poolType);
        if (pool?.config.enabled) {
            mgr.registerRequest(poolType, unit, ability, resolvedTargets, movePath, context.gameTick);
            context.emitTurnEnd(unit.id);
            return true;
        }
    }

    context.queueOrder(context.gameTick, {
        unitId: unit.id,
        abilityId: ability.id,
        targets: resolvedTargets,
        targetsByLabel,
        movePath,
    });
    context.emitTurnEnd(unit.id);
    return true;
}
