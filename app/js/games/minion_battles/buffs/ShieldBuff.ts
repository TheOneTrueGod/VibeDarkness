/**
 * ShieldBuff — absorbs incoming damage up to `remainingHp` before it reaches the unit's HP pool.
 * See `card_defs/03_blood_mage/AGENTS.md` for the design intent behind Protect, which grants this.
 */

import { Buff, type BuffSerialized } from './Buff';

export const SHIELD_BUFF_TYPE = 'shield';

export interface ShieldBuffSerialized extends BuffSerialized {
    remainingHp: number;
}

export class ShieldBuff extends Buff {
    readonly _type = SHIELD_BUFF_TYPE;

    remainingHp: number;

    constructor(remainingHp: number, durationSeconds: number) {
        super({ value: durationSeconds, unit: 'seconds' });
        this.remainingHp = Math.max(0, remainingHp);
    }

    override isExpired(gameTime: number, roundNumber: number): boolean {
        if (this.remainingHp <= 0) {
            return true;
        }
        return super.isExpired(gameTime, roundNumber);
    }

    override toJSON(): ShieldBuffSerialized {
        return {
            ...super.toJSON(),
            remainingHp: this.remainingHp,
        };
    }

    static fromJSON(data: BuffSerialized): ShieldBuff {
        const d = data as ShieldBuffSerialized;
        const remainingHp = typeof d.remainingHp === 'number' ? d.remainingHp : 0;
        const buff = new ShieldBuff(remainingHp, d.durationValue);
        buff.appliedAtTime = data.appliedAtTime ?? 0;
        buff.appliedAtRound = data.appliedAtRound ?? 1;
        return buff;
    }
}
