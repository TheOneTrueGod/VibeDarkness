import { describe, it, expect, vi } from 'vitest';
import { createDamageTakenEffect, type DamageTakenEffectContext } from './createDamageTakenEffect';
import { DAMAGE_VISUAL_KIND_DAYLIGHT, type DamageTakenEvent } from './EventBus';
import { Unit } from './units/Unit';
import { DAYLIGHT_SEAR_EFFECT_TYPE } from './effect_defs/dayLightEffects';
import { DAYLIGHT_DAMAGE_NUMBER_COLOR } from './lighting/dayLightVfx';

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

    it('uses gold numbers and a sear puff for DayLight hits', () => {
        const addEffect = vi.fn();
        const unit = new Unit({
            id: 'v1',
            x: 100,
            y: 200,
            hp: 50,
            speed: 80,
            teamId: 'enemy',
            ownerId: 'e1',
            characterId: 'dark_wolf',
            portraitId: 'warrior',
            name: 'Victim',
        });
        const ctx: DamageTakenEffectContext = {
            addEffect,
            generateRandomInteger: (a, b) => Math.floor((a + b) / 2),
            getUnit: (id) => (id === 'v1' ? unit : undefined),
        };
        createDamageTakenEffect(ctx, {
            unitId: 'v1',
            amount: 6,
            sourceUnitId: null,
            visualKind: DAMAGE_VISUAL_KIND_DAYLIGHT,
        });
        expect(addEffect).toHaveBeenCalledTimes(2);
        const numberFx = addEffect.mock.calls[0]![0] as { effectType: string; effectData: { color?: number } };
        const searFx = addEffect.mock.calls[1]![0] as { effectType: string };
        expect(numberFx.effectType).toBe('DamageNumber');
        expect(numberFx.effectData.color).toBe(DAYLIGHT_DAMAGE_NUMBER_COLOR);
        expect(searFx.effectType).toBe(DAYLIGHT_SEAR_EFFECT_TYPE);
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
