/**
 * StaggeredBuff - a weak stun. Blocks acting and movement for a short time.
 *
 * Unlike {@link StunnedBuff} it is applied through the CC armour gate with a weak charge of 0
 * (see `crowdControl/tryApplyStagger.ts`): armoured units absorb it without spending armour.
 * Uses the generic {@link Buff.blocksActing} flag instead of a hardcoded type-string check.
 */

import { Buff, type BuffSerialized } from './Buff';

export const STAGGERED_BUFF_TYPE = 'staggered';

export class StaggeredBuff extends Buff {
    readonly _type = STAGGERED_BUFF_TYPE;
    override readonly blocksActing = true;

    constructor(durationSeconds: number) {
        super({ value: durationSeconds, unit: 'seconds' });
    }

    static fromJSON(data: BuffSerialized): StaggeredBuff {
        const buff = new StaggeredBuff(data.durationValue);
        buff.appliedAtTime = data.appliedAtTime ?? 0;
        buff.appliedAtRound = data.appliedAtRound ?? 1;
        return buff;
    }
}
