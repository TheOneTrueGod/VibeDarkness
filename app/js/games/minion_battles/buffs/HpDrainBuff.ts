/**
 * HpDrainBuff — the unit loses `totalAmount` HP evenly over the buff's duration (a life cost paid
 * over time rather than up front). Direct HP loss: it ignores shields/armour, never kills (floors
 * at 1 HP), and emits no damage events. Progress is derived from elapsed time, so it is
 * deterministic regardless of tick size. Blood Pact (0305) uses it for its HP cost.
 */

import { Buff, type BuffSerialized } from './Buff';
import type { Unit } from '../game/units/Unit';
import type { EngineContext } from '../game/EngineContext';

export const HP_DRAIN_BUFF_TYPE = 'hp_drain';

export interface HpDrainBuffSerialized extends BuffSerialized {
    totalAmount: number;
    drained: number;
}

export class HpDrainBuff extends Buff {
    readonly _type = HP_DRAIN_BUFF_TYPE;

    readonly totalAmount: number;
    /** HP accounted for so far (including any share skipped by the 1-HP floor). */
    drained = 0;

    constructor(totalAmount: number, durationSeconds: number) {
        super({ value: durationSeconds, unit: 'seconds' });
        this.totalAmount = Math.max(0, totalAmount);
    }

    override onGameTick(unit: Unit, engine: EngineContext, _dt: number): void {
        if (!unit.isAlive() || this.drained >= this.totalAmount) return;
        const duration = this.duration.value;
        const progress = duration > 0 ? Math.min(1, (engine.gameTime - this.appliedAtTime) / duration) : 1;
        const due = this.totalAmount * progress - this.drained;
        if (due <= 0) return;
        this.drained += due;
        unit.hp -= Math.max(0, Math.min(due, unit.hp - 1));
    }

    override toJSON(): HpDrainBuffSerialized {
        return { ...super.toJSON(), totalAmount: this.totalAmount, drained: this.drained };
    }

    static fromJSON(data: BuffSerialized): HpDrainBuff {
        const d = data as HpDrainBuffSerialized;
        const buff = new HpDrainBuff(typeof d.totalAmount === 'number' ? d.totalAmount : 0, d.durationValue);
        buff.drained = typeof d.drained === 'number' ? d.drained : 0;
        buff.appliedAtTime = data.appliedAtTime ?? 0;
        buff.appliedAtRound = data.appliedAtRound ?? 1;
        return buff;
    }
}
