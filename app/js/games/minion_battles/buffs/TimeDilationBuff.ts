/**
 * TimeDilationBuff - generic tempo buff. Carries a {@link TimeModifier}; the engine does the rest
 * (`getActorTempo` speeds the holder's local clock, focal modifiers slow the world). Ability code only
 * applies the buff - see `game/time/AGENTS.md`.
 *
 * Duration is in WORLD seconds (default `clock: 'world'`). Stacking: tempo modifiers from different
 * sources multiply; re-applying from the SAME `sourceId` refreshes (use {@link applyTimeDilationBuff}).
 */

import { Buff, type BuffSerialized } from './Buff';
import type { TimeModifier } from '../game/time/TimeModifier';
import type { Unit } from '../game/units/Unit';
import type { EventBus } from '../game/EventBus';

export const TIME_DILATION_BUFF_TYPE = 'time_dilation';

/** Configuration for a time dilation buff. */
export interface TimeDilationConfig {
    /** Stacking key: the same source re-applying refreshes instead of stacking. */
    sourceId: string;
    /** Local-time rate multiplier for the holder (2 = twice as fast, 0.5 = half speed). */
    tempo: number;
    /** Focal: also slows the world so the holder looks normal speed. `worldPace` overrides `1 / tempo`. */
    focal?: { worldPace?: number };
    /** World seconds. */
    durationSeconds: number;
}

export type TimeDilationPreset = Omit<TimeDilationConfig, 'sourceId'>;

/** Reusable presets; pass a `sourceId` when instantiating. */
export const TIME_DILATION_PRESETS = {
    /** Tempo 2, focal (world pace 0.5), 3 world seconds. Ease Burdens. */
    focalHaste2x: { tempo: 2, focal: {}, durationSeconds: 3 },
} as const satisfies Record<string, TimeDilationPreset>;

interface TimeDilationBuffSerialized extends BuffSerialized {
    sourceId: string;
    tempo: number;
    focal?: { worldPace?: number };
}

export class TimeDilationBuff extends Buff {
    readonly _type = TIME_DILATION_BUFF_TYPE;
    override readonly timeModifier: TimeModifier;

    constructor(config: TimeDilationConfig) {
        super({ value: config.durationSeconds, unit: 'seconds' });
        this.timeModifier = {
            sourceId: config.sourceId,
            tempo: config.tempo,
            ...(config.focal ? { focal: { ...config.focal } } : {}),
        };
    }

    /** Build from a preset (e.g. `TIME_DILATION_PRESETS.focalHaste2x`). */
    static fromPreset(preset: TimeDilationPreset, sourceId: string): TimeDilationBuff {
        return new TimeDilationBuff({ ...preset, sourceId });
    }

    get sourceId(): string {
        return this.timeModifier.sourceId;
    }

    override toJSON(): TimeDilationBuffSerialized {
        return {
            ...super.toJSON(),
            sourceId: this.timeModifier.sourceId,
            tempo: this.timeModifier.tempo,
            ...(this.timeModifier.focal ? { focal: { ...this.timeModifier.focal } } : {}),
        };
    }

    static fromJSON(data: BuffSerialized): TimeDilationBuff {
        const d = data as TimeDilationBuffSerialized;
        const buff = new TimeDilationBuff({
            sourceId: d.sourceId,
            tempo: d.tempo,
            focal: d.focal,
            durationSeconds: d.durationValue,
        });
        buff.appliedAtTime = d.appliedAtTime ?? 0;
        buff.appliedAtRound = d.appliedAtRound ?? 1;
        return buff;
    }
}

/**
 * Apply a time dilation buff, replacing any existing one from the same source (refresh, not stack).
 * Buffs from different sources multiply via the engine's tempo resolution.
 */
export function applyTimeDilationBuff(
    unit: Unit,
    buff: TimeDilationBuff,
    gameTime: number,
    roundNumber: number,
    eventBus?: EventBus,
): void {
    unit.buffs = unit.buffs.filter(
        (b) => !(b._type === TIME_DILATION_BUFF_TYPE && (b as TimeDilationBuff).sourceId === buff.sourceId),
    );
    unit.addBuff(buff, gameTime, roundNumber, eventBus);
}
