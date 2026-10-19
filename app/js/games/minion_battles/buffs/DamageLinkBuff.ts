/**
 * DamageLinkBuff — sits on the protected unit and moves `redirectFraction` of every HP loss it
 * suffers onto `linkedUnitId`. The redirected hit lands on the linked unit with `linkedShieldShare`
 * (only that fraction can be soaked by its shields). Resolution lives in
 * `game/units/unitDamageLinks.ts`; the tether between the two units is drawn by `buffVisuals.ts`.
 * Blood Pact (0305) is the first user; the theme only changes the tether's palette.
 */

import { Buff, type BuffSerialized } from './Buff';

export const DAMAGE_LINK_BUFF_TYPE = 'damage_link';

export type DamageLinkTheme = 'blood';

export interface DamageLinkBuffConfig {
    /** Unit that takes the redirected share. */
    linkedUnitId: string;
    /** Fraction (0-1) of each HP loss moved onto the linked unit. */
    redirectFraction: number;
    /** Fraction (0-1) of the redirected hit the linked unit's shields may absorb. */
    linkedShieldShare: number;
    durationSeconds: number;
    theme?: DamageLinkTheme;
}

export interface DamageLinkBuffSerialized extends BuffSerialized {
    linkedUnitId: string;
    redirectFraction: number;
    linkedShieldShare: number;
    theme?: DamageLinkTheme;
}

export class DamageLinkBuff extends Buff {
    readonly _type = DAMAGE_LINK_BUFF_TYPE;

    readonly linkedUnitId: string;
    readonly redirectFraction: number;
    readonly linkedShieldShare: number;
    readonly theme: DamageLinkTheme;

    constructor(config: DamageLinkBuffConfig) {
        super({ value: config.durationSeconds, unit: 'seconds' });
        this.linkedUnitId = config.linkedUnitId;
        this.redirectFraction = Math.min(1, Math.max(0, config.redirectFraction));
        this.linkedShieldShare = Math.min(1, Math.max(0, config.linkedShieldShare));
        this.theme = config.theme ?? 'blood';
    }

    override toJSON(): DamageLinkBuffSerialized {
        return {
            ...super.toJSON(),
            linkedUnitId: this.linkedUnitId,
            redirectFraction: this.redirectFraction,
            linkedShieldShare: this.linkedShieldShare,
            theme: this.theme,
        };
    }

    static fromJSON(data: BuffSerialized): DamageLinkBuff {
        const d = data as DamageLinkBuffSerialized;
        const buff = new DamageLinkBuff({
            linkedUnitId: d.linkedUnitId ?? '',
            redirectFraction: typeof d.redirectFraction === 'number' ? d.redirectFraction : 0,
            linkedShieldShare: typeof d.linkedShieldShare === 'number' ? d.linkedShieldShare : 1,
            durationSeconds: d.durationValue,
            theme: d.theme,
        });
        buff.appliedAtTime = data.appliedAtTime ?? 0;
        buff.appliedAtRound = data.appliedAtRound ?? 1;
        return buff;
    }
}
