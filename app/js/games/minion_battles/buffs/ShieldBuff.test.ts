import { describe, expect, it } from 'vitest';
import { ShieldBuff, SHIELD_BUFF_TYPE } from './ShieldBuff';
import type { Unit } from '../game/units/Unit';
import type { EngineContext } from '../game/EngineContext';

// onGameTick's unit/engine params are unused by ShieldBuff's drain logic — safe stand-ins.
const FAKE_UNIT = {} as Unit;
const FAKE_ENGINE = {} as EngineContext;

describe('ShieldBuff', () => {
    it('is not expired right after creation', () => {
        const buff = new ShieldBuff(30, 4);
        buff.appliedAtTime = 0;
        buff.appliedAtRound = 1;

        expect(buff.isExpired(0, 1)).toBe(false);
    });

    it('is expired once remainingHp is depleted directly (e.g. by damage absorption)', () => {
        const buff = new ShieldBuff(30, 4);
        buff.remainingHp = 0;

        expect(buff.isExpired(0, 1)).toBe(true);
    });

    it('onGameTick drains remainingHp by drainPerSecond * dt, clamped at 0', () => {
        const buff = new ShieldBuff(10, 4);

        buff.onGameTick(FAKE_UNIT, FAKE_ENGINE, 1);
        expect(buff.remainingHp).toBe(6);

        buff.onGameTick(FAKE_UNIT, FAKE_ENGINE, 1);
        expect(buff.remainingHp).toBe(2);

        // Would go negative without clamping.
        buff.onGameTick(FAKE_UNIT, FAKE_ENGINE, 1);
        expect(buff.remainingHp).toBe(0);
        expect(buff.isExpired(0, 1)).toBe(true);
    });

    it('supports a non-integer drainPerSecond', () => {
        const buff = new ShieldBuff(30, 30 / 7);

        buff.onGameTick(FAKE_UNIT, FAKE_ENGINE, 7);

        expect(buff.remainingHp).toBeCloseTo(0, 10);
        expect(buff.isExpired(0, 1)).toBe(true);
    });

    it('does not drain when drainPerSecond is 0', () => {
        const buff = new ShieldBuff(30, 0);

        buff.onGameTick(FAKE_UNIT, FAKE_ENGINE, 100);

        expect(buff.remainingHp).toBe(30);
        expect(buff.isExpired(0, 1)).toBe(false);
    });

    it('round-trips remainingHp and drainPerSecond through toJSON/fromJSON', () => {
        const buff = new ShieldBuff(18, 30 / 7);
        buff.appliedAtTime = 3.5;
        buff.appliedAtRound = 2;

        const json = buff.toJSON();
        expect(json._type).toBe(SHIELD_BUFF_TYPE);
        expect(json.remainingHp).toBe(18);
        expect(json.drainPerSecond).toBeCloseTo(30 / 7, 10);

        const restored = ShieldBuff.fromJSON(json);
        expect(restored).toBeInstanceOf(ShieldBuff);
        expect(restored.remainingHp).toBe(18);
        expect(restored.drainPerSecond).toBeCloseTo(30 / 7, 10);
        expect(restored.appliedAtTime).toBe(3.5);
        expect(restored.appliedAtRound).toBe(2);
        expect(restored.theme).toBe('blood');
    });

    it('round-trips a gravity theme through toJSON/fromJSON', () => {
        const buff = new ShieldBuff(20, 2, 'gravity');
        const restored = ShieldBuff.fromJSON(buff.toJSON());
        expect(restored.theme).toBe('gravity');
        expect(restored.remainingHp).toBe(20);
    });
});
