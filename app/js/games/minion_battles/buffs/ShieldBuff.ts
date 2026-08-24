/**
 * ShieldBuff — absorbs incoming damage up to `remainingHp` before it reaches the unit's HP pool.
 * Drains passively at `drainPerSecond` (can be fractional) each tick and expires once
 * `remainingHp` reaches 0 — there is no separate fixed-duration expiry.
 * See `card_defs/03_blood_mage/AGENTS.md` for the design intent behind Protect, which grants this.
 * Gravity Shield (0904) reuses the same absorb/drain rules with `theme: 'gravity'`.
 */

import { Buff, type BuffSerialized } from './Buff';
import type { Unit } from '../game/units/Unit';
import type { EngineContext } from '../game/EngineContext';

export const SHIELD_BUFF_TYPE = 'shield';

/** Visual palette for the shield shell. Mechanics are identical across themes. */
export type ShieldBuffTheme = 'blood' | 'gravity';

export interface ShieldBuffSerialized extends BuffSerialized {
    remainingHp: number;
    drainPerSecond: number;
    theme?: ShieldBuffTheme;
}

export class ShieldBuff extends Buff {
    readonly _type = SHIELD_BUFF_TYPE;

    remainingHp: number;
    readonly drainPerSecond: number;
    readonly theme: ShieldBuffTheme;

    constructor(remainingHp: number, drainPerSecond: number, theme: ShieldBuffTheme = 'blood') {
        // `duration` is unused — ShieldBuff.isExpired only checks remainingHp<=0 — but the
        // base class constructor requires some BuffDuration, so pass a harmless placeholder.
        super({ value: 0, unit: 'seconds' });
        this.remainingHp = Math.max(0, remainingHp);
        this.drainPerSecond = Math.max(0, drainPerSecond);
        this.theme = theme;
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
            theme: this.theme,
        };
    }

    static fromJSON(data: BuffSerialized): ShieldBuff {
        const d = data as ShieldBuffSerialized;
        const remainingHp = typeof d.remainingHp === 'number' ? d.remainingHp : 0;
        const drainPerSecond = typeof d.drainPerSecond === 'number' ? d.drainPerSecond : 0;
        const theme: ShieldBuffTheme = d.theme === 'gravity' ? 'gravity' : 'blood';
        const buff = new ShieldBuff(remainingHp, drainPerSecond, theme);
        buff.appliedAtTime = data.appliedAtTime ?? 0;
        buff.appliedAtRound = data.appliedAtRound ?? 1;
        return buff;
    }
}
