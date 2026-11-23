import { TRAINING_TREE_ID } from './trees/training';
import { describe, expect, it } from 'vitest';
import { computePassiveBonuses } from './passiveBonuses';
import { getDirectCardsFromResearch, getPetAbilitiesFromResearch, getPetsFromResearch } from './evaluator';
import { PassiveStatKey } from './types';
import {
    COMMAND_CORE_NODE_DISPLACEMENT_STRIKE,
    COMMAND_CORE_NODE_EMPOWER_PET,
    COMMAND_CORE_NODE_LOYAL_COMPANION,
    COMMAND_CORE_NODE_MIMIC_BRAMBLES,
    COMMAND_CORE_NODE_MIMIC_THORN,
    COMMAND_CORE_TREE_ID,
    commandCoreTree,
    EMPOWER_PET_LEVELS,
    EMPOWER_PET_MAX_BITE_DAMAGE_ADD,
    EMPOWER_PET_MAX_HEALTH_ADD,
} from './trees/command_core';

describe('command core research', () => {
    it('getPetAbilitiesFromResearch returns Fling Thorns for Mimic Thorn', () => {
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

    it('Displacement Strike grants card 0715 and pet ability 0716 to the dog', () => {
        const node = commandCoreTree.nodes.find((n) => n.id === COMMAND_CORE_NODE_DISPLACEMENT_STRIKE)!;
        expect(node.tier).toBe(11);
        expect(node.prereqNodeIds).toEqual([COMMAND_CORE_NODE_LOYAL_COMPANION]);
        const research = {
            [COMMAND_CORE_TREE_ID]: [COMMAND_CORE_NODE_LOYAL_COMPANION, COMMAND_CORE_NODE_DISPLACEMENT_STRIKE],
        };
        expect(getDirectCardsFromResearch(research)).toContain('0715');
        expect(getPetAbilitiesFromResearch(research).get('dog')).toEqual(['0716']);
        expect(getDirectCardsFromResearch({ [COMMAND_CORE_TREE_ID]: [COMMAND_CORE_NODE_LOYAL_COMPANION] }))
            .not.toContain('0715');
    });

    it('Mimic Thorn and Mimic Brambles can both be researched', () => {
        for (const id of [COMMAND_CORE_NODE_MIMIC_THORN, COMMAND_CORE_NODE_MIMIC_BRAMBLES]) {
            const node = commandCoreTree.nodes.find((n) => n.id === id)!;
            expect(node.exclusiveWithNodeIds).toEqual([]);
            expect(node.requirements.some((r) => r.type === 'notResearched')).toBe(false);
        }
        const research = {
            [COMMAND_CORE_TREE_ID]: [
                COMMAND_CORE_NODE_LOYAL_COMPANION,
                COMMAND_CORE_NODE_MIMIC_THORN,
                COMMAND_CORE_NODE_MIMIC_BRAMBLES,
            ],
        };
        expect(getPetAbilitiesFromResearch(research).get('dog')).toEqual(['0705', '0706']);
    });

    it('Empower Pet (now in Training) scales pet HP and Dog Bite damage per level', () => {
        const trees = {
            [COMMAND_CORE_TREE_ID]: [COMMAND_CORE_NODE_LOYAL_COMPANION],
            [TRAINING_TREE_ID]: [COMMAND_CORE_NODE_EMPOWER_PET],
        };
        const level1 = computePassiveBonuses(trees, {
            [TRAINING_TREE_ID]: { [COMMAND_CORE_NODE_EMPOWER_PET]: 1 },
        });
        expect(level1[PassiveStatKey.PetMaxHealth]?.add).toBe(
            EMPOWER_PET_MAX_HEALTH_ADD / EMPOWER_PET_LEVELS,
        );
        expect(level1[PassiveStatKey.Ability0701Damage]?.add).toBe(
            EMPOWER_PET_MAX_BITE_DAMAGE_ADD / EMPOWER_PET_LEVELS,
        );

        const levelMax = computePassiveBonuses(trees, {
            [TRAINING_TREE_ID]: { [COMMAND_CORE_NODE_EMPOWER_PET]: EMPOWER_PET_LEVELS },
        });
        expect(levelMax[PassiveStatKey.PetMaxHealth]?.add).toBe(EMPOWER_PET_MAX_HEALTH_ADD);
        expect(levelMax[PassiveStatKey.Ability0701Damage]?.add).toBe(EMPOWER_PET_MAX_BITE_DAMAGE_ADD);
    });
});
