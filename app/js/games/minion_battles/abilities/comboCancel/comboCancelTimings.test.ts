import { describe, it, expect } from 'vitest';
import { AbilityPhase, type AbilityTimingInterval } from '../abilityTimings';
import { withComboCancelAtPhaseStart } from './comboCancelTimings';
import type { Unit } from '../../game/units/Unit';

function minimalThrowTimings(): AbilityTimingInterval[] {
    return [
        {
            id: 'windup',
            start: 0,
            end: 0.3,
            abilityPhase: AbilityPhase.Windup,
        },
        {
            id: 'active',
            start: 0.3,
            end: 0.4,
            abilityPhase: AbilityPhase.Active,
        },
        {
            id: 'cooldown',
            start: 0.4,
            end: 1.6,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ];
}

function stubUnit(comboCount: number, comboMax: number): Unit {
    return {
        activeAbilities: [{ abilityId: 'throw_rock', startTime: 0, targets: [], comboCount }],
        abilityModifiers: { throw_rock: { comboMax } },
    } as unknown as Unit;
}

describe('withComboCancelAtPhaseStart', () => {
    it('attaches conditionalCancel on the interval exiting into Cooldown', () => {
        const result = withComboCancelAtPhaseStart(minimalThrowTimings(), AbilityPhase.Cooldown, {
            cooldownIntervalId: 'cooldown',
        });
        const linger = result.find((t) => t.id === 'cooldown_combo_cancel_linger');
        expect(linger?.conditionalCancel).toBeDefined();
        expect(linger?.conditionalCancel?.abilityTagFilter).toEqual(['Combo']);
    });

    it('condition returns false when comboCount >= comboMax', () => {
        const result = withComboCancelAtPhaseStart(minimalThrowTimings(), AbilityPhase.Cooldown, {
            cooldownIntervalId: 'cooldown',
        });
        const linger = result.find((t) => t.id === 'cooldown_combo_cancel_linger')!;
        const condition = linger.conditionalCancel!.condition;
        const atMax = stubUnit(2, 2);
        const belowMax = stubUnit(1, 2);
        expect(condition({ caster: atMax, engine: {} as never, targets: [], abilityId: 'throw_rock' })).toBe(false);
        expect(condition({ caster: belowMax, engine: {} as never, targets: [], abilityId: 'throw_rock' })).toBe(true);
    });
});
