/**
 * BleedBuff — stacking DoT; stacks tick down at round timer milestones (see roundProgressMilestones).
 */

import { Buff, type BuffSerialized } from './Buff';

export const BLEED_BUFF_TYPE = 'bleed';

/** Rounds duration is unused; stacks and milestone ticks drive removal. */
const BLEED_PLACEHOLDER_ROUNDS = 1_000_000;

export interface BleedBuffSerialized extends BuffSerialized {
    stacks: number;
}

export class BleedBuff extends Buff {
    readonly _type = BLEED_BUFF_TYPE;

    stacks: number;

    constructor(initialStacks: number) {
        super({ value: BLEED_PLACEHOLDER_ROUNDS, unit: 'rounds' });
        this.stacks = Math.max(0, initialStacks);
    }

    override isExpired(_gameTime: number, _roundNumber: number): boolean {
        return this.stacks <= 0;
    }

    override toJSON(): BleedBuffSerialized {
        return {
            ...super.toJSON(),
            stacks: this.stacks,
        };
    }

    static fromJSON(data: BuffSerialized): BleedBuff {
        const d = data as BleedBuffSerialized;
        const stacks = typeof d.stacks === 'number' ? d.stacks : 1;
        const buff = new BleedBuff(stacks);
        buff.appliedAtTime = data.appliedAtTime ?? 0;
        buff.appliedAtRound = data.appliedAtRound ?? 1;
        return buff;
    }
}
