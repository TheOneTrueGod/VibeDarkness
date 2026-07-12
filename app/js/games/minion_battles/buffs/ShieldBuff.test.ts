import { describe, expect, it } from 'vitest';
import { ShieldBuff, SHIELD_BUFF_TYPE } from './ShieldBuff';

describe('ShieldBuff', () => {
    it('is not expired right after creation', () => {
        const buff = new ShieldBuff(30, 7);
        buff.appliedAtTime = 0;
        buff.appliedAtRound = 1;

        expect(buff.isExpired(0, 1)).toBe(false);
    });

    it('is expired once remainingHp is depleted, before the time duration elapses', () => {
        const buff = new ShieldBuff(30, 7);
        buff.appliedAtTime = 0;
        buff.appliedAtRound = 1;

        buff.remainingHp = 0;

        expect(buff.isExpired(1, 1)).toBe(true);
    });

    it('is expired once gameTime passes the duration even with remainingHp still positive', () => {
        const buff = new ShieldBuff(30, 7);
        buff.appliedAtTime = 0;
        buff.appliedAtRound = 1;

        expect(buff.isExpired(6.9, 1)).toBe(false);
        expect(buff.isExpired(7, 1)).toBe(true);
        expect(buff.remainingHp).toBe(30);
    });

    it('round-trips remainingHp through toJSON/fromJSON', () => {
        const buff = new ShieldBuff(18, 7);
        buff.appliedAtTime = 3.5;
        buff.appliedAtRound = 2;

        const json = buff.toJSON();
        expect(json._type).toBe(SHIELD_BUFF_TYPE);
        expect(json.remainingHp).toBe(18);
        expect(json.durationValue).toBe(7);
        expect(json.durationUnit).toBe('seconds');

        const restored = ShieldBuff.fromJSON(json);
        expect(restored).toBeInstanceOf(ShieldBuff);
        expect(restored.remainingHp).toBe(18);
        expect(restored.appliedAtTime).toBe(3.5);
        expect(restored.appliedAtRound).toBe(2);
        expect(restored.duration).toEqual({ value: 7, unit: 'seconds' });
    });
});
