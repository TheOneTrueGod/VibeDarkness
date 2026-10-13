import { describe, expect, it } from 'vitest';
import { formatComboMeterCount, getComboMeterCount } from './comboMeterCount';

type Active = { abilityId: string; comboCount?: number; conditionalCancelPaused?: boolean; conditionalCancelTagFilter?: string[] };

function engineWith(activeAbilities: Active[] | null) {
    return {
        getLocalPlayerUnit: () => (activeAbilities ? { activeAbilities } : null),
    } as unknown as Parameters<typeof getComboMeterCount>[0];
}

describe('getComboMeterCount', () => {
    it('is null with no local unit or no combo in progress', () => {
        expect(getComboMeterCount(null)).toBeNull();
        expect(getComboMeterCount(engineWith(null))).toBeNull();
        expect(getComboMeterCount(engineWith([]))).toBeNull();
        expect(getComboMeterCount(engineWith([{ abilityId: 'throw_rock' }]))).toBeNull();
    });

    it('shows 1 once the first cast reaches its Combo window', () => {
        expect(getComboMeterCount(engineWith([{
            abilityId: 'throw_rock',
            conditionalCancelPaused: true,
            conditionalCancelTagFilter: ['Combo'],
        }]))).toBe(1);
    });

    it('ignores non-Combo conditional-cancel pauses (e.g. Entombed)', () => {
        expect(getComboMeterCount(engineWith([{
            abilityId: '0534',
            conditionalCancelPaused: true,
            conditionalCancelTagFilter: ['Entombed'],
        }]))).toBeNull();
    });

    it('shows the follow-up chain depth while it casts', () => {
        expect(getComboMeterCount(engineWith([{ abilityId: 'throw_rock', comboCount: 3 }]))).toBe(3);
    });
});

describe('formatComboMeterCount', () => {
    it('zero-pads to three digits and caps at 999', () => {
        expect(formatComboMeterCount(1)).toBe('001');
        expect(formatComboMeterCount(12)).toBe('012');
        expect(formatComboMeterCount(1234)).toBe('999');
    });
});
