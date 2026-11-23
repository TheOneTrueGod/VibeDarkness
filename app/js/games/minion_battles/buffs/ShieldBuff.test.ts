import { describe, expect, it, vi } from 'vitest';
import { ShieldBuff, SHIELD_BUFF_TYPE } from './ShieldBuff';
import type { Unit } from '../game/units/Unit';
import type { EngineContext } from '../game/EngineContext';
import { Unit as UnitClass } from '../game/units/Unit';
import { applyDamageToShields } from '../game/units/unitShield';
import { DEFAULT_HEAL_PENALTY_PCT } from '../game/units/unitHeal';
import type { TeamId } from '../game/teams';
import { createGuardShield } from './guardShield';
import type { BuffExpireContext } from './Buff';
import { BUFF_PARTICLE_AURA_PRESETS } from '../game/effects/buffParticleAura';

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

    it('round-trips a light theme through toJSON/fromJSON', () => {
        const buff = new ShieldBuff(20, 2, 'light');
        const restored = ShieldBuff.fromJSON(buff.toJSON());
        expect(restored.theme).toBe('light');
        expect(restored.remainingHp).toBe(20);
    });

    describe('decayHealFraction', () => {
        function makeUnit(hp: number): UnitClass {
            return new UnitClass({
                id: 'u', x: 0, y: 0, hp, maxHp: 100, speed: 100, teamId: 'player' as TeamId,
                ownerId: 'p1', characterId: 'player', name: 'u',
            });
        }

        it('heals the unit for the given fraction of the drained amount, banking injury', () => {
            const unit = makeUnit(50);
            const buff = new ShieldBuff(10, 2, 'blood', 0.5);

            buff.onGameTick(unit, FAKE_ENGINE, 1); // drains 2 -> heals 1

            expect(buff.remainingHp).toBe(8);
            expect(unit.hp).toBeCloseTo(51);
            expect(unit.hpInjury).toBeCloseTo(DEFAULT_HEAL_PENALTY_PCT);
        });

        it('only heals for what was actually drained (clamped by remaining shield)', () => {
            const unit = makeUnit(50);
            const buff = new ShieldBuff(1, 4, 'blood', 0.5);

            buff.onGameTick(unit, FAKE_ENGINE, 1); // only 1 left to drain

            expect(unit.hp).toBeCloseTo(50.5);
        });

        it('never heals from damage absorbed by the shield', () => {
            const unit = makeUnit(50);
            const buff = new ShieldBuff(10, 0, 'blood', 0.5);
            unit.buffs.push(buff);

            const result = applyDamageToShields(unit, 6);

            expect(result.shieldAbsorbed).toBe(6);
            expect(buff.remainingHp).toBe(4);
            expect(unit.hp).toBe(50);
        });

        it('defaults to no healing', () => {
            const unit = makeUnit(50);
            new ShieldBuff(10, 2).onGameTick(unit, FAKE_ENGINE, 1);
            expect(unit.hp).toBe(50);
        });

        it('round-trips through toJSON/fromJSON', () => {
            const restored = ShieldBuff.fromJSON(new ShieldBuff(10, 2, 'blood', 0.5).toJSON());
            expect(restored.decayHealFraction).toBe(0.5);
            expect(ShieldBuff.fromJSON(new ShieldBuff(10, 2).toJSON()).decayHealFraction).toBe(0);
        });
    });

    describe('guard shield (refill floor, expiry, link, serialization)', () => {
        function makeGuard(overrides: Partial<{ floor: number; seconds: number; gameTime: number; guardianUnitId: string }> = {}): ShieldBuff {
            return createGuardShield({ floor: 2, seconds: 10, gameTime: 5, guardianUnitId: 'spirit-1', ...overrides });
        }

        it('expires at its time even with HP left', () => {
            const buff = makeGuard();
            expect(buff.remainingHp).toBe(2);
            expect(buff.isExpired(14.9, 1)).toBe(false);
            expect(buff.isExpired(15, 1)).toBe(true);
        });

        it('onBeforeExpire returns the linked exiled unit at the holder position', () => {
            const buff = makeGuard();
            const returnExiledUnit = vi.fn();
            const holder = { x: 120, y: 80 } as Unit;

            buff.onBeforeExpire(holder, { engine: { returnExiledUnit } } as unknown as BuffExpireContext);

            expect(returnExiledUnit).toHaveBeenCalledWith('spirit-1', { x: 120, y: 80 });
        });

        it('onBeforeExpire does nothing for a shield with no linked unit', () => {
            const returnExiledUnit = vi.fn();
            new ShieldBuff(10, 0).onBeforeExpire({ x: 0, y: 0 } as Unit, { engine: { returnExiledUnit } } as unknown as BuffExpireContext);
            expect(returnExiledUnit).not.toHaveBeenCalled();
        });

        it('round-trips the new fields through JSON', () => {
            const restored = ShieldBuff.fromJSON(JSON.parse(JSON.stringify(makeGuard().toJSON())));

            expect(restored.theme).toBe('command');
            expect(restored.refillFloor).toBe(2);
            expect(restored.expiresAtGameTime).toBe(15);
            expect(restored.linkedExiledUnitId).toBe('spirit-1');
            expect(restored.particleAura).toEqual(BUFF_PARTICLE_AURA_PRESETS.spiritMotes());
        });

        it('a plain shield serializes without the guard fields and loads with defaults', () => {
            const json = new ShieldBuff(10, 2).toJSON();
            expect(json).not.toHaveProperty('refillFloor');
            expect(json).not.toHaveProperty('expiresAtGameTime');
            const restored = ShieldBuff.fromJSON(json);
            expect(restored.refillFloor).toBe(0);
            expect(restored.expiresAtGameTime).toBeNull();
            expect(restored.linkedExiledUnitId).toBeNull();
            expect(restored.particleAura).toBeUndefined();
        });
    });

    describe('resourceTrickle', () => {
        function trickleSetup() {
            const added: number[] = [];
            const caster = { getResource: () => ({ add: (n: number) => added.push(n) }) } as unknown as Unit;
            const engine = {
                gameTime: 0,
                getUnit: (id: string) => (id === 'caster' ? caster : undefined),
                returnExiledUnit: () => false,
            };
            const shield = createGuardShield({
                floor: 2,
                seconds: 10,
                guardianUnitId: 'spirit',
                gameTime: 0,
                resourceTrickle: { unitId: 'caster', resourceId: 'kinship', amount: 2 },
            });
            shield.appliedAtTime = 0;
            const tickAt = (t: number) => {
                engine.gameTime = t;
                shield.onGameTick(FAKE_UNIT, engine as unknown as EngineContext, 1 / 60);
            };
            return { added, engine, shield, tickAt };
        }

        it('pays the amount out in whole points spread over the duration', () => {
            const { added, tickAt } = trickleSetup();
            tickAt(4.9);
            expect(added).toEqual([]);
            tickAt(5);
            expect(added).toEqual([1]);
            tickAt(9.9);
            expect(added).toEqual([1]);
            tickAt(10);
            expect(added).toEqual([1, 1]);
        });

        it('pays any remainder on expiry, never more than the amount', () => {
            const { added, engine, shield, tickAt } = trickleSetup();
            tickAt(5);
            shield.onBeforeExpire(FAKE_UNIT, { engine } as unknown as BuffExpireContext);
            shield.onBeforeExpire(FAKE_UNIT, { engine } as unknown as BuffExpireContext);
            expect(added).toEqual([1, 1]);
        });

        it('round-trips the trickle and what it has paid', () => {
            const { shield, tickAt } = trickleSetup();
            tickAt(5);
            const restored = ShieldBuff.fromJSON(shield.toJSON());
            expect(restored.resourceTrickle).toEqual({ unitId: 'caster', resourceId: 'kinship', amount: 2 });
            expect(restored.resourceTrickleGranted).toBe(1);
        });
    });
});
