/**
 * spawnUnit — the single code path allowed to construct and add a unit to the battle from a
 * SpawnDefinition. Every entry point (mission bootstrap, level events, nest ticks, abilities)
 * resolves its own decision logic down to a SpawnDefinition and calls this.
 *
 * Placement resolution (edgeOfMap/anywhere/closestToPlayers/closestEnemySpawnPoint) consolidates
 * logic that used to be duplicated between LevelEventManager's spawnWave and continuousSpawn
 * handling; relativeToUnit is new, factored out of the three nest-tick modules' identical
 * random-annulus placement.
 */

import type { EventBus } from '../../EventBus';
import type { Unit } from '../Unit';
import type { TerrainManager } from '../../../terrain/TerrainManager';
import type { MapSegmentPOI, MapSegmentZone } from '../../../terrain/segmentSchema';
import type { SpawnSource } from '../../types';
import { DarknessLevel } from '../../darknessLevels';
import { createUnitFromSpawnConfig } from '../index';
import { getEdgePositions } from '../../../storylines/edgeSpawns';
import { resolveZoneTiles } from '../../../terrain/zones';
import type { SpawnDefinition, SpawnPlacement, SpawnAiHookup } from './spawnDefinition';

/**
 * Narrow, structural context spawnUnit needs. `GameEngine` (which implements `EngineContext`)
 * satisfies this with no changes; nest-tick modules and ability code can pass a matching subset.
 */
export interface SpawnUnitContext {
    readonly units: Unit[];
    readonly eventBus: EventBus;
    readonly terrainManager: TerrainManager | null;
    readonly lightLevelEnabled: boolean;
    readonly aiControllerId: string | null;
    readonly mapPOIs: readonly MapSegmentPOI[];
    addUnit(unit: Unit, spawnSource?: SpawnSource): void;
    getLightAt(col: number, row: number): number | null;
    getZoneById(id: string): MapSegmentZone | undefined;
    generateRandomInteger(min: number, max: number): number;
    allocateObjectId?(prefix?: string): string;
}

type WorldPos = { x: number; y: number };
type GridCell = { col: number; row: number };

const INT31 = 0x7fffffff;

function capitalizeCharacterId(characterId: string): string {
    return characterId.charAt(0).toUpperCase() + characterId.slice(1).replace(/_/g, ' ');
}

function isValidSpawnCell(
    ctx: SpawnUnitContext,
    terrainManager: TerrainManager,
    occupiedCells: Set<string>,
    col: number,
    row: number,
    inDarkness: boolean,
): boolean {
    const key = `${col},${row}`;
    if (occupiedCells.has(key)) return false;
    const { x, y } = terrainManager.grid.gridToWorld(col, row);
    if (!terrainManager.isPassable(x, y)) return false;
    if (inDarkness) {
        // Use animated visual grid (getLightAt), not a fresh target grid — tile must be visually dark.
        const level = ctx.getLightAt(col, row);
        if (level == null || level > DarknessLevel.FULL_DARKNESS) return false;
    }
    return true;
}

function collectCandidateTiles(
    ctx: SpawnUnitContext,
    terrainManager: TerrainManager,
    occupiedCells: Set<string>,
    inDarkness: boolean,
    target: { x: number; y: number; radius: number } | undefined,
    zoneId: string | undefined,
): GridCell[] {
    const grid = terrainManager.grid;
    const candidates: GridCell[] = [];

    if (zoneId != null) {
        const zone = ctx.getZoneById(zoneId);
        if (!zone) {
            console.error(`spawnUnit: zone "${zoneId}" not found; skipping this spawn entry.`);
            return [];
        }
        for (const { col, row } of resolveZoneTiles(zone)) {
            if (isValidSpawnCell(ctx, terrainManager, occupiedCells, col, row, inDarkness)) candidates.push({ col, row });
        }
        return candidates;
    }

    const hasTarget = !!target;
    const targetX = target?.x ?? 0;
    const targetY = target?.y ?? 0;
    const radiusPx = (target?.radius ?? 0) * grid.cellSize;
    const radiusSq = radiusPx * radiusPx;

    for (let row = 0; row < grid.height; row++) {
        for (let col = 0; col < grid.width; col++) {
            if (hasTarget) {
                const { x, y } = grid.gridToWorld(col, row);
                const dx = x - targetX;
                const dy = y - targetY;
                if (dx * dx + dy * dy > radiusSq) continue;
            }
            if (isValidSpawnCell(ctx, terrainManager, occupiedCells, col, row, inDarkness)) candidates.push({ col, row });
        }
    }
    return candidates;
}

function chooseRandomIndices(ctx: SpawnUnitContext, availableCount: number, needed: number): number[] {
    const indices: number[] = [];
    for (let j = 0; j < availableCount; j++) indices.push(j);
    const result: number[] = [];
    const count = Math.min(needed, availableCount);
    for (let j = 0; j < count; j++) {
        const pickIndex = ctx.generateRandomInteger(0, indices.length - 1);
        const [chosen] = indices.splice(pickIndex, 1);
        result.push(chosen);
    }
    return result;
}

/** Chebyshev ring of cells at radius `r` around (originCol, originRow), clipped to the grid bounds. */
function getRingCells(originCol: number, originRow: number, r: number, width: number, height: number): GridCell[] {
    if (r === 0) {
        return originCol >= 0 && originCol < width && originRow >= 0 && originRow < height
            ? [{ col: originCol, row: originRow }]
            : [];
    }
    const cells: GridCell[] = [];
    const topRow = originRow - r;
    const bottomRow = originRow + r;
    const leftCol = originCol - r;
    const rightCol = originCol + r;
    if (topRow >= 0 && topRow < height) {
        for (let dc = -r; dc <= r; dc++) {
            const col = originCol + dc;
            if (col >= 0 && col < width) cells.push({ col, row: topRow });
        }
    }
    if (bottomRow >= 0 && bottomRow < height) {
        for (let dc = -r; dc <= r; dc++) {
            const col = originCol + dc;
            if (col >= 0 && col < width) cells.push({ col, row: bottomRow });
        }
    }
    if (leftCol >= 0 && leftCol < width) {
        for (let dr = -r + 1; dr <= r - 1; dr++) {
            const row = originRow + dr;
            if (row >= 0 && row < height) cells.push({ col: leftCol, row });
        }
    }
    if (rightCol >= 0 && rightCol < width) {
        for (let dr = -r + 1; dr <= r - 1; dr++) {
            const row = originRow + dr;
            if (row >= 0 && row < height) cells.push({ col: rightCol, row });
        }
    }
    return cells;
}

function resolveEdgeOfMapPositions(terrainManager: TerrainManager, count: number): WorldPos[] {
    const grid = terrainManager.grid;
    return getEdgePositions(count, grid.worldWidth, grid.worldHeight);
}

function resolveAnywherePositions(
    ctx: SpawnUnitContext,
    terrainManager: TerrainManager,
    occupiedCells: Set<string>,
    count: number,
    placement: Extract<SpawnPlacement, { kind: 'anywhere' }>,
): WorldPos[] {
    const inDarkness = placement.inDarkness === true;
    if (inDarkness && !ctx.lightLevelEnabled) {
        console.error('spawnUnit: anywhere inDarkness=true requested but light system is disabled; skipping this spawn entry.');
        return [];
    }

    const candidates = collectCandidateTiles(ctx, terrainManager, occupiedCells, inDarkness, placement.target, placement.zoneId);
    if (candidates.length === 0) {
        console.error(
            'spawnUnit: anywhere — no valid tiles found' +
                (placement.target ? ` near (${placement.target.x}, ${placement.target.y})` : '') +
                '; skipping this spawn entry.',
        );
        return [];
    }

    const spawnAttempts = Math.min(count, candidates.length);
    if (spawnAttempts < count) {
        console.error(`spawnUnit: anywhere — requested ${count} spawns but only found ${candidates.length} valid tiles.`);
    }

    const chosenCells = chooseRandomIndices(ctx, candidates.length, spawnAttempts).map((idx) => candidates[idx]!);
    for (const cell of chosenCells) occupiedCells.add(`${cell.col},${cell.row}`);
    return chosenCells.map((cell) => terrainManager.grid.gridToWorld(cell.col, cell.row));
}

/** Ring-scan outward from the average living-player position; stops once `count` valid cells are found. */
function resolveClosestToPlayersPositions(
    ctx: SpawnUnitContext,
    terrainManager: TerrainManager,
    occupiedCells: Set<string>,
    count: number,
    inDarkness: boolean,
): WorldPos[] {
    const livingPlayers = ctx.units.filter((u) => u.isPlayerControlled() && u.isAlive());
    if (livingPlayers.length === 0) {
        console.error('spawnUnit: closestToPlayers — no living player units; skipping this spawn entry.');
        return [];
    }

    const avgX = livingPlayers.reduce((s, u) => s + u.x, 0) / livingPlayers.length;
    const avgY = livingPlayers.reduce((s, u) => s + u.y, 0) / livingPlayers.length;
    const grid = terrainManager.grid;
    const { col: originCol, row: originRow } = grid.worldToGrid(avgX, avgY);
    const width = grid.width;
    const height = grid.height;

    const cells: GridCell[] = [];
    outer: for (let r = 0; r <= width + height; r++) {
        const ringCells = getRingCells(originCol, originRow, r, width, height);
        if (ringCells.length === 0 && r > 0) break;
        for (const cell of ringCells) {
            if (!isValidSpawnCell(ctx, terrainManager, occupiedCells, cell.col, cell.row, inDarkness)) continue;
            cells.push(cell);
            if (cells.length >= count) break outer;
        }
    }

    if (cells.length === 0) {
        console.error('spawnUnit: closestToPlayers — no valid tiles found; skipping this spawn entry.');
    } else if (cells.length < count) {
        console.error(`spawnUnit: closestToPlayers — requested ${count} spawns but only found ${cells.length} valid tiles.`);
    }

    for (const cell of cells) occupiedCells.add(`${cell.col},${cell.row}`);
    return cells.map((cell) => grid.gridToWorld(cell.col, cell.row));
}

/** Nearest eligible `enemySpawn` POI to any living player; POI cell itself (radius 0) or tiles within radius. */
function resolveClosestEnemySpawnPointPositions(
    ctx: SpawnUnitContext,
    terrainManager: TerrainManager,
    occupiedCells: Set<string>,
    count: number,
    placement: Extract<SpawnPlacement, { kind: 'closestEnemySpawnPoint' }>,
): WorldPos[] {
    const grid = terrainManager.grid;
    const poiRadius = placement.radius ?? 0;
    const inDarkness = placement.inDarkness === true;
    const matchesTags = placement.matchesTags;

    let eligiblePOIs = ctx.mapPOIs.filter((p) => p.type === 'enemySpawn');
    if (matchesTags && matchesTags.length > 0) {
        eligiblePOIs = eligiblePOIs.filter((p) => matchesTags.every((tag) => p.tags?.includes(tag)));
    }
    if (eligiblePOIs.length === 0) {
        console.warn(
            'spawnUnit: closestEnemySpawnPoint — no eligible enemySpawn POIs' +
                (matchesTags ? ` matching tags [${matchesTags.join(', ')}]` : '') +
                '; skipping this spawn entry.',
        );
        return [];
    }

    const livingPlayers = ctx.units.filter((u) => u.isPlayerControlled() && u.isAlive());
    if (livingPlayers.length === 0) {
        console.warn('spawnUnit: closestEnemySpawnPoint — no living player units; skipping this spawn entry.');
        return [];
    }

    let closestPOI = eligiblePOIs[0]!;
    let closestDistSq = Infinity;
    for (const poi of eligiblePOIs) {
        const poiWorld = grid.gridToWorld(poi.col, poi.row);
        for (const player of livingPlayers) {
            const dx = player.x - poiWorld.x;
            const dy = player.y - poiWorld.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < closestDistSq) {
                closestDistSq = distSq;
                closestPOI = poi;
            }
        }
    }

    let cells: GridCell[];
    if (poiRadius === 0) {
        const poiWorld = grid.gridToWorld(closestPOI.col, closestPOI.row);
        const key = `${closestPOI.col},${closestPOI.row}`;
        if (occupiedCells.has(key) || !terrainManager.isPassable(poiWorld.x, poiWorld.y)) {
            console.warn('spawnUnit: closestEnemySpawnPoint — POI cell is not passable or occupied; skipping spawn entry.');
            return [];
        }
        if (inDarkness) {
            const level = ctx.getLightAt(closestPOI.col, closestPOI.row);
            if (level == null) {
                console.warn('spawnUnit: closestEnemySpawnPoint inDarkness=true but light system is disabled; skipping spawn entry.');
                return [];
            }
            if (level > DarknessLevel.FULL_DARKNESS) {
                console.warn('spawnUnit: closestEnemySpawnPoint — POI cell is not in darkness; skipping spawn entry.');
                return [];
            }
        }
        cells = [{ col: closestPOI.col, row: closestPOI.row }];
    } else {
        const poiWorld = grid.gridToWorld(closestPOI.col, closestPOI.row);
        cells = collectCandidateTiles(ctx, terrainManager, occupiedCells, inDarkness, { x: poiWorld.x, y: poiWorld.y, radius: poiRadius }, undefined);
        if (cells.length === 0) {
            console.warn(
                `spawnUnit: closestEnemySpawnPoint — no valid tiles within radius ${poiRadius} of POI "${closestPOI.id}"` +
                    (inDarkness ? ' (inDarkness filter active)' : '') +
                    '; skipping this spawn entry.',
            );
            return [];
        }
    }

    const spawnAttempts = Math.min(count, cells.length);
    if (spawnAttempts < count) {
        console.warn(`spawnUnit: closestEnemySpawnPoint — requested ${count} spawns but only found ${cells.length} valid tiles.`);
    }

    const chosenCells = chooseRandomIndices(ctx, cells.length, spawnAttempts).map((idx) => cells[idx]!);
    for (const cell of chosenCells) occupiedCells.add(`${cell.col},${cell.row}`);
    return chosenCells.map((cell) => grid.gridToWorld(cell.col, cell.row));
}

/** Uniform-random annulus around an anchor unit — factored out of the three nest-tick modules. */
function resolveRelativeToUnitPositions(
    ctx: SpawnUnitContext,
    count: number,
    placement: Extract<SpawnPlacement, { kind: 'relativeToUnit' }>,
): WorldPos[] {
    const anchor = ctx.units.find((u) => u.id === placement.anchorUnitId);
    if (!anchor) {
        console.error(`spawnUnit: relativeToUnit — anchor unit "${placement.anchorUnitId}" not found; skipping this spawn entry.`);
        return [];
    }

    if (placement.fixedOffset) {
        const { dx, dy } = placement.fixedOffset;
        return Array.from({ length: count }, () => ({ x: anchor.x + dx, y: anchor.y + dy }));
    }

    const minRadius = placement.minRadiusPx ?? anchor.radius;
    const maxRadius = placement.maxRadiusPx;
    const positions: WorldPos[] = [];
    for (let i = 0; i < count; i++) {
        const angle = (ctx.generateRandomInteger(0, INT31) / INT31) * Math.PI * 2;
        const dist = minRadius + (ctx.generateRandomInteger(0, INT31) / INT31) * Math.max(0, maxRadius - minRadius);
        positions.push({ x: anchor.x + Math.cos(angle) * dist, y: anchor.y + Math.sin(angle) * dist });
    }
    return positions;
}

function resolvePlacements(ctx: SpawnUnitContext, placement: SpawnPlacement, count: number): WorldPos[] {
    if (placement.kind === 'fixedWorld') {
        return Array.from({ length: count }, () => ({ x: placement.x, y: placement.y }));
    }
    if (placement.kind === 'relativeToUnit') {
        return resolveRelativeToUnitPositions(ctx, count, placement);
    }

    const terrainManager = ctx.terrainManager;
    if (!terrainManager) {
        console.error(`spawnUnit: terrainManager is null; cannot resolve '${placement.kind}' placement.`);
        return [];
    }

    if (placement.kind === 'fixedGrid') {
        const pos = terrainManager.grid.gridToWorld(placement.col, placement.row);
        return Array.from({ length: count }, () => ({ ...pos }));
    }
    if (placement.kind === 'edgeOfMap') {
        return resolveEdgeOfMapPositions(terrainManager, count);
    }

    const occupiedCells = new Set<string>();
    if (placement.kind === 'anywhere') {
        return resolveAnywherePositions(ctx, terrainManager, occupiedCells, count, placement);
    }
    if (placement.kind === 'closestToPlayers') {
        const inDarkness = placement.inDarkness === true;
        if (inDarkness && !ctx.lightLevelEnabled) {
            console.error('spawnUnit: closestToPlayers inDarkness=true but light system is disabled; skipping this spawn entry.');
            return [];
        }
        return resolveClosestToPlayersPositions(ctx, terrainManager, occupiedCells, count, inDarkness);
    }
    if (placement.kind === 'closestEnemySpawnPoint') {
        return resolveClosestEnemySpawnPointPositions(ctx, terrainManager, occupiedCells, count, placement);
    }
    return [];
}

function applyAiHookup(ctx: SpawnUnitContext, unit: Unit, hookup: SpawnAiHookup | undefined): void {
    if (!hookup || hookup.kind === 'none') return;

    switch (hookup.kind) {
        case 'lanternite': {
            if (hookup.patrolFarWorld != null) unit.lanterniteState.patrolFarWorld = { ...hookup.patrolFarWorld };
            if (hookup.patrolLeg != null) unit.lanterniteState.patrolLeg = hookup.patrolLeg;
            if (hookup.role != null) unit.lanterniteState.role = hookup.role;
            if (hookup.targetNestPoiId != null) unit.lanterniteState.targetNestPoiId = hookup.targetNestPoiId;
            if (hookup.nestConfig != null) unit.lanterniteState.nestConfig = hookup.nestConfig;
            if (hookup.constructionAngle != null) unit.lanterniteState.constructionAngle = hookup.constructionAngle;
            if (hookup.attackReadyAtGameTime != null) unit.lanterniteState.attackReadyAtGameTime = hookup.attackReadyAtGameTime;
            if (hookup.nestOwnerUnitId != null) unit.lanterniteState.nestOwnerUnitId = hookup.nestOwnerUnitId;
            return;
        }
        case 'lanterniteNest': {
            unit.lanterniteState.nestConfig = hookup.nestConfig;
            if (hookup.homeNestPoiId != null) unit.lanterniteState.homeNestPoiId = hookup.homeNestPoiId;
            return;
        }
        case 'swarm': {
            if (hookup.orbitAngle != null) unit.swarmState.orbitAngle = hookup.orbitAngle;
            if (hookup.targetNestPoiId != null) unit.swarmState.targetNestPoiId = hookup.targetNestPoiId;
            if (hookup.nestOwnerUnitId != null) unit.swarmState.nestOwnerUnitId = hookup.nestOwnerUnitId;
            return;
        }
        case 'swarmNest': {
            unit.swarmState.nestConfig = hookup.nestConfig;
            if (hookup.homeNestPoiId != null) unit.swarmState.nestHomePoiId = hookup.homeNestPoiId;
            return;
        }
        case 'thornlingNest': {
            unit.thornlingState.nestConfig = hookup.nestConfig;
            return;
        }
        case 'pet': {
            unit.petState.ownerUnitId = hookup.ownerUnitId;
            unit.petState.defId = hookup.defId;
            const owner = ctx.units.find((u) => u.id === hookup.ownerUnitId);
            if (owner) owner.petState.unitIds.push(unit.id);
            return;
        }
    }
}

/**
 * Resolve placement, build the unit via `createUnitFromSpawnConfig`, apply AI-hookup state, and
 * add it to the battle. Returns the spawned units (fewer than `def.count` if placement resolution
 * couldn't find enough valid positions — see the console warnings emitted in that case).
 */
export function spawnUnit(ctx: SpawnUnitContext, def: SpawnDefinition, spawnSource?: SpawnSource): Unit[] {
    const count = Math.max(0, def.count ?? 1);
    if (count <= 0) return [];

    const positions = resolvePlacements(ctx, def.placement, count);
    if (positions.length === 0) return [];

    const unitAITreeId = def.unitAITreeId ?? (ctx.aiControllerId === 'alphaWolfBoss' ? 'alphaWolfBoss' : undefined);
    const spawned: Unit[] = [];

    for (const pos of positions) {
        const unit = createUnitFromSpawnConfig(
            {
                id: def.unitId,
                characterId: def.characterId,
                name: def.name ?? capitalizeCharacterId(def.characterId),
                hp: def.hp,
                speed: def.speed,
                stackSize: def.stackSize,
                x: pos.x,
                y: pos.y,
                teamId: def.teamId,
                ownerId: def.ownerId ?? 'ai',
                abilities: def.abilities,
                aiSettings: def.aiSettings,
                radius: def.radius,
                unitAITreeId,
                stamina: def.stamina,
                unitTags: def.unitTags,
                combatSettings: def.combatSettings,
                ephemeralDespawnAtGameTime: def.ephemeralDespawnAtGameTime,
                controlGroupId: def.controlGroupId,
                controllable: def.controllable,
            },
            ctx.eventBus,
            ctx,
        );

        if (def.invulnerabilityGenerations != null) unit.invulnerabilityGenerations = def.invulnerabilityGenerations;

        applyAiHookup(ctx, unit, def.aiHookup);
        ctx.addUnit(unit, spawnSource);
        spawned.push(unit);
    }

    return spawned;
}
