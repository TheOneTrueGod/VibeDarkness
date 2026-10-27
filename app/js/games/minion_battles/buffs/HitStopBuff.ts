/**
 * Hit-stop — a few ticks of freeze on the bodies in a collision.
 * Tempo 0 via `timeModifier.freeze`, so the rest of the world keeps moving and stored
 * momentum (knockback, hover flight) resumes when it expires. See HIT_STOP_DEFAULTS.
 */

import { Buff, type BuffSerialized } from './Buff';
import type { Unit } from '../game/units/Unit';
import type { TimeModifier } from '../game/time/TimeModifier';
import { FIXED_DT } from '../game/gameConstants';
import { HIT_STOP_DEFAULTS } from '../game/time/timeConstants';

export const HIT_STOP_BUFF_TYPE = 'hit_stop';
export const HIT_STOP_SOURCE_ID = 'hit_stop';

/** World seconds a hit-stop lasts. Three ticks at the lockstep rate. */
export const HIT_STOP_DURATION_SECONDS = HIT_STOP_DEFAULTS.ticks * FIXED_DT;

export class HitStopBuff extends Buff {
    readonly _type = HIT_STOP_BUFF_TYPE;
    override readonly timeModifier: TimeModifier = {
        sourceId: HIT_STOP_SOURCE_ID,
        tempo: 1,
        freeze: true,
    };

    constructor(durationSeconds: number) {
        super({ value: durationSeconds, unit: 'seconds' });
    }

    static fromJSON(data: BuffSerialized): HitStopBuff {
        const buff = new HitStopBuff(data.durationValue);
        buff.appliedAtTime = data.appliedAtTime ?? 0;
        buff.appliedAtRound = data.appliedAtRound ?? 1;
        return buff;
    }
}

/** Freeze each unit for one hit-stop. A fresh hit replaces a stop already playing. */
export function applyHitStop(units: readonly Unit[], gameTime: number, roundNumber: number): void {
    for (const unit of units) {
        if (!unit.isAlive()) continue;
        unit.buffs = unit.buffs.filter((buff) => buff._type !== HIT_STOP_BUFF_TYPE);
        unit.addBuff(new HitStopBuff(HIT_STOP_DURATION_SECONDS), gameTime, roundNumber);
    }
}
