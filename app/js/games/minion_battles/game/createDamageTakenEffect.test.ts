import { describe, it, expect, vi } from 'vitest';
import { createDamageTakenEffect, type DamageTakenEffectContext } from './createDamageTakenEffect';
import { DAMAGE_VISUAL_KIND_DARKNESS, DAMAGE_VISUAL_KIND_DAYLIGHT, type DamageTakenEvent } from './EventBus';
import { DAMAGE_VISUAL_KIND_DEFS } from './damageVisualKinds';
import { DARKNESS_RUPTURE_EFFECT_TYPE } from './effect_defs/darknessRuptureEffects';
import { Unit } from './units/Unit';
import { RESISTED_DAMAGE_NUMBER_COLOR } from './effect_defs/textEffects';
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
            characterId: 'target_dummy',
            portraitId: 'warrior',
            name: 'Victim',
        });
        const ctx: DamageTakenEffectContext = {
            addEffect,
            generateRandomInteger: (a, b) => Math.floor((a + b) / 2),
            getUnit: (id) => (id === 'v1' ? unit : undefined),
        };
        const ev: DamageTakenEvent = {
            unitId: 'v1',
            amount: 7,
            sourceUnitId: null,
        };
        createDamageTakenEffect(ctx, ev);
        expect(addEffect).toHaveBeenCalledTimes(1);
        const fx = addEffect.mock.calls[0]![0] as {
            effectType: string;
            effectData: { amount?: number };
        };
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
            characterId: 'target_dummy',
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
        const numberFx = addEffect.mock.calls[0]![0] as {
            effectType: string;
            effectData: { color?: number };
        };
        const searFx = addEffect.mock.calls[1]![0] as { effectType: string };
        expect(numberFx.effectType).toBe('DamageNumber');
        expect(numberFx.effectData.color).toBe(DAYLIGHT_DAMAGE_NUMBER_COLOR);
        expect(searFx.effectType).toBe(DAYLIGHT_SEAR_EFFECT_TYPE);
    });

    it('uses violet numbers and a rupture burst for darkness corruption hits', () => {
        const addEffect = vi.fn();
        const unit = new Unit({
            id: 'v1',
            x: 100,
            y: 200,
            hp: 50,
            speed: 80,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'player',
            name: 'Victim',
        });
        const ctx: DamageTakenEffectContext = {
            addEffect,
            generateRandomInteger: (a, b) => Math.floor((a + b) / 2),
            getUnit: (id) => (id === 'v1' ? unit : undefined),
        };
        createDamageTakenEffect(ctx, { unitId: 'v1', amount: 10, sourceUnitId: null, visualKind: DAMAGE_VISUAL_KIND_DARKNESS });
        const [numberFx, burstFx] = addEffect.mock.calls.map((c) => c[0] as { effectType: string; effectRadius?: number; effectData: { color?: number } });
        expect(addEffect).toHaveBeenCalledTimes(2);
        expect(numberFx.effectData.color).toBe(DAMAGE_VISUAL_KIND_DEFS[DAMAGE_VISUAL_KIND_DARKNESS].numberColor);
        expect(burstFx.effectType).toBe(DARKNESS_RUPTURE_EFFECT_TYPE);
        expect(burstFx.effectRadius).toBe(unit.radius);
    });

    it('uses only a grey slow ResistedDamageNumber (instead of DamageNumber) when resisted > 0', () => {
        const mk = () => {
            const addEffect = vi.fn();
            const unit = new Unit({
                id: 'v1',
                x: 100,
                y: 200,
                hp: 50,
                speed: 80,
                teamId: 'enemy',
                ownerId: 'e1',
                characterId: 'target_dummy',
                portraitId: 'warrior',
                name: 'Victim',
            });
            const ctx: DamageTakenEffectContext = {
                addEffect,
                generateRandomInteger: (a, b) => Math.floor((a + b) / 2),
                getUnit: (id) => (id === 'v1' ? unit : undefined),
            };
            return { addEffect, ctx };
        };
        const normal = mk();
        createDamageTakenEffect(normal.ctx, {
            unitId: 'v1',
            amount: 7,
            sourceUnitId: null,
        });
        const normalTypes = normal.addEffect.mock.calls.map((c) => (c[0] as { effectType: string }).effectType);
        expect(normalTypes).toEqual(['DamageNumber']);

        const resisted = mk();
        createDamageTakenEffect(resisted.ctx, {
            unitId: 'v1',
            amount: 15,
            sourceUnitId: null,
            resisted: 10,
        });
        const fx = resisted.addEffect.mock.calls.map(
            (c) =>
                c[0] as {
                    effectType: string;
                    duration: number;
                    effectData: { amount?: number; color?: number };
                },
        );
        expect(fx.map((e) => e.effectType)).toEqual(['ResistedDamageNumber']);
        expect(fx[0]!.effectData.amount).toBe(15);
        expect(fx[0]!.effectData.color).toBe(RESISTED_DAMAGE_NUMBER_COLOR);
        expect(fx[0]!.duration).toBeGreaterThan(0.92);

        const full = mk();
        createDamageTakenEffect(full.ctx, { unitId: 'v1', amount: 0, sourceUnitId: null, resisted: 10 });
        const fullFx = full.addEffect.mock.calls.map(
            (c) => c[0] as { effectType: string; effectData: { amount?: number } },
        );
        expect(fullFx.map((e) => e.effectType)).toEqual(['ResistedDamageNumber']);
        expect(fullFx[0]!.effectData.amount).toBe(0);
    });

    it('does nothing when amount is 0', () => {
        const addEffect = vi.fn();
        const ctx: DamageTakenEffectContext = {
            addEffect,
            generateRandomInteger: (a, _b) => a,
            getUnit: () => undefined,
        };
        createDamageTakenEffect(ctx, {
            unitId: 'x',
            amount: 0,
            sourceUnitId: null,
        });
        expect(addEffect).not.toHaveBeenCalled();
    });
});
