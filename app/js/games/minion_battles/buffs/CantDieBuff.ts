/**
 * CantDieBuff - Prevents death while active.
 */
import { Buff, type BuffSerialized } from './Buff';

export const CANT_DIE_BUFF_TYPE = 'cant_die';

export class CantDieBuff extends Buff {
    readonly _type = CANT_DIE_BUFF_TYPE;

    constructor(durationSeconds: number) {
        super({ value: durationSeconds, unit: 'seconds' });
    }

    static fromJSON(data: BuffSerialized): CantDieBuff {
        const buff = new CantDieBuff(data.durationValue);
        buff.appliedAtTime = data.appliedAtTime ?? 0;
        buff.appliedAtRound = data.appliedAtRound ?? 1;
        return buff;
    }
}
