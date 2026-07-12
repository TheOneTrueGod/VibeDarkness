/**
 * ShieldBuff — absorbs incoming damage up to `remainingHp` before it reaches the unit's HP pool.
 * Drains passively at `drainPerSecond` (can be fractional) each tick and expires once
 * `remainingHp` reaches 0 — there is no separate fixed-duration expiry.
 * See `card_defs/03_blood_mage/AGENTS.md` for the design intent behind Protect, which grants this.
 */

import { Buff, type BuffSerialized } from './Buff';
import type { Unit } from '../game/units/Unit';
import type { EngineContext } from '../game/EngineContext';

export const SHIELD_BUFF_TYPE = 'shield';

export interface ShieldBuffSerialized extends BuffSerialized {
    remainingHp: number;
    drainPerSecond: number;
}

export class ShieldBuff extends Buff {
    readonly _type = SHIELD_BUFF_TYPE;

    remainingHp: number;
    readonly drainPerSecond: number;

    constructor(remainingHp: number, drainPerSecond: number) {
        // `duration` is unused — ShieldBuff.isExpired only checks remainingHp<=0 — but the
        // base class constructor requires some BuffDuration, so pass a harmless placeholder.
        super({ value: 0, unit: 'seconds' });
        this.remainingHp = Math.max(0, remainingHp);
        this.drainPerSecond = Math.max(0, drainPerSecond);
    }

    override onGameTick(_unit: Unit, _engine: EngineContext, dt: number): void {
        if (this.drainPerSecond <= 0 || this.remainingHp <= 0) return;
        this.remainingHp = Math.max(0, this.remainingHp - this.drainPerSecond * dt);
    }

    override isExpired(_gameTime: number, _roundNumber: number): boolean {
        return this.remainingHp <= 0;
    }

    override toJSON(): ShieldBuffSerialized {
        return {
            ...super.toJSON(),
            remainingHp: this.remainingHp,
            drainPerSecond: this.drainPerSecond,
        };
    }

    static fromJSON(data: BuffSerialized): ShieldBuff {
        const d = data as ShieldBuffSerialized;
        const remainingHp = typeof d.remainingHp === 'number' ? d.remainingHp : 0;
        const drainPerSecond = typeof d.drainPerSecond === 'number' ? d.drainPerSecond : 0;
        const buff = new ShieldBuff(remainingHp, drainPerSecond);
        buff.appliedAtTime = data.appliedAtTime ?? 0;
        buff.appliedAtRound = data.appliedAtRound ?? 1;
        return buff;
    }
}
