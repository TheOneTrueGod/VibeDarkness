/**
 * Buff - Base class for unit buffs/debuffs.
 *
 * Buffs have a type (string union), duration (rounds or seconds), and optional properties.
 * All buffs are serializable and deserializable for checkpoint/sync.
 */

/** Duration can be in rounds or seconds. */
export type BuffDuration =
    | { value: number; unit: 'rounds' }
    | { value: number; unit: 'seconds' };

import type { Unit } from '../game/units/Unit';
import type { EventBus } from '../game/EventBus';
import type { TerrainManager } from '../terrain/TerrainManager';
import type { EngineContext } from '../game/EngineContext';
import type { Effect } from '../game/effects/Effect';
import type { TimeModifier } from '../game/time/TimeModifier';
import type { BuffParticleAuraDef } from '../game/effects/buffParticleAura';

/**
 * Which clock a timed buff's duration runs on. `'world'` (default): `engine.gameTime`. `'owner'`: the
 * buff holder's `unit.localTime`, so the buff pauses while the unit is frozen and follows its tempo
 * (use for buffs that represent motion, e.g. `LiftedBuff`).
 */
export type BuffClock = 'world' | 'owner';

/** Context passed to {@link Buff.onBeforeExpire} when a timed buff is removed. */
export interface BuffExpireContext {
    gameTime: number;
    roundNumber: number;
    eventBus: EventBus;
    terrainManager: TerrainManager | null;
    /** Live unit list for expire-time AoE (e.g. slam knockback). */
    units?: readonly Unit[];
    interruptUnitAndRefundAbilities?(unit: Unit): void;
    /** Spawn a visual effect at expiry (e.g. a detonation burst). */
    addEffect?(effect: Effect): void;
}

/** Serializable buff data. Subclasses extend with their own fields. */
export interface BuffSerialized {
    _type: string;
    /** Game time (seconds) when buff was applied. Used for seconds-based duration. */
    appliedAtTime?: number;
    /** Round number when buff was applied. Used for rounds-based duration. */
    appliedAtRound?: number;
    /** Duration value. */
    durationValue: number;
    /** Duration unit. */
    durationUnit: 'rounds' | 'seconds';
}

/**
 * Base Buff class. Subclasses extend and add type-specific properties.
 * Buffs are identified by their _type string for fast lookup.
 */
export abstract class Buff {
    /** Unique type string for this buff (e.g. 'stunned'). Used for hasBuff checks. */
    abstract readonly _type: string;

    /** Duration of the buff. */
    readonly duration: BuffDuration;

    /**
     * When true, a unit carrying this buff cannot take new orders or advance along a movement
     * path (read by `Unit.canAct()` and the `unitMovementTick` guard). Subclasses override.
     * Stunned / exposed / lifted still use their hardcoded checks; new blocking buffs should
     * set this instead of growing those type-string lists.
     */
    readonly blocksActing: boolean = false;

    /**
     * Clock the duration runs on (def-pattern property; subclasses override). Default `'world'`.
     * With `'owner'`, `appliedAtTime` is a local-time timestamp on the holder (see `Unit.addBuff`).
     */
    readonly clock: BuffClock = 'world';

    /**
     * Tempo source carried by this buff (tempo / focal / freeze). Default none. Subclasses set it;
     * `getActorTempo` multiplies it in and focal requests feed world pace. See `game/time/AGENTS.md`.
     */
    readonly timeModifier?: TimeModifier;

    /**
     * Render-only particles emitted from the holder (idle / moving states). Default none. Emitted on wall time by
     * `BuffParticleAuraSystem`, so they keep animating while paused. See `game/effects/buffParticleAura.ts`.
     */
    readonly particleAura?: BuffParticleAuraDef;

    /** Game time (seconds) when buff was applied (local time when `clock === 'owner'`). Set by Unit when adding. */
    appliedAtTime: number = 0;

    /** Round number when buff was applied. Set by Unit when adding. */
    appliedAtRound: number = 1;

    constructor(duration: BuffDuration) {
        this.duration = duration;
    }

    /**
     * Optional hook invoked once when {@link isExpired} is true, before the buff is removed
     * from the unit's buff list. Generic engine path — no buff-type branching in the tick loop.
     */
    onBeforeExpire?(_unit: Unit, _ctx: BuffExpireContext): void;

    /**
     * Optional hook invoked every game tick while the buff is on the unit, just before the
     * expiry check (e.g. gravity locus field pulses). Generic engine path — no buff-type
     * branching in the tick loop.
     */
    onGameTick?(_unit: Unit, _engine: EngineContext, _dt: number): void;

    /**
     * Check if this buff has expired at the given game state.
     * @param ownerLocalTime - the holder's local time; used instead of `gameTime` when `clock === 'owner'`.
     */
    isExpired(gameTime: number, roundNumber: number, ownerLocalTime?: number): boolean {
        if (this.duration.unit === 'seconds') {
            const now = this.clock === 'owner' && ownerLocalTime !== undefined ? ownerLocalTime : gameTime;
            return now - this.appliedAtTime >= this.duration.value;
        }
        return roundNumber - this.appliedAtRound >= this.duration.value;
    }

    /** Serialize to JSON. Subclasses should call super.toJSON() and add their fields. */
    toJSON(): BuffSerialized {
        return {
            _type: this._type,
            appliedAtTime: this.appliedAtTime,
            appliedAtRound: this.appliedAtRound,
            durationValue: this.duration.value,
            durationUnit: this.duration.unit,
        };
    }

    /** Create from JSON. Subclasses override and call super.fromJSON for base fields. */
    static fromJSON(_data: BuffSerialized): Buff {
        throw new Error('Subclasses must implement fromJSON');
    }
}
