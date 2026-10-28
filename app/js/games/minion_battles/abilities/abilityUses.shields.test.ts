import { describe, it, expect } from 'vitest';
import { getAbilityUseConfig, initializeAbilityRuntimeForUnit, refillUsesAtRoundStart } from './abilityUses';
import { Unit } from '../game/units/Unit';
import { SWORD_BASE_MAX_USES } from '../card_defs/0112_SwingSword/0112Ability';
import { SWING_BAT_MAX_USES } from '../card_defs/0115_SwingBat/0115Ability';
import { THROW_KNIFE_MAX_USES } from '../card_defs/0109_ThrowKnife/0109Ability';
import { THROW_ROCK_MAX_USES } from '../card_defs/0107_ThrowRock/0107Ability';

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
    it('gives Dodge a full refill each round', () => {
        const config = getAbilityUseConfig('0101');
        expect(config.maxUses).toBe(2);
        expect(config.refillsEachRound).toBe(true);
        expect(config.recoveries).toEqual([]);
    });

    it('gives Throw Torch, Claw, and Digging Claws a full refill each round', () => {
        for (const id of ['0601', '0111', '0534'] as const) {
            const config = getAbilityUseConfig(id);
            expect(config.refillsEachRound).toBe(true);
            expect(config.recoveries).toEqual([]);
        }
    });

    it('gives Swing Bat, Swing Sword, Throw Knife, and Throw Rock their base use counts', () => {
        expect(getAbilityUseConfig('0115').maxUses).toBe(SWING_BAT_MAX_USES);
        expect(getAbilityUseConfig('0112').maxUses).toBe(SWORD_BASE_MAX_USES);
        expect(getAbilityUseConfig('throw_knife').maxUses).toBe(THROW_KNIFE_MAX_USES);
        expect(getAbilityUseConfig('throw_rock').maxUses).toBe(THROW_ROCK_MAX_USES);
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
    it('refills default abilities and leaves explicit charge rules', () => {
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
            abilities: ['0112', '0101', '0111', '0114'],
        });
        initializeAbilityRuntimeForUnit(unit);
        unit.abilityRuntime['0112']!.currentUses = 0;
        unit.abilityRuntime['0101']!.currentUses = 0;
        unit.abilityRuntime['0111']!.currentUses = 0;
        unit.abilityRuntime['0114']!.currentUses = 0;

        refillUsesAtRoundStart(unit);

        expect(unit.abilityRuntime['0112']!.currentUses).toBe(SWORD_BASE_MAX_USES);
        expect(unit.abilityRuntime['0101']!.currentUses).toBe(getAbilityUseConfig('0101').maxUses);
        expect(unit.abilityRuntime['0111']!.currentUses).toBe(getAbilityUseConfig('0111').maxUses);
        expect(unit.abilityRuntime['0114']!.currentUses).toBe(0);
    });
});
