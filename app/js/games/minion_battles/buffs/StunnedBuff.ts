/**
 * StunnedBuff - Prevents the unit from taking actions and interrupts attacks.
 *
 * Duration: seconds. When applied, the unit cannot act for the duration.
 */

import { Buff, type BuffSerialized } from './Buff';

export const STUNNED_BUFF_TYPE = 'stunned';

export class StunnedBuff extends Buff {
    readonly _type = STUNNED_BUFF_TYPE;

    constructor(durationSeconds: number) {
        super({ value: durationSeconds, unit: 'seconds' });
    }

    static fromJSON(data: BuffSerialized): StunnedBuff {
        const buff = new StunnedBuff(data.durationValue);
        buff.appliedAtTime = data.appliedAtTime ?? 0;
        buff.appliedAtRound = data.appliedAtRound ?? 1;
        return buff;
    }
}
