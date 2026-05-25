import type { BattleOrderRecord, PlayerState } from '../../../types';
import type { IBaseMissionDef } from '../storylines/BaseMissionDef';
import type { SerializedGameState } from '../game/types';
import { TerrainManager } from '../terrain/TerrainManager';
import { GameEngine } from '../game/GameEngine';

export interface ReplayState {
    tick: number;
    running: boolean;
    fingerprint: string;
    speed: number;
}

export interface ReplayConstructorArgs {
    initialState: SerializedGameState;
    orders: BattleOrderRecord[];
    mission: IBaseMissionDef;
    players: PlayerState[];
}

type ReplayListener = (state: ReplayState) => void;

function getDefaultLocalPlayerId(players: PlayerState[]): string {
    const hostPlayer = players.find((p) => p.isHost);
    return hostPlayer?.id ?? players[0]?.id ?? '1';
}

export class Replay {
    private readonly initialState: SerializedGameState;
    private readonly orders: BattleOrderRecord[];
    private readonly mission: IBaseMissionDef;
    private readonly players: PlayerState[];
    private engine: GameEngine;
    private readonly listeners = new Set<ReplayListener>();
    private running = false;
    private speed = 1;
    private rafId: number | null = null;
    private lastFrameTimeMs: number | null = null;
    private stepRemainder = 0;

    constructor(args: ReplayConstructorArgs) {
        this.initialState = args.initialState;
        this.orders = [...args.orders].sort((a, b) => a.atTick - b.atTick);
        this.mission = args.mission;
        this.players = args.players;
        this.engine = this.createEngine();
        this.emit();
    }

    private createEngine(): GameEngine {
        const terrain = this.mission.createTerrain();
        const terrainManager = new TerrainManager(terrain);
        const localPlayerId = getDefaultLocalPlayerId(this.players);
        const engine = GameEngine.fromJSON(this.initialState, localPlayerId, terrainManager);
        for (const record of this.orders) {
            engine.state.orderMgr.queueOrder(record.atTick, record.order);
        }
        return engine;
    }

    private getState(): ReplayState {
        return {
            tick: this.engine.gameTick,
            running: this.running,
            fingerprint: this.getCurrentFingerprint(),
            speed: this.speed,
        };
    }

    private emit(): void {
        const state = this.getState();
        for (const listener of this.listeners) {
            listener(state);
        }
    }

    private stopRaf(): void {
        if (this.rafId != null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        this.lastFrameTimeMs = null;
        this.stepRemainder = 0;
    }

    private tick = (ts: number): void => {
        if (!this.running) return;
        if (this.lastFrameTimeMs == null) {
            this.lastFrameTimeMs = ts;
        }
        const elapsedSeconds = Math.max(0, (ts - this.lastFrameTimeMs) / 1000);
        this.lastFrameTimeMs = ts;
        this.stepRemainder += elapsedSeconds * 60 * this.speed;
        const steps = Math.floor(this.stepRemainder);
        if (steps > 0) {
            this.stepRemainder -= steps;
            this.engine.stepSimulationFixedTicks(steps);
            this.emit();
        }
        this.rafId = requestAnimationFrame(this.tick);
    };

    setSpeed(speed: number): void {
        if (!Number.isFinite(speed) || speed <= 0) return;
        this.speed = speed;
        this.emit();
    }

    play(): void {
        if (this.running) return;
        this.running = true;
        this.lastFrameTimeMs = null;
        this.stepRemainder = 0;
        this.emit();
        this.rafId = requestAnimationFrame(this.tick);
    }

    pause(): void {
        if (!this.running) return;
        this.running = false;
        this.stopRaf();
        this.emit();
    }

    step(n = 1): void {
        const safeN = Math.max(0, Math.floor(n));
        if (safeN === 0) return;
        this.engine.stepSimulationFixedTicks(safeN);
        this.emit();
    }

    seek(tick: number): void {
        const safeTick = Math.max(0, Math.floor(tick));
        const currentTick = this.engine.gameTick;
        if (safeTick < currentTick) {
            this.engine.destroy();
            this.engine = this.createEngine();
            this.engine.stepSimulationFixedTicks(safeTick);
            this.emit();
            return;
        }
        if (safeTick > currentTick) {
            this.engine.stepSimulationFixedTicks(safeTick - currentTick);
            this.emit();
        }
    }

    getCurrentFingerprint(): string {
        return this.engine.getRuntimeFingerprintHex();
    }

    getEngine(): GameEngine {
        return this.engine;
    }

    getSpeed(): number {
        return this.speed;
    }

    subscribe(cb: ReplayListener): () => void {
        this.listeners.add(cb);
        cb(this.getState());
        return () => {
            this.listeners.delete(cb);
        };
    }

    dispose(): void {
        this.running = false;
        this.stopRaf();
        this.listeners.clear();
        this.engine.destroy();
    }
}
