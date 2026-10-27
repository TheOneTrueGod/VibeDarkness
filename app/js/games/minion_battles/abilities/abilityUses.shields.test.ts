import { describe, it, expect } from 'vitest';
import { getAbilityUseConfig, initializeAbilityRuntimeForUnit, refillUsesAtRoundStart } from './abilityUses';
import { Unit } from '../game/units/Unit';
import { SWORD_BASE_MAX_USES } from '../card_defs/0112_SwingSword/0112Ability';

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

    it("gives Sic 'em two uses that refill each round", () => {
        const config = getAbilityUseConfig('0704');
        expect(config.maxUses).toBe(2);
        expect(config.refillsEachRound).toBe(true);
        expect(config.recoveries).toEqual([]);
    });
});

describe('default ability use config fallback', () => {
    it('refills unconfigured abilities like wait each round', () => {
        const config = getAbilityUseConfig('wait');
        expect(config.maxUses).toBe(1);
        expect(config.startingUses).toBeUndefined();
        expect(config.refillsEachRound).toBe(true);
        expect(config.recoveries).toEqual([]);
    });
});

describe('round-start use refill', () => {
    it('refills stamina-backed abilities and leaves explicit charge rules and opt-outs', () => {
        const unit = new Unit({
            id: 'refill_unit',
            x: 0,
            y: 0,
            hp: 100,
            maxHp: 100,
            speed: 100,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'player',
            name: 'Refill',
            abilities: ['0112', '0101', '0111'],
        });
        initializeAbilityRuntimeForUnit(unit);
        unit.abilityRuntime['0112']!.currentUses = 0;
        unit.abilityRuntime['0101']!.currentUses = 0;
        unit.abilityRuntime['0111']!.currentUses = 0;

        refillUsesAtRoundStart(unit);

        expect(unit.abilityRuntime['0112']!.currentUses).toBe(SWORD_BASE_MAX_USES);
        expect(unit.abilityRuntime['0101']!.currentUses).toBe(0);
        expect(unit.abilityRuntime['0111']!.currentUses).toBe(0);
    });
});
