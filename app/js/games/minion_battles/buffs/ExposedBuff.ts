import { Buff, type BuffSerialized } from './Buff';

export const EXPOSED_BUFF_TYPE = 'exposed';

interface ExposedBuffSerialized extends BuffSerialized {
    exposedResistance: number;
    maxExposedDuration: number;
}

/**
 * Unit cannot move or act, and takes 20% more damage. Immune to further hard CC while active.
 * Absorbed hard CCs extend the remaining duration up to (maxExposedDuration − exposedResistance).
 */
export class ExposedBuff extends Buff {
    readonly _type = EXPOSED_BUFF_TYPE;
    exposedResistance: number = 0;
    maxExposedDuration: number;

    constructor(durationSeconds: number) {
        super({ value: durationSeconds, unit: 'seconds' });
        this.maxExposedDuration = durationSeconds;
    }

    /**
     * Extend the exposed window by ccDuration, subject to the resistance cap.
     * Resistance always increases; the actual extension is capped so the timer never decreases.
     */
    extendDuration(ccDuration: number, gameTime: number): void {
        const remaining = this.duration.value - (gameTime - this.appliedAtTime);
        // Compute extension with OLD resistance so the first CC can always extend a fresh exposure.
        const cap = this.maxExposedDuration - this.exposedResistance;
        const extension = Math.max(0, Math.min(remaining + ccDuration, cap) - remaining);
        this.duration.value += extension;
        this.exposedResistance += ccDuration;
    }

    override toJSON(): ExposedBuffSerialized {
        return {
            ...super.toJSON(),
            exposedResistance: this.exposedResistance,
            maxExposedDuration: this.maxExposedDuration,
        };
    }

    static fromSerialized(data: BuffSerialized): ExposedBuff {
        const d = data as ExposedBuffSerialized;
        const buff = new ExposedBuff(d.maxExposedDuration ?? data.durationValue);
        buff.duration.value = data.durationValue;
        buff.appliedAtTime = data.appliedAtTime ?? 0;
        buff.appliedAtRound = data.appliedAtRound ?? 1;
        buff.exposedResistance = d.exposedResistance ?? 0;
        return buff;
    }
}
