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
        expect(linger?.conditionalCancel?.abilityTagFilter).toBeUndefined();
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

    it("wraps the last Cooldown interval when which is 'last'", () => {
        const timings: AbilityTimingInterval[] = [
            { id: 'windup', start: 0, end: 0.3, abilityPhase: AbilityPhase.Windup },
            { id: 'cd_a', start: 0.3, end: 0.6, abilityPhase: AbilityPhase.Cooldown },
            { id: 'active', start: 0.6, end: 0.7, abilityPhase: AbilityPhase.Active },
            { id: 'cd_b', start: 0.7, end: 1.5, abilityPhase: AbilityPhase.Cooldown },
        ];
        const last = withComboCancelAtPhaseStart(timings, AbilityPhase.Cooldown, { which: 'last' });
        expect(last.find((t) => t.id === 'cd_b_combo_cancel_linger')).toBeDefined();
        expect(last.find((t) => t.id === 'cd_a_combo_cancel_linger')).toBeUndefined();
        const first = withComboCancelAtPhaseStart(timings, AbilityPhase.Cooldown);
        expect(first.find((t) => t.id === 'cd_a_combo_cancel_linger')).toBeDefined();
    });
});
