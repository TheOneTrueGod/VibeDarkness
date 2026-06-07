/**
 * EffectEmitter — base class for objects that produce visual Effects over time.
 *
 * EffectEmitters live in EffectEmitterManager and are ticked by the game loop
 * (game tick via update()) or the render loop (render tick via renderUpdate()).
 * They return new Effect instances rather than mutating game state directly,
 * keeping visual creation decoupled from simulation logic.
 *
 * Factory functions (closures) passed to concrete emitter constructors are
 * intentionally NOT serialized — they are runtime-only. Emitters are short-lived
 * and are re-created when the ability/event that spawned them re-runs.
 */

import type { Effect } from './Effect';
import type { EngineContext } from '../EngineContext';
import { generateGameObjectId } from '../GameObject';
import { type TerrainType } from '../../terrain/TerrainType';

export interface Vec2 { x: number; y: number; }

export abstract class EffectEmitter {
    readonly id: string;
    x: number;
    y: number;
    attachedToUnitId?: string;
    /** Game-seconds this emitter lives; Infinity = tied to an external ability timing window. */
    lifetime: number;
    elapsed: number = 0;
    active: boolean = true;
    /** When true, renderUpdate() is called even while the game is paused. */
    emitWhilePaused: boolean = false;

    constructor(config: {
        id?: string;
        x: number;
        y: number;
        attachedToUnitId?: string;
        lifetime?: number;
        emitWhilePaused?: boolean;
    }) {
        this.id = config.id ?? generateGameObjectId('emitter');
        this.x = config.x;
        this.y = config.y;
        this.attachedToUnitId = config.attachedToUnitId;
        this.lifetime = config.lifetime ?? Infinity;
        this.emitWhilePaused = config.emitWhilePaused ?? false;
    }

    /** Game tick — return any new Effects to add. Called by EffectEmitterManager.update(). */
    abstract update(dt: number, engine: EngineContext): Effect[];

    /**
     * Render tick — only called when paused AND emitWhilePaused is true (or when not paused,
     * for ContinuousEmitter). Return new Effects. posSnapshot is unit positions this frame.
     */
    renderUpdate(_realDt: number, _posSnapshot: Map<string, Vec2>): Effect[] {
        return [];
    }

    abstract toJSON(): Record<string, unknown>;
    abstract restoreFromJSON(data: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// OneShotEmitter — fires N effects immediately on first update tick
// ---------------------------------------------------------------------------

/** Fires effects exactly once on the first game tick, then deactivates. */
export class OneShotEmitter extends EffectEmitter {
    private factory: (emitter: OneShotEmitter, engine: EngineContext) => Effect[];
    private fired = false;

    constructor(config: ConstructorParameters<typeof EffectEmitter>[0] & {
        /** Called once on first update; return the Effects to add. Not serialized. */
        factory: (emitter: OneShotEmitter, engine: EngineContext) => Effect[];
    }) {
        super(config);
        this.factory = config.factory;
    }

    update(_dt: number, engine: EngineContext): Effect[] {
        if (this.fired) { this.active = false; return []; }
        this.fired = true;
        this.active = false;
        return this.factory(this, engine);
    }

    toJSON(): Record<string, unknown> {
        return { _type: 'OneShotEmitter', id: this.id, x: this.x, y: this.y, fired: this.fired };
    }

    restoreFromJSON(_d: Record<string, unknown>): void {
        // factory is a runtime closure — not restorable. Short-lived emitters are OK to drop on reconnect.
    }
}

// ---------------------------------------------------------------------------
// IntervalEmitter — fires effects every intervalSeconds over its lifetime
// ---------------------------------------------------------------------------

/** Fires effects on a fixed interval over a fixed lifetime (or until deactivated). */
export class IntervalEmitter extends EffectEmitter {
    intervalSeconds: number;
    /**
     * When set, emission is gated to tiles whose terrain type is in this list.
     * Position is synced from the attached unit (via attachedToUnitId) each game tick before the check.
     * If terrainManager is absent, no effects are emitted.
     */
    terrainCondition?: TerrainType[];
    private accumulator = 0;
    private factory: (emitter: IntervalEmitter, engine: EngineContext) => Effect[];

    constructor(config: ConstructorParameters<typeof EffectEmitter>[0] & {
        intervalSeconds: number;
        /** When true, seeds the accumulator so the first fire happens on the very first tick. */
        fireImmediately?: boolean;
        /**
         * Restrict emission to the listed terrain types at the emitter's current position.
         * Requires terrainManager to be present on the engine; emits nothing if absent.
         */
        terrainCondition?: TerrainType[];
        /** Called each interval; return the Effects to add. Not serialized. */
        factory: (emitter: IntervalEmitter, engine: EngineContext) => Effect[];
    }) {
        super(config);
        this.intervalSeconds = config.intervalSeconds;
        this.terrainCondition = config.terrainCondition;
        this.factory = config.factory;
        if (config.fireImmediately) {
            this.accumulator = config.intervalSeconds;
        }
    }

    update(dt: number, engine: EngineContext): Effect[] {
        // Sync position from attached unit before terrain check.
        if (this.attachedToUnitId) {
            const unit = engine.getUnit(this.attachedToUnitId);
            if (unit) { this.x = unit.x; this.y = unit.y; }
        }

        this.elapsed += dt;
        this.accumulator += dt;
        const results: Effect[] = [];

        // Gate emission to specific terrain types when terrainCondition is specified.
        const passesTerrainCondition = !this.terrainCondition || this.terrainCondition.length === 0 ||
            (engine.terrainManager !== null &&
             this.terrainCondition.includes(engine.terrainManager.getTerrainAt(this.x, this.y)));

        while (this.accumulator >= this.intervalSeconds) {
            this.accumulator -= this.intervalSeconds;
            if (passesTerrainCondition) {
                results.push(...this.factory(this, engine));
            }
        }
        if (this.lifetime !== Infinity && this.elapsed >= this.lifetime) {
            this.active = false;
        }
        return results;
    }

    toJSON(): Record<string, unknown> {
        return {
            _type: 'IntervalEmitter',
            id: this.id,
            x: this.x,
            y: this.y,
            elapsed: this.elapsed,
            accumulator: this.accumulator,
            lifetime: this.lifetime,
        };
    }

    restoreFromJSON(d: Record<string, unknown>): void {
        this.elapsed = (d.elapsed as number) ?? 0;
        this.accumulator = (d.accumulator as number) ?? 0;
    }
}

// ---------------------------------------------------------------------------
// ContinuousEmitter — fires effects every render frame (or every N frames)
// ---------------------------------------------------------------------------

/**
 * Emits effects every render frame (or every N frames).
 * Supports emitWhilePaused for effects that should animate through game pause.
 * Lifetime is tracked in game-seconds via update(); deactivates when lifetime elapses.
 */
export class ContinuousEmitter extends EffectEmitter {
    /** Emit every this many render frames (default 1 = every frame). */
    emitIntervalFrames: number;
    private frameCount = 0;
    private factory: (emitter: ContinuousEmitter, posSnapshot: Map<string, Vec2>) => Effect[];

    constructor(config: ConstructorParameters<typeof EffectEmitter>[0] & {
        emitIntervalFrames?: number;
        /** Called each emit frame; posSnapshot has current unit world positions. Not serialized. */
        factory: (emitter: ContinuousEmitter, posSnapshot: Map<string, Vec2>) => Effect[];
    }) {
        super(config);
        this.emitIntervalFrames = config.emitIntervalFrames ?? 1;
        this.factory = config.factory;
    }

    /** Game tick — only tracks elapsed to expire the emitter; does not emit effects. */
    update(dt: number, _engine: EngineContext): Effect[] {
        this.elapsed += dt;
        if (this.lifetime !== Infinity && this.elapsed >= this.lifetime) {
            this.active = false;
        }
        return [];
    }

    /** Render tick — emits effects every emitIntervalFrames render frames. */
    override renderUpdate(realDt: number, posSnapshot: Map<string, Vec2>): Effect[] {
        void realDt;
        if (!this.active) return [];
        if (this.attachedToUnitId) {
            const pos = posSnapshot.get(this.attachedToUnitId);
            if (pos) { this.x = pos.x; this.y = pos.y; }
        }
        this.frameCount++;
        if (this.frameCount % this.emitIntervalFrames !== 0) return [];
        return this.factory(this, posSnapshot);
    }

    toJSON(): Record<string, unknown> {
        return {
            _type: 'ContinuousEmitter',
            id: this.id,
            x: this.x,
            y: this.y,
            elapsed: this.elapsed,
            lifetime: this.lifetime,
        };
    }

    restoreFromJSON(d: Record<string, unknown>): void {
        this.elapsed = (d.elapsed as number) ?? 0;
    }
}
