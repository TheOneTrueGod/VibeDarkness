import { describe, expect, it } from 'vitest';
import { describeAbilityRecovery, describeChargeRequirement, recoveryGlossaryEntries } from './recoveryChargeDefinitions';

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

describe('describeChargeRequirement', () => {
    it('states the charges a use needs and the per-round gain', () => {
        expect(describeChargeRequirement(
            { chargeType: 'lightCharge', chargesPerRecovery: 1, usesRecovered: 1 },
            1,
        )).toBe('Requires {1} Light charge. You gain {1} per round.');
    });

    it('pluralizes the requirement and reports zero per-round gain', () => {
        expect(describeChargeRequirement(
            { chargeType: 'energyCharge', chargesPerRecovery: 3, usesRecovered: 1 },
            0,
        )).toBe('Requires {3} Energy charges. You gain {0} per round.');
    });
});
