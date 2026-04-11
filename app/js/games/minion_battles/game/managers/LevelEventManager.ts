/**
 * LevelEventManager - Owns level events, spawn wave processing,
 * continuous spawns, victory/defeat checks, and related callbacks.
 */

import type { EngineContext } from '../EngineContext';
import type {
    LevelEvent,
    LevelEventSpawnWave,
    LevelEventVictoryCheck,
    VictoryCondition,
    LevelEventContinuousSpawn,
} from '../../storylines/types';
import { getEdgePositions } from '../../storylines/edgeSpawns';
import { createUnitFromSpawnConfig } from '../units/index';
import {
    ENEMY_MELEE,
    ENEMY_RANGED,
    ENEMY_DARK_WOLF,
    ENEMY_ALPHA_WOLF,
    ENEMY_BOAR,
    getEnemyHealthMultiplier,
} from '../../constants/enemyConstants';
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
        for (let i = 0; i < this.levelEvents.length; i++) {
            const evt = this.levelEvents[i];
            if (evt.type === 'spawnWave') {
                this.processSpawnWaveEvent(i, evt);
            } else if (evt.type === 'continuousSpawn') {
                this.processContinuousSpawnEvent(i, evt);
            } else if (evt.type === 'victoryCheck') {
                if (this.ctx.roundNumber >= evt.trigger.afterRound && this.ctx.gameTick % 10 === 0) {
                    this.runVictoryCheck(i, evt);
                }
            }
        }
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

        const terrainManager = this.ctx.terrainManager;
        if (!terrainManager) {
            // eslint-disable-next-line no-console
            console.error('spawnWave: terrainManager is null; skipping spawn wave.');
            return;
        }

        const grid = terrainManager.grid;
        const width = grid.width;
        const height = grid.height;
        const cellSize = grid.cellSize;
        const baseDefs = {
            enemy_melee: ENEMY_MELEE,
            enemy_ranged: ENEMY_RANGED,
            dark_wolf: ENEMY_DARK_WOLF,
            alpha_wolf: ENEMY_ALPHA_WOLF,
            boar: ENEMY_BOAR,
        };
        const playerCount = this.ctx.units.filter((u) => u.teamId === 'player').length;
        const enemyHealthMult = getEnemyHealthMultiplier(playerCount);

        const occupiedCells = new Set<string>();

        let lightGrid: number[][] | null = null;
        const needsDarkness = evt.spawns.some((entry) => (entry.spawnBehaviour ?? 'edgeOfMap') === 'darkness');
        if (needsDarkness) {
            if (!this.ctx.lightLevelEnabled) {
                // eslint-disable-next-line no-console
                console.error('spawnWave: spawnBehaviour "darkness" requested but light system is disabled; skipping darkness spawns.');
            } else {
                lightGrid = getLightGrid(this.ctx.globalLightLevel, width, height, this.ctx.getAllLightSources());
            }
        }

        const edgeEntries: { base: typeof ENEMY_MELEE; entry: LevelEventSpawnWave['spawns'][number]; count: number }[] = [];
        const otherEntries: {
            base: typeof ENEMY_MELEE;
            entry: LevelEventSpawnWave['spawns'][number];
            behaviour: 'edgeOfMap' | 'darkness' | 'anywhere';
            count: number;
        }[] = [];

        for (const entry of evt.spawns) {
            const cid = entry.characterId;
            if (cid !== 'enemy_melee' && cid !== 'enemy_ranged' && cid !== 'dark_wolf' && cid !== 'alpha_wolf' && cid !== 'boar') continue;
            const base = baseDefs[cid];
            const behaviour = entry.spawnBehaviour ?? 'edgeOfMap';
            const count = Math.max(0, entry.spawnCount ?? 1);
            if (count <= 0) continue;

            if (behaviour === 'edgeOfMap') {
                edgeEntries.push({ base, entry, count });
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
                    const config = {
                        ...base,
                        ...entry,
                        position: pos,
                        x: pos.x,
                        y: pos.y,
                        ownerId: 'ai' as const,
                        hp: Math.round((entry.hp ?? base.hp) * enemyHealthMult),
                        unitAITreeId: entry.unitAITreeId ?? base.unitAITreeId ?? fallbackTreeId,
                    };
                    const unit = createUnitFromSpawnConfig(config, this.ctx.eventBus);
                    this.ctx.addUnit(unit);
                }
            }
        }

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
                        if (level == null || level > -20) continue;
                    }

                    candidates.push({ col, row });
                }
            }

            return candidates;
        };

        const chooseRandomIndices = (availableCount: number, needed: number): number[] => {
            const indices: number[] = [];
            for (let i = 0; i < availableCount; i++) indices.push(i);
            const result: number[] = [];
            const count = Math.min(needed, availableCount);
            for (let i = 0; i < count; i++) {
                const pickIndex = this.ctx.generateRandomInteger(0, indices.length - 1);
                const [chosen] = indices.splice(pickIndex, 1);
                result.push(chosen);
            }
            return result;
        };

        for (const { base, entry, behaviour, count } of otherEntries) {
            if (behaviour === 'darkness' && (!this.ctx.lightLevelEnabled || !lightGrid)) {
                // eslint-disable-next-line no-console
                console.error('spawnWave: spawnBehaviour "darkness" has no valid light grid; skipping this spawn entry.');
                continue;
            }

            const candidates = collectCandidateTiles(behaviour === 'darkness' ? 'darkness' : 'anywhere', entry.spawnTarget);
            if (candidates.length === 0) {
                // eslint-disable-next-line no-console
                console.error(
                    `spawnWave: no valid tiles for behaviour "${behaviour}"` +
                        (entry.spawnTarget ? ` near (${entry.spawnTarget.x}, ${entry.spawnTarget.y})` : '') +
                        '; skipping this spawn entry.',
                );
                continue;
            }

            const spawnAttempts = Math.min(count, candidates.length);
            if (spawnAttempts < count) {
                // eslint-disable-next-line no-console
                console.error(
                    `spawnWave: requested ${count} spawns for behaviour "${behaviour}" but only found ${candidates.length} valid tiles.`,
                );
            }

            const chosenIndices = chooseRandomIndices(candidates.length, spawnAttempts);
            for (const idx of chosenIndices) {
                const cell = candidates[idx];
                const key = `${cell.col},${cell.row}`;
                occupiedCells.add(key);
                const pos = grid.gridToWorld(cell.col, cell.row);
                const fallbackTreeId = this.ctx.aiControllerId === 'alphaWolfBoss' ? 'alphaWolfBoss' : 'default';
                const config = {
                    ...base,
                    ...entry,
                    position: pos,
                    x: pos.x,
                    y: pos.y,
                    ownerId: 'ai' as const,
                    hp: Math.round((entry.hp ?? base.hp) * enemyHealthMult),
                    unitAITreeId: entry.unitAITreeId ?? base.unitAITreeId ?? fallbackTreeId,
                };
                const unit = createUnitFromSpawnConfig(config, this.ctx.eventBus);
                this.ctx.addUnit(unit);
            }
        }
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
        const baseDefs = {
            enemy_melee: ENEMY_MELEE,
            enemy_ranged: ENEMY_RANGED,
            dark_wolf: ENEMY_DARK_WOLF,
            alpha_wolf: ENEMY_ALPHA_WOLF,
            boar: ENEMY_BOAR,
        };
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
                        if (level == null || level > -20) continue;
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
            if (cid !== 'enemy_melee' && cid !== 'enemy_ranged' && cid !== 'dark_wolf' && cid !== 'alpha_wolf' && cid !== 'boar') continue;
            const base = baseDefs[cid];
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
                const config = {
                    ...base,
                    ...entry,
                    position: pos,
                    x: pos.x,
                    y: pos.y,
                    ownerId: 'ai' as const,
                    hp: Math.round((entry.hp ?? base.hp) * enemyHealthMult),
                    unitAITreeId: entry.unitAITreeId ?? base.unitAITreeId ?? fallbackTreeId,
                };
                const unit = createUnitFromSpawnConfig(config, this.ctx.eventBus);
                this.ctx.addUnit(unit);
                if (unitCountByTeam) unitCountByTeam[base.teamId] += 1;
            }
        }
    }

    /** Run all victory checks (called periodically and before turns). */
    runVictoryChecks(): void {
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
        return false;
    }

    /** If all player units are dead, fire defeat once and pause. */
    runDefeatCheck(): void {
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
