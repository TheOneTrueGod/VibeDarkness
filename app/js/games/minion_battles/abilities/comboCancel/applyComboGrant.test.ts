import { describe, it, expect } from 'vitest';
import { AbilityPhase, type AbilityTimingEntry, type AbilityTimingInterval } from '../abilityTimings';
import { applyComboGrantToTimings } from './applyComboGrant';

const ABILITY_ID = 'test_combo_ability';

function plainTimings(): AbilityTimingInterval[] {
    return [
        { id: 'windup', start: 0, end: 0.3, abilityPhase: AbilityPhase.Windup },
        { id: 'active', start: 0.3, end: 0.4, abilityPhase: AbilityPhase.Active },
        { id: 'cooldown', start: 0.4, end: 1.6, abilityPhase: AbilityPhase.Cooldown },
    ];
}

function casterWith(mod: Record<string, unknown> | undefined): unknown {
    return { abilityModifiers: mod ? { [ABILITY_ID]: mod } : {} };
}

describe('applyComboGrantToTimings', () => {
    it('returns the same reference when there is no grant', () => {
        const entries = plainTimings();
        expect(applyComboGrantToTimings(entries, casterWith(undefined), ABILITY_ID)).toBe(entries);
        expect(applyComboGrantToTimings(entries, undefined, ABILITY_ID)).toBe(entries);
        expect(applyComboGrantToTimings(entries, {}, ABILITY_ID)).toBe(entries);
    });

    it('opens a combo window before the last cooldown for an unlimited grant', () => {
        const entries = plainTimings();
        const out = applyComboGrantToTimings(entries, casterWith({ comboUnlimited: true }), ABILITY_ID) as AbilityTimingInterval[];
        const lingerIdx = out.findIndex((t) => t.id.includes('_combo_cancel_linger'));
        expect(lingerIdx).toBeGreaterThan(-1);
        expect(out[lingerIdx]!.conditionalCancel).toBeDefined();
        expect(out[lingerIdx + 1]!.id).toBe('cooldown');
        expect(out[lingerIdx + 1]!.start).toBeCloseTo(out[lingerIdx]!.end);
    });

    it('is idempotent on a second application', () => {
        const caster = casterWith({ comboUnlimited: true });
        const once = applyComboGrantToTimings(plainTimings(), caster, ABILITY_ID);
        expect(applyComboGrantToTimings(once, caster, ABILITY_ID)).toBe(once);
    });

    it('leaves an ability with no Cooldown interval unchanged', () => {
        const entries: AbilityTimingEntry[] = [
            { id: 'windup', start: 0, end: 0.3, abilityPhase: AbilityPhase.Windup },
            { id: 'active', start: 0.3, end: 0.4, abilityPhase: AbilityPhase.Active },
        ];
        expect(applyComboGrantToTimings(entries, casterWith({ comboMax: 2 }), ABILITY_ID)).toBe(entries);
    });
});
