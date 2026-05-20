import { Buff, type BuffSerialized } from './Buff';

export const EXPOSED_BUFF_TYPE = 'exposed';

/** Unit cannot move or act, and takes 20% more damage. Immune to further hard CC while active. */
export class ExposedBuff extends Buff {
    readonly _type = EXPOSED_BUFF_TYPE;

    constructor(durationSeconds: number) {
        super({ value: durationSeconds, unit: 'seconds' });
    }

    static fromJSON(data: BuffSerialized): ExposedBuff {
        const buff = new ExposedBuff(data.durationValue);
        buff.appliedAtTime = data.appliedAtTime ?? 0;
        buff.appliedAtRound = data.appliedAtRound ?? 1;
        return buff;
    }
}
