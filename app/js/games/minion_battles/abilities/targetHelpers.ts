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
import { filterCombatHitTargets } from './combatTargetFilter';
import { CircleHitbox } from '../hitboxes/CircleHitbox';
import type { HitboxEngineContext } from '../hitboxes/Hitbox';
import { rasterizeArea, type TerrainLayerManager, type TerrainLayerName } from '../game/TerrainLayerManager';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import { getUnitsInTiles, type TileCoord } from './tileAreaHelpers';

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
    getUnit?(id: string): Unit | undefined;
}

/** Adapt AoE engine slices to the hitbox query context (getUnit optional on thin test mocks). */
function toHitboxEngine(eng: AoEEngine): HitboxEngineContext {
    return {
        units: eng.units,
        gameTime: eng.gameTime,
        getUnit: (id) => eng.getUnit?.(id) ?? eng.units.find((u) => u.id === id),
    };
}

/**
 * Tile-based twin of {@link damageEnemiesInCircle}: damages enemies standing on any of `tiles`
 * (hostile to caster, alive, not spawning; combat iFrames filtered). Pair with `cellsAroundPoint` /
 * `tileShapes` so the effect and its tile telegraph share one footprint. `onHit` replaces the
 * standard `tryDamageOrBlock` call.
 */
export function damageEnemiesInTiles(options: {
    engine: AoEEngine;
    caster: Unit;
    /** Cells of the AoE; a unit is hit when its centre is on one of them (same rule the preview shows). */
    tiles: readonly TileCoord[];
    /** Attack origin for blocking / knockback direction (usually the impact tile centre). */
    origin: { x: number; y: number };
    damage: number;
    abilityId: string;
    attackType?: string;
    onHit?: (unit: Unit) => void;
}): void {
    const { engine: eng, caster, tiles, origin, damage, abilityId, attackType = 'melee', onHit } = options;
    const candidates = filterCombatHitTargets(
        getUnitsInTiles(eng.units, tiles, (unit) =>
            unit.active
            && unit.isAlive()
            && !unit.isUntargetable()
            && unit.id !== caster.id
            && areEnemies(caster.teamId, unit.teamId),
        ),
        eng.gameTime,
    );
    for (const unit of candidates) {
        if (onHit) {
            onHit(unit);
            continue;
        }
        tryDamageOrBlock(unit, {
            engine: eng,
            gameTime: eng.gameTime,
            eventBus: eng.eventBus,
            attackerX: origin.x,
            attackerY: origin.y,
            attackerId: caster.id,
            abilityId,
            damage,
            attackType: attackType as 'melee' | 'charging',
        });
    }
}

/**
 * Damage all enemy units within `radius` of `center` using `tryDamageOrBlock`.
 * Candidates come from `CircleHitbox.getUnitsInHitbox` (hostile to caster; combat iFrames filtered).
 * When `onHit` is provided it replaces the standard damage call, allowing custom
 * damage types (e.g. un-blockable `unit.takeDamage`) or per-unit side effects.
 * Returns the units that were targeted.
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
    /** When set, only enemies passing this check are candidates (applied before `maxTargets`). */
    filter?: (unit: Unit) => boolean;
    onHit?: (unit: Unit) => void;
}): Unit[] {
    const { engine: eng, caster, center, radius, damage, abilityId, attackType = 'melee', maxTargets, filter, onHit } = options;
    let candidates = CircleHitbox.getUnitsInHitbox(
        toHitboxEngine(eng),
        caster,
        center.x,
        center.y,
        radius,
    );
    if (filter) candidates = candidates.filter(filter);
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
    return candidates;
}

/**
 * Damage enemies inside a truncated cone (inner cut-off + max range) aimed from caster toward (aimX, aimY).
 * Geometry stays custom (no truncated-cone hitbox yet); candidates are passed through
 * `filterCombatHitTargets` so combat iFrames are excluded before `tryDamageOrBlock`.
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
    candidates = filterCombatHitTargets(candidates, eng.gameTime);
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

interface JitteredGroundThornsEngine {
    terrainLayers: TerrainLayerManager;
    generateRandomInteger(min: number, max: number): number;
}

/**
 * Fill a circular area with one ground/air terrain-effect cell ("thorn") per rasterized grid
 * cell, each with its own randomized extra expiry so the patch thins out over time instead of
 * vanishing all at once. Cells nearer `center` bias toward the upper half of
 * `[0, durationJitterInSeconds]` extra seconds; cells nearer the edge bias toward the lower half
 * (the midpoint, `durationJitterInSeconds / 2`, is implicit — every cell lasts at least
 * `baseExpiresAtGameTime` and at most `baseExpiresAtGameTime + durationJitterInSeconds`).
 * Uses `engine.generateRandomInteger` so the result is identical across host and clients.
 */
export function placeJitteredGroundThorns(options: {
    engine: JitteredGroundThornsEngine;
    caster: Unit;
    center: { x: number; y: number };
    radius: number;
    layer?: TerrainLayerName;
    effectType: string;
    placedAtGameTime: number;
    baseExpiresAtGameTime: number;
    durationJitterInSeconds: number;
    ownerAbilityId: string;
    params: Record<string, unknown>;
    /** Unique per placement (e.g. `bramble-${caster.id}-${gameTime}`); cell coords are appended. */
    idPrefix: string;
    /**
     * Explicit cells to cover (tile-based AoE). When omitted, the circle `center`/`radius` is
     * rasterized. `center`/`radius` still drive the edge-first expiry jitter.
     */
    cells?: readonly TileCoord[];
}): void {
    const {
        engine,
        caster,
        center,
        radius,
        layer = 'ground',
        effectType,
        placedAtGameTime,
        baseExpiresAtGameTime,
        durationJitterInSeconds,
        ownerAbilityId,
        params,
        idPrefix,
        cells,
    } = options;
    const jitterHalf = durationJitterInSeconds / 2;
    const covered = cells ?? rasterizeArea({ type: 'circle', x: center.x, y: center.y, radiusPx: radius });
    for (const { col, row } of covered) {
        const dx = (col * CELL_SIZE + CELL_SIZE / 2) - center.x;
        const dy = (row * CELL_SIZE + CELL_SIZE / 2) - center.y;
        const t = Math.min(1, Math.sqrt(dx * dx + dy * dy) / radius);
        const jitterMin = jitterHalf * (1 - t);
        const jitterFrac = engine.generateRandomInteger(0, 1000) / 1000;
        const jitter = jitterMin + jitterFrac * jitterHalf;
        engine.terrainLayers.add({
            id: `${idPrefix}-${col}-${row}`,
            layer,
            effectType,
            placedAtGameTime,
            expiresAtGameTime: baseExpiresAtGameTime + jitter,
            ownerUnitId: caster.id,
            ownerAbilityId,
            teamId: caster.teamId,
            area: { type: 'cell', col, row },
            params,
        });
    }
}
