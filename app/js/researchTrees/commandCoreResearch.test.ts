import { describe, expect, it } from 'vitest';
import { computePassiveBonuses } from './passiveBonuses';
import { getPetAbilitiesFromResearch, getPetsFromResearch } from './evaluator';
import { PassiveStatKey } from './types';
import {
    COMMAND_CORE_NODE_EMPOWER_PET,
    COMMAND_CORE_NODE_LOYAL_COMPANION,
    COMMAND_CORE_NODE_MIMIC_BRAMBLES,
    COMMAND_CORE_NODE_MIMIC_THORN,
    COMMAND_CORE_TREE_ID,
    EMPOWER_PET_LEVELS,
    EMPOWER_PET_MAX_BITE_DAMAGE_ADD,
    EMPOWER_PET_MAX_HEALTH_ADD,
} from './trees/command_core';

describe('command core research', () => {
    it('getPetAbilitiesFromResearch returns Fling Thorn for Mimic Thorn', () => {
        const research = {
            [COMMAND_CORE_TREE_ID]: [COMMAND_CORE_NODE_LOYAL_COMPANION, COMMAND_CORE_NODE_MIMIC_THORN],
        };
        expect(getPetsFromResearch(research)).toEqual(['dog']);
        expect(getPetAbilitiesFromResearch(research).get('dog')).toEqual(['0705']);
    });

    it('getPetAbilitiesFromResearch returns Bramble Patch strike for Mimic Brambles', () => {
        const research = {
            [COMMAND_CORE_TREE_ID]: [COMMAND_CORE_NODE_LOYAL_COMPANION, COMMAND_CORE_NODE_MIMIC_BRAMBLES],
        };
        expect(getPetAbilitiesFromResearch(research).get('dog')).toEqual(['0706']);
    });

    it('Empower Pet scales pet HP and Dog Bite damage per level', () => {
        const trees = {
            [COMMAND_CORE_TREE_ID]: [COMMAND_CORE_NODE_LOYAL_COMPANION, COMMAND_CORE_NODE_EMPOWER_PET],
        };
        const level1 = computePassiveBonuses(trees, {
            [COMMAND_CORE_TREE_ID]: { [COMMAND_CORE_NODE_EMPOWER_PET]: 1 },
        });
        expect(level1[PassiveStatKey.PetMaxHealth]?.add).toBe(
            EMPOWER_PET_MAX_HEALTH_ADD / EMPOWER_PET_LEVELS,
        );
        expect(level1[PassiveStatKey.Ability0701Damage]?.add).toBe(
            EMPOWER_PET_MAX_BITE_DAMAGE_ADD / EMPOWER_PET_LEVELS,
        );

        const levelMax = computePassiveBonuses(trees, {
            [COMMAND_CORE_TREE_ID]: { [COMMAND_CORE_NODE_EMPOWER_PET]: EMPOWER_PET_LEVELS },
        });
        expect(levelMax[PassiveStatKey.PetMaxHealth]?.add).toBe(EMPOWER_PET_MAX_HEALTH_ADD);
        expect(levelMax[PassiveStatKey.Ability0701Damage]?.add).toBe(EMPOWER_PET_MAX_BITE_DAMAGE_ADD);
    });
});
