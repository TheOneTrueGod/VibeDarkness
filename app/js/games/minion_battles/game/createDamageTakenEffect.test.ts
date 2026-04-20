import { describe, it, expect, vi } from 'vitest';
import { createDamageTakenEffect, type DamageTakenEffectContext } from './createDamageTakenEffect';
import type { DamageTakenEvent } from './EventBus';
import { Unit } from './units/Unit';

describe('createDamageTakenEffect', () => {
    it('spawns a DamageNumber effect when amount > 0', () => {
        const addEffect = vi.fn();
        const unit = new Unit({
            id: 'v1',
            x: 100,
            y: 200,
            hp: 50,
            speed: 80,
            teamId: 'enemy',
            ownerId: 'e1',
            characterId: 'enemy_melee',
            portraitId: 'warrior',
            name: 'Victim',
        });
        const ctx: DamageTakenEffectContext = {
            addEffect,
            generateRandomInteger: (a, b) => Math.floor((a + b) / 2),
            getUnit: (id) => (id === 'v1' ? unit : undefined),
        };
        const ev: DamageTakenEvent = { unitId: 'v1', amount: 7, sourceUnitId: null };
        createDamageTakenEffect(ctx, ev);
        expect(addEffect).toHaveBeenCalledTimes(1);
        const fx = addEffect.mock.calls[0]![0] as { effectType: string; effectData: { amount?: number } };
        expect(fx.effectType).toBe('DamageNumber');
        expect(fx.effectData.amount).toBe(7);
    });

    it('does nothing when amount is 0', () => {
        const addEffect = vi.fn();
        const ctx: DamageTakenEffectContext = {
            addEffect,
            generateRandomInteger: (a, _b) => a,
            getUnit: () => undefined,
        };
        createDamageTakenEffect(ctx, { unitId: 'x', amount: 0, sourceUnitId: null });
        expect(addEffect).not.toHaveBeenCalled();
    });
});
