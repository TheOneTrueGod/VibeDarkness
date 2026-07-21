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
    LevelEventProximitySpawn,
    LevelEventConvertSpecialTile,
    LevelEventSetWorldModifiers,
    EnemySpawnDef,
    SpawnWaveEntry,
} from '../../storylines/types';
import { resolveEnemySpawnStats } from '../units/unit_defs/unitDef';
import { spawnUnit } from '../units/spawning/spawnUnit';
import { enemySpawnDefToSpawnDefinition, spawnWaveEntryToSpawnDefinition } from '../units/spawning/adapters';
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

const ROUND_DURATION = 10;

/** Game time (seconds) when a continuousSpawn with this startRound may first fire. */
export function continuousSpawnStartGameTime(startRound: number): number {
    return startRound < 1 ? startRound * ROUND_DURATION : (startRound - 1) * ROUND_DURATION;
}

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
    /** Set when victory fires; used to re-emit UI callbacks suppressed during sequential targeting preview. */
    private lastMissionResult: string | null = null;

    private ctx: EngineContext;

    constructor(ctx: EngineContext) {
        this.ctx = ctx;
    }

    /** True when the game has ended (victory or defeat). */
    get isTerminal(): boolean {
        return this.defeated || this.victorious;
    }

    /**
     * Outcome latched by {@link runVictoryCheck} / {@link runDefeatCheck}.
     * Interactive preview suppresses `onVictory`/`onDefeat` in {@link BattleSession}; in-place
     * commit re-emits via this when `isTerminal` is already true.
     */
    getTerminalOutcome(): { kind: 'victory'; missionResult: string } | { kind: 'defeat' } | null {
        if (this.victorious) {
            return { kind: 'victory', missionResult: this.lastMissionResult ?? 'victory' };
        }
        if (this.defeated) {
            return { kind: 'defeat' };
        }
        return null;
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
        this.lastMissionResult = null;
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

    private executeSpawnWaveSpawns(spawns: SpawnWaveEntry[]): void {
        const enemyHealthMult = getEnemyHealthMultiplier(this.ctx.enemyScalingPlayerCount);

        for (const entry of spawns) {
            const base = BASE_SPAWN_DEFS[entry.characterId];
            if (!base) continue;

            const def = spawnWaveEntryToSpawnDefinition(base, entry, 'ai');
            const stats = resolveEnemySpawnStats({ ...base, ...entry });
            def.hp = Math.round(stats.hp * (base.teamId === 'enemy' ? enemyHealthMult : 1));
            def.speed = stats.speed;

            spawnUnit(this.ctx, def, undefined);
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

        const enemyHealthMult = getEnemyHealthMultiplier(this.ctx.enemyScalingPlayerCount);
        for (const enemyDef of evt.extraEnemySpawns ?? []) {
            const def = enemySpawnDefToSpawnDefinition(enemyDef, 'ai');
            const stats = resolveEnemySpawnStats(enemyDef);
            def.hp = Math.round(stats.hp * (enemyDef.teamId === 'enemy' ? enemyHealthMult : 1));
            def.speed = stats.speed;

            spawnUnit(this.ctx, def, undefined);
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
        const startRound = evt.trigger.startRound;
        const endRound = evt.trigger.endRound;
        if (endRound != null && this.ctx.roundNumber > endRound) return;

        const intervalRounds = evt.trigger.intervalRounds;
        const intervalSeconds = intervalRounds * ROUND_DURATION;

        if (startRound !== undefined) {
            if (this.ctx.gameTime < continuousSpawnStartGameTime(startRound)) return;
        } else if (this.ctx.roundNumber < 1) {
            return;
        }

        let lastSpawned = this.continuousSpawnLastSpawnedAt[i];
        if (lastSpawned === undefined) {
            if (startRound !== undefined) {
                lastSpawned = continuousSpawnStartGameTime(startRound) - intervalSeconds;
            } else {
                // Legacy default: first spawn after one full interval (startRound omitted).
                lastSpawned = 0;
            }
        }
        if (this.ctx.gameTime - lastSpawned < intervalSeconds) return;

        this.continuousSpawnLastSpawnedAt[i] = this.ctx.gameTime;

        const enemyHealthMult = getEnemyHealthMultiplier(this.ctx.enemyScalingPlayerCount);

        const maxUnits = evt.maxUnits;
        const unitCountByTeam: Record<string, number> | null =
            maxUnits != null
                ? this.ctx.units.reduce<Record<string, number>>((acc, u) => {
                      acc[u.teamId] = (acc[u.teamId] ?? 0) + 1;
                      return acc;
                  }, {})
                : null;

        const isOverCap = (teamId: string): boolean =>
            maxUnits != null && unitCountByTeam != null && unitCountByTeam[teamId] > maxUnits;

        for (const entry of evt.spawns) {
            const base = BASE_SPAWN_DEFS[entry.characterId];
            if (!base) continue;
            if (isOverCap(base.teamId)) continue;

            const def = spawnWaveEntryToSpawnDefinition(base, entry, 'ai');
            const stats = resolveEnemySpawnStats({ ...base, ...entry });
            def.hp = Math.round(stats.hp * (base.teamId === 'enemy' ? enemyHealthMult : 1));
            def.speed = stats.speed;

            if (maxUnits != null) {
                // Per-unit cap check: a burst can partially fulfill under a cap, so this cannot
                // be a single batched spawnUnit(..., def) call — each attempt is its own call.
                const attempts = def.count ?? 1;
                for (let n = 0; n < attempts; n++) {
                    if (isOverCap(base.teamId)) break;
                    const spawned = spawnUnit(this.ctx, { ...def, count: 1 }, undefined);
                    if (unitCountByTeam) unitCountByTeam[base.teamId] = (unitCountByTeam[base.teamId] ?? 0) + spawned.length;
                }
            } else {
                spawnUnit(this.ctx, def, undefined);
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
            this.lastMissionResult = missionResult;
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

    /** If all hero-team player units are dead, fire defeat once and pause. */
    runDefeatCheck(): void {
        if (this.ctx.storyPauseActive) return;
        if (this.defeatFired) return;
        // teamId === 'player' so a controlled enemy (e.g. wolf) does not block defeat.
        const hasAlivePlayer = this.ctx.units.some(
            (u) => u.teamId === 'player' && u.isPlayerControlled() && u.isAlive(),
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
