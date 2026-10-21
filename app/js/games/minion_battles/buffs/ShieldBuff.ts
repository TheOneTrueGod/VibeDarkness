/**
 * ShieldBuff — absorbs incoming damage up to `remainingHp` before it reaches the unit's HP pool.
 * Drains passively at `drainPerSecond` (can be fractional) each tick and expires once
 * `remainingHp` reaches 0 — there is no separate fixed-duration expiry.
 * Optional `decayHealFraction` heals the unit for that fraction of whatever the passive drain removes
 * (damage absorbed by the shield never heals). Blood Mend grants this; see
 * `card_defs/03_blood_mage/AGENTS.md`.
 * Gravity Shield (0904) and Shield of Light (0805) reuse the same absorb/drain rules
 * with `theme: 'gravity'` and `theme: 'light'`.
 */

import { Buff, type BuffSerialized } from './Buff';
import type { Unit } from '../game/units/Unit';
import type { EngineContext } from '../game/EngineContext';
import { applyHeal } from '../game/units/unitHeal';

export const SHIELD_BUFF_TYPE = 'shield';

/** Visual palette for the shield shell. Mechanics are identical across themes. */
export type ShieldBuffTheme = 'blood' | 'gravity' | 'light';

export interface ShieldBuffSerialized extends BuffSerialized {
    remainingHp: number;
    drainPerSecond: number;
    theme?: ShieldBuffTheme;
    decayHealFraction?: number;
}

export class ShieldBuff extends Buff {
    readonly _type = SHIELD_BUFF_TYPE;

    remainingHp: number;
    readonly drainPerSecond: number;
    readonly theme: ShieldBuffTheme;
    /** Fraction of passively drained shield HP healed back to the unit (0 = none). */
    readonly decayHealFraction: number;

    constructor(
        remainingHp: number,
        drainPerSecond: number,
        theme: ShieldBuffTheme = 'blood',
        decayHealFraction = 0,
    ) {
        // `duration` is unused — ShieldBuff.isExpired only checks remainingHp<=0 — but the
        // base class constructor requires some BuffDuration, so pass a harmless placeholder.
        super({ value: 0, unit: 'seconds' });
        this.remainingHp = Math.max(0, remainingHp);
        this.drainPerSecond = Math.max(0, drainPerSecond);
        this.theme = theme;
        this.decayHealFraction = Math.max(0, decayHealFraction);
    }

    override onGameTick(unit: Unit, _engine: EngineContext, dt: number): void {
        if (this.drainPerSecond <= 0 || this.remainingHp <= 0) return;
        const drained = Math.min(this.remainingHp, this.drainPerSecond * dt);
        this.remainingHp = Math.max(0, this.remainingHp - drained);
        if (this.decayHealFraction > 0) applyHeal(unit, drained * this.decayHealFraction);
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
            decayHealFraction: this.decayHealFraction,
        };
    }

    static fromJSON(data: BuffSerialized): ShieldBuff {
        const d = data as ShieldBuffSerialized;
        const remainingHp = typeof d.remainingHp === 'number' ? d.remainingHp : 0;
        const drainPerSecond = typeof d.drainPerSecond === 'number' ? d.drainPerSecond : 0;
        const theme: ShieldBuffTheme =
            d.theme === 'gravity' || d.theme === 'light' ? d.theme : 'blood';
        const decayHealFraction = typeof d.decayHealFraction === 'number' ? d.decayHealFraction : 0;
        const buff = new ShieldBuff(remainingHp, drainPerSecond, theme, decayHealFraction);
        buff.appliedAtTime = data.appliedAtTime ?? 0;
        buff.appliedAtRound = data.appliedAtRound ?? 1;
        return buff;
    }
}
