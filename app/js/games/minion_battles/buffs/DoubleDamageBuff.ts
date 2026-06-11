import { Buff, type BuffSerialized } from './Buff';

export const DOUBLE_DAMAGE_BUFF_TYPE = 'double_damage';

interface DoubleDamageBuffSerialized extends BuffSerialized {
    abilityId: string;
}

/**
 * Grants the next use of a specific ability double damage.
 * Consumed on the first hit of that ability. Expires after 60 seconds if unused.
 */
export class DoubleDamageBuff extends Buff {
    readonly _type = DOUBLE_DAMAGE_BUFF_TYPE;
    readonly abilityId: string;

    constructor(abilityId: string) {
        super({ value: 60, unit: 'seconds' });
        this.abilityId = abilityId;
    }

    override toJSON(): DoubleDamageBuffSerialized {
        return { ...super.toJSON(), abilityId: this.abilityId };
    }

    static fromJSON(data: BuffSerialized): DoubleDamageBuff {
        const d = data as DoubleDamageBuffSerialized;
        const buff = new DoubleDamageBuff(d.abilityId ?? '');
        buff.appliedAtTime = data.appliedAtTime ?? 0;
        buff.appliedAtRound = data.appliedAtRound ?? 1;
        return buff;
    }
}
