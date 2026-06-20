/**
 * LevelEventManager - Owns level events, spawn wave processing,
 * continuous spawns, victory/defeat checks, and related callbacks.
 */

import type { EngineContext } from '../EngineContext';
import { DarknessLevel } from '../darknessLevels';
import type { Unit } from '../units/Unit';
import type {
    LevelEvent,
    LevelEventSpawnWave,
    LevelEventVictoryCheck,
    VictoryCondition,
    LevelEventContinuousSpawn,
    LevelEventProximitySpawn,
    LevelEventConvertSpecialTile,
    LevelEventSetWorldModifiers,
    EnemySpawnDef,
    SpawnWaveEntry,
} from '../../storylines/types';
import { getEdgePositions } from '../../storylines/edgeSpawns';
import { createUnitFromSpawnConfig } from '../units/index';
import { resolveEnemySpawnStats } from '../units/unit_defs/unitDef';
import {
    ENEMY_MELEE,
    SLIME,
    ENEMY_DARK_WOLF,
    ENEMY_ALPHA_WOLF,
    ENEMY_BOAR,
    ENEMY_THORNBINDER,
    ENEMY_HUSK_ARTILLERY,
    ENEMY_SWARMLING,
    ALLY_LANTERNITE,
    ENEMY_THORNLING,
    ENEMY_THORNLING_NEST,
    ALLY_THORNLING,
    getEnemyHealthMultiplier,
} from '../../constants/enemyConstants';

const BASE_SPAWN_DEFS: Record<string, EnemySpawnDef> = {
    enemy_melee: ENEMY_MELEE,
    slime: SLIME,
    dark_wolf: ENEMY_DARK_WOLF,
    alpha_wolf: ENEMY_ALPHA_WOLF,
    boar: ENEMY_BOAR,
    thornbinder: ENEMY_THORNBINDER,
    husk_artillery: ENEMY_HUSK_ARTILLERY,
    swarmling: ENEMY_SWARMLING,
    lanternite: ALLY_LANTERNITE,
    thornling: ENEMY_THORNLING,
    thornling_nest: ENEMY_THORNLING_NEST,
    ally_thornling: ALLY_THORNLING,
};
import { getLightGrid } from '../LightGrid';

const ROUND_DURATION = 10;

export class LevelEventManager {
    private levelEvents: LevelEvent[] = [];
    private firedEventIndices: Set<number> = new Set();
    private victoryCheckFirstEmitDone: Set<number> = new Set();
    private continuousSpawnLastSpawnedAt: Record<number, number> = {};

    private onEmitMessage: ((text: string, npcId?: string) => void) | null = null;
    private onVictory: ((missionResult: string) => void) | null = null;
    private onDefeat: (() => void) | null = null;

    private defeatFired = false;
    private defeated = false;
    private victoryFired = false;
    private victorious = false;

    private ctx: EngineContext;

    constructor(ctx: EngineContext) {
        this.ctx = ctx;
    }

    /** True when the game has ended (victory or defeat). */
    get isTerminal(): boolean {
        return this.defeated || this.victorious;
    }

    registerLevelEvents(events: LevelEvent[]): void {
        this.levelEvents = events;
        this.firedEventIndices.clear();
        this.victoryCheckFirstEmitDone.clear();
    }

    setLevelEvents(events: LevelEvent[]): void {
        this.levelEvents = events;
    }

    setOnEmitMessage(cb: (text: string, npcId?: string) => void): void {
        this.onEmitMessage = cb;
    }

    setOnVictory(cb: (missionResult: string) => void): void {
        this.onVictory = cb;
    }

    setOnDefeat(cb: () => void): void {
        this.onDefeat = cb;
    }

    resetTerminalState(): void {
        this.defeatFired = false;
        this.defeated = false;
        this.victoryFired = false;
        this.victorious = false;
    }

    private emitMessage(text: string, npcId?: string): void {
        this.onEmitMessage?.(text, npcId);
    }

    processLevelEvents(): void {
        if (this.ctx.storyPauseActive) return;
        for (let i = 0; i < this.levelEvents.length; i++) {
            const evt = this.levelEvents[i];
            if (evt.type === 'spawnWave') {
                this.processSpawnWaveEvent(i, evt);
            } else if (evt.type === 'continuousSpawn') {
                this.processContinuousSpawnEvent(i, evt);
            } else if (evt.type === 'proximitySpawn') {
                this.processProximitySpawnEvent(i, evt);
            } else if (evt.type === 'convertSpecialTile') {
                this.processConvertSpecialTileEvent(i, evt);
            } else if (evt.type === 'setWorldModifiers') {
                this.processSetWorldModifiersEvent(i, evt);
            } else if (evt.type === 'victoryCheck') {
                if (this.ctx.roundNumber >= evt.trigger.afterRound && this.ctx.gameTick % 10 === 0) {
                    this.runVictoryCheck(i, evt);
                }
            }
        }
    }

    private processSetWorldModifiersEvent(i: number, evt: LevelEventSetWorldModifiers): void {
        if (this.firedEventIndices.has(i)) return;

        let shouldFire = false;
        if ('atRound' in evt.trigger) {
            shouldFire = this.ctx.roundNumber >= evt.trigger.atRound;
        } else if ('afterSeconds' in evt.trigger) {
            shouldFire = this.ctx.gameTime >= evt.trigger.afterSeconds;
        }
        if (!shouldFire) return;

        this.firedEventIndices.add(i);
        if (evt.emittedMessage) this.emitMessage(evt.emittedMessage, evt.emittedByNpcId);

        const wmm = this.ctx.worldModifierManager;
        for (const a of evt.actions) {
            if (a.action === 'add') {
                wmm.addModifier(a.modifier);
            } else if (a.action === 'remove') {
                wmm.removeModifier(a.modifierId);
            } else if (a.action === 'enable') {
                wmm.setDisabled(a.modifierId, false);
            } else if (a.action === 'disable') {
                wmm.setDisabled(a.modifierId, true);
            }
        }
    }

    /** Optional Lantern ecology fields from mission spawn / wave entries. */
    private applyLanterniteEcologySpawnFields(unit: Unit, entry: SpawnWaveEntry | EnemySpawnDef): void {
        if ('lanterniteNestOwnerUnitId' in entry && entry.lanterniteNestOwnerUnitId != null) {
            unit.lanterniteNestOwnerUnitId = entry.lanterniteNestOwnerUnitId;
        }
        if ('lanternPatrolFarWorld' in entry && entry.lanternPatrolFarWorld != null) {
            unit.lanternPatrolFarWorld = { ...entry.lanternPatrolFarWorld };
        }
        if ('lanternPatrolLeg' in entry && (entry.lanternPatrolLeg === 'toFar' || entry.lanternPatrolLeg === 'toNest')) {
            unit.lanternPatrolLeg = entry.lanternPatrolLeg;
        }
    }

    private executeSpawnWaveSpawns(spawns: SpawnWaveEntry[]): void {
        const terrainManager = this.ctx.terrainManager;
        if (!terrainManager) {
            console.error('spawnWave: terrainManager is null; skipping spawn wave.');
            return;
        }

        const grid = terrainManager.grid;
        const width = grid.width;
        const height = grid.height;
        const cellSize = grid.cellSize;
        const playerCount = this.ctx.units.filter((u) => u.teamId === 'player').length;
        const enemyHealthMult = getEnemyHealthMultiplier(playerCount);

        const occupiedCells = new Set<string>();

        let lightGrid: number[][] | null = null;
        const needsDarkness = spawns.some(
            (entry) =>
                (entry.spawnBehaviour ?? 'edgeOfMap') === 'darkness' ||
                ((entry.spawnBehaviour ?? 'edgeOfMap') === 'closestEnemySpawnPoint' &&
                    entry.enemySpawnPointConfig?.inDarkness === true) ||
                ((entry.spawnBehaviour ?? 'edgeOfMap') === 'closest' &&
                    entry.closestConfig?.inDarkness === true),
        );
        if (needsDarkness) {
            if (!this.ctx.lightLevelEnabled) {
                console.error('spawnWave: spawnBehaviour "darkness" requested but light system is disabled; skipping darkness spawns.');
            } else {
                lightGrid = getLightGrid(this.ctx.globalLightLevel, width, height, this.ctx.getAllLightSources());
            }
        }

        const edgeEntries: { base: EnemySpawnDef; entry: SpawnWaveEntry; count: number }[] = [];
        const otherEntries: {
            base: EnemySpawnDef;
            entry: SpawnWaveEntry;
            behaviour: 'darkness' | 'anywhere';
            count: number;
        }[] = [];
        const closestPOIEntries: { base: EnemySpawnDef; entry: SpawnWaveEntry; count: number }[] = [];
        const closestEntries: { base: EnemySpawnDef; entry: SpawnWaveEntry; count: number }[] = [];

        for (const entry of spawns) {
            const cid = entry.characterId;
            const base = BASE_SPAWN_DEFS[cid];
            if (!base) continue;
            const behaviour = entry.spawnBehaviour ?? 'edgeOfMap';
            const count = Math.max(0, entry.spawnCount ?? 1);
            if (count <= 0) continue;

            if (behaviour === 'edgeOfMap') {
                edgeEntries.push({ base, entry, count });
            } else if (behaviour === 'closestEnemySpawnPoint') {
                closestPOIEntries.push({ base, entry, count });
            } else if (behaviour === 'closest') {
                closestEntries.push({ base, entry, count });
            } else {
                otherEntries.push({ base, entry, behaviour, count });
            }
        }

        const totalEdgeCount = edgeEntries.reduce((sum, e) => sum + e.count, 0);
        if (totalEdgeCount > 0) {
            const worldW = grid.worldWidth;
            const worldH = grid.worldHeight;
            const positions = getEdgePositions(totalEdgeCount, worldW, worldH);
            let idx = 0;
            for (const { base, entry, count } of edgeEntries) {
                for (let n = 0; n < count; n++) {
                    const pos = positions[idx] ?? { x: 40, y: 40 };
                    idx++;
                    const fallbackTreeId = this.ctx.aiControllerId === 'alphaWolfBoss' ? 'alphaWolfBoss' : 'default';
                    const stats = resolveEnemySpawnStats({ ...base, ...entry });
                    const config = {
                        ...base,
                        ...entry,
                        position: pos,
                        x: pos.x,
                        y: pos.y,
                        ownerId: 'ai' as const,
                        hp: Math.round(stats.hp * (base.teamId === 'enemy' ? enemyHealthMult : 1)),
                        speed: stats.speed,
                        unitAITreeId: entry.unitAITreeId ?? base.unitAITreeId ?? fallbackTreeId,
                    };
                    const unit = createUnitFromSpawnConfig(config, this.ctx.eventBus, this.ctx);
                    this.applyLanterniteEcologySpawnFields(unit, entry);
                    this.ctx.addUnit(unit);
                }
            }
        }

        const getRingCells = (
            originCol: number,
            originRow: number,
            r: number,
        ): { col: number; row: number }[] => {
            if (r === 0) {
                return originCol >= 0 && originCol < width && originRow >= 0 && originRow < height
                    ? [{ col: originCol, row: originRow }]
                    : [];
            }
            const cells: { col: number; row: number }[] = [];
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
        };

        const collectCandidateTiles = (
            behaviour: 'darkness' | 'anywhere',
            spawnTarget: { x: number; y: number; radius: number } | undefined,
        ): { col: number; row: number }[] => {
            const candidates: { col: number; row: number }[] = [];
            const hasTarget = !!spawnTarget;
            const targetX = spawnTarget?.x ?? 0;
            const targetY = spawnTarget?.y ?? 0;
            const radiusPx = (spawnTarget?.radius ?? 0) * cellSize;
            const radiusSq = radiusPx * radiusPx;

            for (let row = 0; row < height; row++) {
                for (let col = 0; col < width; col++) {
                    const key = `${col},${row}`;
                    if (occupiedCells.has(key)) continue;

                    const { x, y } = grid.gridToWorld(col, row);

                    if (hasTarget) {
                        const dx = x - targetX;
                        const dy = y - targetY;
                        if (dx * dx + dy * dy > radiusSq) continue;
                    }

                    if (!terrainManager.isPassable(x, y)) continue;

                    if (behaviour === 'darkness') {
                        if (!lightGrid) continue;
                        const level = lightGrid[row]?.[col];
                        if (level == null || level > DarknessLevel.FULL_DARKNESS) continue;
                    }

                    candidates.push({ col, row });
                }
            }

            return candidates;
        };

        const chooseRandomIndices = (availableCount: number, needed: number): number[] => {
            const indices: number[] = [];
            for (let j = 0; j < availableCount; j++) indices.push(j);
            const result: number[] = [];
            const count = Math.min(needed, availableCount);
            for (let j = 0; j < count; j++) {
                const pickIndex = this.ctx.generateRandomInteger(0, indices.length - 1);
                const [chosen] = indices.splice(pickIndex, 1);
                result.push(chosen);
            }
            return result;
        };

        for (const { base, entry, behaviour, count } of otherEntries) {
            if (behaviour === 'darkness' && (!this.ctx.lightLevelEnabled || !lightGrid)) {
                console.error('spawnWave: spawnBehaviour "darkness" has no valid light grid; skipping this spawn entry.');
                continue;
            }

            const candidates = collectCandidateTiles(behaviour === 'darkness' ? 'darkness' : 'anywhere', entry.spawnTarget);
            if (candidates.length === 0) {
                console.error(
                    `spawnWave: no valid tiles for behaviour "${behaviour}"` +
                        (entry.spawnTarget ? ` near (${entry.spawnTarget.x}, ${entry.spawnTarget.y})` : '') +
                        '; skipping this spawn entry.',
                );
                continue;
            }

            const spawnAttempts = Math.min(count, candidates.length);
            if (spawnAttempts < count) {
                console.error(
                    `spawnWave: requested ${count} spawns for behaviour "${behaviour}" but only found ${candidates.length} valid tiles.`,
                );
            }

            const chosenIndices = chooseRandomIndices(candidates.length, spawnAttempts);
            for (const idx of chosenIndices) {
                const cell = candidates[idx]!;
                const key = `${cell.col},${cell.row}`;
                occupiedCells.add(key);
                const pos = grid.gridToWorld(cell.col, cell.row);
                const fallbackTreeId = this.ctx.aiControllerId === 'alphaWolfBoss' ? 'alphaWolfBoss' : 'default';
                const stats = resolveEnemySpawnStats({ ...base, ...entry });
                const config = {
                    ...base,
                    ...entry,
                    position: pos,
                    x: pos.x,
                    y: pos.y,
                    ownerId: 'ai' as const,
                    hp: Math.round(stats.hp * (base.teamId === 'enemy' ? enemyHealthMult : 1)),
                    speed: stats.speed,
                    unitAITreeId: entry.unitAITreeId ?? base.unitAITreeId ?? fallbackTreeId,
                };
                const unit = createUnitFromSpawnConfig(config, this.ctx.eventBus, this.ctx);
                this.applyLanterniteEcologySpawnFields(unit, entry);
                this.ctx.addUnit(unit);
            }
        }

        // Handle 'closest' entries — scans Chebyshev rings outward from avg player position
        for (const { base, entry, count } of closestEntries) {
            const inDarkness = entry.closestConfig?.inDarkness === true;

            if (inDarkness && (!this.ctx.lightLevelEnabled || !lightGrid)) {
                console.error('spawnWave: closest inDarkness=true but no valid light grid; skipping this spawn entry.');
                continue;
            }

            const livingPlayers = this.ctx.units.filter((u) => u.isPlayerControlled() && u.isAlive());
            if (livingPlayers.length === 0) {
                console.error('spawnWave: closest — no living player units; skipping this spawn entry.');
                continue;
            }

            const avgX = livingPlayers.reduce((s, u) => s + u.x, 0) / livingPlayers.length;
            const avgY = livingPlayers.reduce((s, u) => s + u.y, 0) / livingPlayers.length;
            const { col: originCol, row: originRow } = grid.worldToGrid(avgX, avgY);

            const spawnCells: { col: number; row: number }[] = [];
            outer: for (let r = 0; r <= width + height; r++) {
                const ringCells = getRingCells(originCol, originRow, r);
                if (ringCells.length === 0 && r > 0) break;
                for (const cell of ringCells) {
                    const key = `${cell.col},${cell.row}`;
                    if (occupiedCells.has(key)) continue;
                    const { x, y } = grid.gridToWorld(cell.col, cell.row);
                    if (!terrainManager.isPassable(x, y)) continue;
                    if (inDarkness) {
                        const level = lightGrid![cell.row]?.[cell.col];
                        if (level == null || level > DarknessLevel.FULL_DARKNESS) continue;
                    }
                    spawnCells.push(cell);
                    if (spawnCells.length >= count) break outer;
                }
            }

            if (spawnCells.length === 0) {
                console.error('spawnWave: closest — no valid tiles found; skipping this spawn entry.');
                continue;
            }
            if (spawnCells.length < count) {
                console.error(`spawnWave: closest — requested ${count} spawns but only found ${spawnCells.length} valid tiles.`);
            }

            for (const cell of spawnCells) {
                const key = `${cell.col},${cell.row}`;
                occupiedCells.add(key);
                const pos = grid.gridToWorld(cell.col, cell.row);
                const fallbackTreeId = this.ctx.aiControllerId === 'alphaWolfBoss' ? 'alphaWolfBoss' : 'default';
                const stats = resolveEnemySpawnStats({ ...base, ...entry });
                const config = {
                    ...base,
                    ...entry,
                    position: pos,
                    x: pos.x,
                    y: pos.y,
                    ownerId: 'ai' as const,
                    hp: Math.round(stats.hp * (base.teamId === 'enemy' ? enemyHealthMult : 1)),
                    speed: stats.speed,
                    unitAITreeId: entry.unitAITreeId ?? base.unitAITreeId ?? fallbackTreeId,
                };
                const unit = createUnitFromSpawnConfig(config, this.ctx.eventBus, this.ctx);
                this.applyLanterniteEcologySpawnFields(unit, entry);
                this.ctx.addUnit(unit);
            }
        }

        // Handle 'closestEnemySpawnPoint' entries
        for (const { base, entry, count } of closestPOIEntries) {
            const cfg = entry.enemySpawnPointConfig;
            const matchesTags = cfg?.matchesTags;
            const poiRadius = cfg?.radius ?? 0;
            const inDarkness = cfg?.inDarkness === true;

            // Collect all enemySpawn POIs, optionally filtered by tags
            let eligiblePOIs = this.ctx.mapPOIs.filter((p) => p.type === 'enemySpawn');
            if (matchesTags && matchesTags.length > 0) {
                eligiblePOIs = eligiblePOIs.filter((p) =>
                    matchesTags.every((tag) => p.tags?.includes(tag)),
                );
            }

            if (eligiblePOIs.length === 0) {
                console.warn(
                    `spawnWave: closestEnemySpawnPoint — no eligible enemySpawn POIs` +
                        (matchesTags ? ` matching tags [${matchesTags.join(', ')}]` : '') +
                        '; skipping this spawn entry.',
                );
                continue;
            }

            // Find living player units to measure distance from
            const livingPlayers = this.ctx.units.filter((u) => u.isPlayerControlled() && u.isAlive());
            if (livingPlayers.length === 0) {
                console.warn('spawnWave: closestEnemySpawnPoint — no living player units; skipping this spawn entry.');
                continue;
            }

            // Find the closest eligible POI to any living player unit (world distance)
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

            // If radius is 0, just spawn on the POI cell itself (if passable)
            let spawnCells: { col: number; row: number }[];
            if (poiRadius === 0) {
                const poiWorld = grid.gridToWorld(closestPOI.col, closestPOI.row);
                const key = `${closestPOI.col},${closestPOI.row}`;
                if (!occupiedCells.has(key) && terrainManager.isPassable(poiWorld.x, poiWorld.y)) {
                    if (inDarkness) {
                        if (!lightGrid) {
                            console.warn('spawnWave: closestEnemySpawnPoint inDarkness=true but no lightGrid; skipping spawn entry.');
                            continue;
                        }
                        const level = lightGrid[closestPOI.row]?.[closestPOI.col];
                        if (level == null || level > DarknessLevel.FULL_DARKNESS) {
                            console.warn('spawnWave: closestEnemySpawnPoint — POI cell is not in darkness; skipping spawn entry.');
                            continue;
                        }
                    }
                    spawnCells = [{ col: closestPOI.col, row: closestPOI.row }];
                } else {
                    console.warn('spawnWave: closestEnemySpawnPoint — POI cell is not passable or occupied; skipping spawn entry.');
                    continue;
                }
            } else {
                // Build a synthetic SpawnTarget around the chosen POI
                const poiWorld = grid.gridToWorld(closestPOI.col, closestPOI.row);
                const syntheticTarget = { x: poiWorld.x, y: poiWorld.y, radius: poiRadius };
                spawnCells = collectCandidateTiles(inDarkness ? 'darkness' : 'anywhere', syntheticTarget);
                if (spawnCells.length === 0) {
                    console.warn(
                        `spawnWave: closestEnemySpawnPoint — no valid tiles within radius ${poiRadius} of POI "${closestPOI.id}"` +
                            (inDarkness ? ' (inDarkness filter active)' : '') +
                            '; skipping this spawn entry.',
                    );
                    continue;
                }
            }

            const spawnAttempts = Math.min(count, spawnCells.length);
            if (spawnAttempts < count) {
                console.warn(
                    `spawnWave: closestEnemySpawnPoint — requested ${count} spawns but only found ${spawnCells.length} valid tiles.`,
                );
            }

            const chosenIndices = chooseRandomIndices(spawnCells.length, spawnAttempts);
            for (const idx of chosenIndices) {
                const cell = spawnCells[idx]!;
                const key = `${cell.col},${cell.row}`;
                occupiedCells.add(key);
                const pos = grid.gridToWorld(cell.col, cell.row);
                const fallbackTreeId = this.ctx.aiControllerId === 'alphaWolfBoss' ? 'alphaWolfBoss' : 'default';
                const stats = resolveEnemySpawnStats({ ...base, ...entry });
                const config = {
                    ...base,
                    ...entry,
                    position: pos,
                    x: pos.x,
                    y: pos.y,
                    ownerId: 'ai' as const,
                    hp: Math.round(stats.hp * (base.teamId === 'enemy' ? enemyHealthMult : 1)),
                    speed: stats.speed,
                    unitAITreeId: entry.unitAITreeId ?? base.unitAITreeId ?? fallbackTreeId,
                };
                const unit = createUnitFromSpawnConfig(config, this.ctx.eventBus, this.ctx);
                this.applyLanterniteEcologySpawnFields(unit, entry);
                this.ctx.addUnit(unit);
            }
        }
    }

    private processProximitySpawnEvent(i: number, evt: LevelEventProximitySpawn): void {
        const once = evt.fireOnce !== false;
        if (once && this.firedEventIndices.has(i)) return;

        const r = evt.trigger.radiusPx;
        const r2 = r * r;
        const cx = evt.trigger.centerWorldX;
        const cy = evt.trigger.centerWorldY;
        const anyNear = this.ctx.units.some((u) => {
            if (!u.isPlayerControlled() || !u.isAlive()) return false;
            const dx = u.x - cx;
            const dy = u.y - cy;
            return dx * dx + dy * dy <= r2;
        });
        if (!anyNear) return;

        if (once) this.firedEventIndices.add(i);
        if (evt.emittedMessage) this.emitMessage(evt.emittedMessage, evt.emittedByNpcId);

        if (evt.spawnWaveEntries?.length) {
            this.executeSpawnWaveSpawns(evt.spawnWaveEntries);
        }

        const playerCount = this.ctx.units.filter((u) => u.teamId === 'player').length;
        const enemyHealthMult = getEnemyHealthMultiplier(playerCount);
        for (const def of evt.extraEnemySpawns ?? []) {
            const stats = resolveEnemySpawnStats(def);
            const unit = createUnitFromSpawnConfig(
                {
                    ...def,
                    x: def.position.x,
                    y: def.position.y,
                    ownerId: 'ai',
                    hp: Math.round(stats.hp * (def.teamId === 'enemy' ? enemyHealthMult : 1)),
                    speed: stats.speed,
                },
                this.ctx.eventBus,
                this.ctx,
            );
            this.applyLanterniteEcologySpawnFields(unit, def);
            this.ctx.addUnit(unit);
        }

        if (evt.revealObjectiveIds?.length) this.ctx.revealBattleObjectives(evt.revealObjectiveIds);
    }

    private processConvertSpecialTileEvent(i: number, evt: LevelEventConvertSpecialTile): void {
        if (this.firedEventIndices.has(i)) return;
        if (this.ctx.roundNumber < evt.trigger.atRound) return;

        this.firedEventIndices.add(i);
        if (evt.emittedMessage) this.emitMessage(evt.emittedMessage, evt.emittedByNpcId);

        const existing = this.ctx.specialTiles.find((t) => t.col === evt.col && t.row === evt.row);
        if (existing) {
            this.ctx.damageSpecialTile(existing.id, existing.hp + 1);
        }

        const rep = evt.replacementTile ?? {};
        const hp = rep.hp ?? 1;
        this.ctx.addSpecialTile({
            id: this.ctx.allocateObjectId?.('dark_crystal') ?? `dark_crystal_${i}`,
            defId: evt.replacementDefId,
            col: evt.col,
            row: evt.row,
            hp,
            maxHp: rep.maxHp ?? hp,
            emitsLight: rep.emitsLight,
            colorFilter: rep.colorFilter,
        });
    }

    private processSpawnWaveEvent(i: number, evt: LevelEventSpawnWave): void {
        if (this.firedEventIndices.has(i)) return;

        let shouldFire = false;
        if ('atRound' in evt.trigger) {
            shouldFire = this.ctx.roundNumber >= evt.trigger.atRound;
        } else if ('afterSeconds' in evt.trigger) {
            shouldFire = this.ctx.gameTime >= evt.trigger.afterSeconds;
        }
        if (!shouldFire) return;

        this.firedEventIndices.add(i);
        if (evt.emittedMessage) this.emitMessage(evt.emittedMessage, evt.emittedByNpcId);

        this.executeSpawnWaveSpawns(evt.spawns);
    }

    private processContinuousSpawnEvent(i: number, evt: LevelEventContinuousSpawn): void {
        const startRound = evt.trigger.startRound ?? 1;
        const endRound = evt.trigger.endRound;
        if (this.ctx.roundNumber < startRound) return;
        if (endRound != null && this.ctx.roundNumber > endRound) return;

        const intervalRounds = evt.trigger.intervalRounds;
        const lastSpawned = this.continuousSpawnLastSpawnedAt[i] ?? 0;
        if (this.ctx.gameTime - lastSpawned < intervalRounds * ROUND_DURATION) return;

        this.continuousSpawnLastSpawnedAt[i] = this.ctx.gameTime;

        const terrainManager = this.ctx.terrainManager;
        if (!terrainManager) return;
        const grid = terrainManager.grid;
        const width = grid.width;
        const height = grid.height;
        const cellSize = grid.cellSize;
        const playerCount = this.ctx.units.filter((u) => u.teamId === 'player').length;
        const enemyHealthMult = getEnemyHealthMultiplier(playerCount);

        const needsDarkness = evt.spawns.some((e) => (e.spawnBehaviour ?? 'darkness') === 'darkness');
        let lightGrid: number[][] | null = null;
        if (needsDarkness && this.ctx.lightLevelEnabled) {
            lightGrid = getLightGrid(this.ctx.globalLightLevel, width, height, this.ctx.getAllLightSources());
        }

        const maxUnits = evt.maxUnits;
        const unitCountByTeam: Record<string, number> | null =
            maxUnits != null
                ? this.ctx.units.reduce<Record<string, number>>((acc, u) => {
                      acc[u.teamId] = (acc[u.teamId] ?? 0) + 1;
                      return acc;
                  }, {})
                : null;

        const occupiedCells = new Set<string>();

        const collectCandidates = (
            behaviour: 'darkness' | 'anywhere',
            spawnTarget: { x: number; y: number; radius: number } | undefined,
        ): { col: number; row: number }[] => {
            const candidates: { col: number; row: number }[] = [];
            const hasTarget = !!spawnTarget;
            const targetX = spawnTarget?.x ?? 0;
            const targetY = spawnTarget?.y ?? 0;
            const radiusPx = (spawnTarget?.radius ?? 0) * cellSize;
            const radiusSq = radiusPx * radiusPx;
            for (let row = 0; row < height; row++) {
                for (let col = 0; col < width; col++) {
                    const key = `${col},${row}`;
                    if (occupiedCells.has(key)) continue;
                    const { x, y } = grid.gridToWorld(col, row);
                    if (!terrainManager.isPassable(x, y)) continue;
                    if (hasTarget) {
                        const dx = x - targetX;
                        const dy = y - targetY;
                        if (dx * dx + dy * dy > radiusSq) continue;
                    }
                    if (behaviour === 'darkness') {
                        if (!lightGrid) continue;
                        const level = lightGrid[row]?.[col];
                        if (level == null || level > DarknessLevel.FULL_DARKNESS) continue;
                    }
                    candidates.push({ col, row });
                }
            }
            return candidates;
        };

        const chooseRandomIndices = (availableCount: number, needed: number): number[] => {
            const indices: number[] = [];
            for (let j = 0; j < availableCount; j++) indices.push(j);
            const result: number[] = [];
            const count = Math.min(needed, availableCount);
            for (let j = 0; j < count; j++) {
                const pickIndex = this.ctx.generateRandomInteger(0, indices.length - 1);
                const [chosen] = indices.splice(pickIndex, 1);
                result.push(chosen);
            }
            return result;
        };

        for (const entry of evt.spawns) {
            const cid = entry.characterId;
            const base = BASE_SPAWN_DEFS[cid];
            if (!base) continue;
            const behaviour = (entry.spawnBehaviour ?? 'darkness') as 'darkness' | 'anywhere';
            const count = Math.max(0, entry.spawnCount ?? 1);
            if (count <= 0) continue;
            if (behaviour === 'darkness' && (!this.ctx.lightLevelEnabled || !lightGrid)) continue;

            if (maxUnits != null && unitCountByTeam && unitCountByTeam[base.teamId] > maxUnits) continue;

            const candidates = collectCandidates(behaviour, entry.spawnTarget);
            if (candidates.length === 0) continue;
            const spawnAttempts = Math.min(count, candidates.length);
            const chosenIndices = chooseRandomIndices(candidates.length, spawnAttempts);
            for (const idx of chosenIndices) {
                if (maxUnits != null && unitCountByTeam && unitCountByTeam[base.teamId] > maxUnits) break;
                const cell = candidates[idx]!;
                const key = `${cell.col},${cell.row}`;
                occupiedCells.add(key);
                const pos = grid.gridToWorld(cell.col, cell.row);
                const fallbackTreeId = this.ctx.aiControllerId === 'alphaWolfBoss' ? 'alphaWolfBoss' : 'default';
                const stats = resolveEnemySpawnStats({ ...base, ...entry });
                const config = {
                    ...base,
                    ...entry,
                    position: pos,
                    x: pos.x,
                    y: pos.y,
                    ownerId: 'ai' as const,
                    hp: Math.round(stats.hp * (base.teamId === 'enemy' ? enemyHealthMult : 1)),
                    speed: stats.speed,
                    unitAITreeId: entry.unitAITreeId ?? base.unitAITreeId ?? fallbackTreeId,
                };
                const unit = createUnitFromSpawnConfig(config, this.ctx.eventBus, this.ctx);
                this.ctx.addUnit(unit);
                if (unitCountByTeam) unitCountByTeam[base.teamId] += 1;
            }
        }
    }

    /** Run all victory checks (called periodically and before turns). */
    runVictoryChecks(): void {
        if (this.ctx.storyPauseActive) return;
        for (let i = 0; i < this.levelEvents.length; i++) {
            const evt = this.levelEvents[i];
            if (evt.type === 'victoryCheck') {
                if (this.ctx.roundNumber >= evt.trigger.afterRound) {
                    this.runVictoryCheck(i, evt);
                }
            }
        }
    }

    private runVictoryCheck(i: number, evt: LevelEventVictoryCheck): void {
        if (this.victoryFired) return;
        if (!this.victoryCheckFirstEmitDone.has(i)) {
            this.victoryCheckFirstEmitDone.add(i);
            if (evt.emittedMessage) this.emitMessage(evt.emittedMessage, evt.emittedByNpcId);
        }

        const allPass = evt.conditions.every((cond) => this.evaluateVictoryCondition(cond));
        if (allPass) {
            this.victoryFired = true;
            this.victorious = true;
            const missionResult = evt.missionResult ?? 'victory';
            this.onVictory?.(missionResult);
        }
    }

    private evaluateVictoryCondition(cond: VictoryCondition): boolean {
        if (cond.type === 'eliminateAllEnemies') {
            const hasEnemies = this.ctx.units.some(
                (u) => u.isAlive() && u.teamId === 'enemy',
            );
            return !hasEnemies;
        }
        if (cond.type === 'allUnitsNearPosition') {
            const maxDist = cond.maxDistance ?? 1;
            const alivePlayers = this.ctx.units.filter((u) => u.isPlayerControlled() && u.isAlive());
            if (alivePlayers.length === 0) return false;
            const grid = this.ctx.terrainManager?.grid;
            if (!grid) return false;
            return alivePlayers.every((u) => {
                const { col: uc, row: ur } = grid.worldToGrid(u.x, u.y);
                return Math.max(Math.abs(uc - cond.col), Math.abs(ur - cond.row)) <= maxDist;
            });
        }
        if (cond.type === 'unitDead') {
            const hasTargetAlive = this.ctx.units.some(
                (u) => u.isAlive() && u.characterId === cond.unitCharacterId,
            );
            return !hasTargetAlive;
        }
        if (cond.type === 'atLeastRound') {
            return this.ctx.roundNumber >= cond.round;
        }
        if (cond.type === 'aliveUnitCount') {
            const count = this.ctx.units.filter(
                (u) => u.isAlive() && u.characterId === cond.characterId,
            ).length;
            return count >= cond.minCount;
        }
        return false;
    }

    /** If all player units are dead, fire defeat once and pause. */
    runDefeatCheck(): void {
        if (this.ctx.storyPauseActive) return;
        if (this.defeatFired) return;
        const hasAlivePlayer = this.ctx.units.some(
            (u) => u.isPlayerControlled() && u.isAlive(),
        );
        if (!hasAlivePlayer) {
            this.defeatFired = true;
            this.defeated = true;
            this.onDefeat?.();
        }
    }

    toJSON(): {
        firedEventIndices: number[];
        victoryCheckFirstEmitDone: number[];
        continuousSpawnLastSpawnedAt: Record<string, number>;
    } {
        return {
            firedEventIndices: [...this.firedEventIndices],
            victoryCheckFirstEmitDone: [...this.victoryCheckFirstEmitDone],
            continuousSpawnLastSpawnedAt: Object.fromEntries(
                Object.entries(this.continuousSpawnLastSpawnedAt).map(([k, v]) => [k, v]),
            ),
        };
    }

    restoreFromJSON(data: {
        firedEventIndices?: number[];
        victoryCheckFirstEmitDone?: number[];
        continuousSpawnLastSpawnedAt?: Record<string, number>;
    }): void {
        if (Array.isArray(data.firedEventIndices)) {
            this.firedEventIndices = new Set(data.firedEventIndices);
        }
        if (Array.isArray(data.victoryCheckFirstEmitDone)) {
            this.victoryCheckFirstEmitDone = new Set(data.victoryCheckFirstEmitDone);
        }
        if (data.continuousSpawnLastSpawnedAt && typeof data.continuousSpawnLastSpawnedAt === 'object') {
            this.continuousSpawnLastSpawnedAt = { ...data.continuousSpawnLastSpawnedAt } as Record<number, number>;
        }
    }
}
