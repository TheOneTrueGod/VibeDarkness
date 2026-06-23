import { describe, it, expect } from 'vitest';
import { getAbilityUseConfig } from './abilityUses';

describe('shield ability use configs', () => {
    it.each([
        ['0104', 'Raise Shield'],
        ['0106', 'Laser Shield'],
        ['0113', 'Absorption Shield'],
    ] as const)('gives %s (%s) three max uses (base + two extra)', (id, _name) => {
        expect(getAbilityUseConfig(id).maxUses).toBe(3);
    });

    it('gives 0110 (Shining Block) two max uses', () => {
        expect(getAbilityUseConfig('0110').maxUses).toBe(2);
    });
});

describe('migrated ability use configs', () => {
    it('gives Dodge round-charge recovery', () => {
        const config = getAbilityUseConfig('0101');
        expect(config.maxUses).toBe(2);
        expect(config.recoveries).toEqual([
            { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 },
        ]);
    });

    it('gives Energy Blast zero starting uses and energy-charge recovery', () => {
        const config = getAbilityUseConfig('0114');
        expect(config.maxUses).toBe(1);
        expect(config.startingUses).toBe(0);
        expect(config.recoveries).toEqual([
            { chargeType: 'energyCharge', chargesPerRecovery: 3, usesRecovered: 1 },
        ]);
    });

    it('gives Throw Charged Rock light-charge recovery', () => {
        const config = getAbilityUseConfig('throw_charged_rock');
        expect(config.maxUses).toBe(3);
        expect(config.recoveries).toEqual([
            { chargeType: 'lightCharge', chargesPerRecovery: 1, usesRecovered: 1 },
        ]);
    });

    it('gives Heel two uses with round-charge recovery', () => {
        const config = getAbilityUseConfig('0703');
        expect(config.maxUses).toBe(2);
        expect(config.recoveries).toEqual([
            { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 },
        ]);
    });

    it("gives Sic 'em two uses with two-stamina recovery", () => {
        const config = getAbilityUseConfig('0704');
        expect(config.maxUses).toBe(2);
        expect(config.recoveries).toEqual([
            { chargeType: 'staminaCharge', chargesPerRecovery: 2, usesRecovered: 1 },
        ]);
    });
});

describe('default ability use config fallback', () => {
    it('uses stamina default for unconfigured abilities like wait', () => {
        const config = getAbilityUseConfig('wait');
        expect(config.maxUses).toBe(1);
        expect(config.startingUses).toBeUndefined();
        expect(config.recoveries).toEqual([
            { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 },
        ]);
    });
});
