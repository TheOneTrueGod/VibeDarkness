import { describe, expect, it } from 'vitest';
import { describeAbilityRecovery, recoveryGlossaryEntries } from './recoveryChargeDefinitions';

describe('describeAbilityRecovery', () => {
    it('describes a round recovery as uses per round', () => {
        expect(describeAbilityRecovery([
            { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 },
        ])).toBe('Recovers {1} use per round.');
    });

    it('pluralizes several uses and several rounds', () => {
        expect(describeAbilityRecovery([
            { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 2 },
        ])).toBe('Recovers {2} uses per round.');
        expect(describeAbilityRecovery([
            { chargeType: 'roundCharge', chargesPerRecovery: 3, usesRecovered: 1 },
        ])).toBe('Recovers {1} use every {3} rounds.');
    });

    it('keeps other charge types named', () => {
        const text = describeAbilityRecovery([
            { chargeType: 'energyCharge', chargesPerRecovery: 3, usesRecovered: 1 },
        ]);
        expect(text).toContain('Energy charge');
        expect(text).not.toContain('per round');
    });
});

describe('recoveryGlossaryEntries', () => {
    it('uses the full-refill sentence when the ability refills each round', () => {
        expect(recoveryGlossaryEntries([], true)).toEqual([
            { title: 'Recovery', description: 'All uses recover at the start of each round.' },
        ]);
    });
});
