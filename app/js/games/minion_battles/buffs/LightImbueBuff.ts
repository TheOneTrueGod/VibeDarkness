import { Buff, type BuffSerialized } from './Buff';

export const LIGHT_IMBUE_BUFF_TYPE = 'light_imbue';

/**
 * A very short-lived buff applied when Light Imbuement is cast.
 * Its only purpose is to fire the `buffApplied` swap trigger so Imbued Bat
 * activates and replaces Swing Bat. Expires almost immediately and has no
 * other gameplay effect.
 */
export class LightImbueBuff extends Buff {
    readonly _type = LIGHT_IMBUE_BUFF_TYPE;

    constructor() {
        super({ value: 0.05, unit: 'seconds' });
    }

    override toJSON(): BuffSerialized {
        return super.toJSON();
    }

    static fromJSON(data: BuffSerialized): LightImbueBuff {
        const buff = new LightImbueBuff();
        buff.appliedAtTime = data.appliedAtTime ?? 0;
        buff.appliedAtRound = data.appliedAtRound ?? 1;
        return buff;
    }
}
