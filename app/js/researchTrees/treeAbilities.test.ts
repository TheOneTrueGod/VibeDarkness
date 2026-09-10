import { describe, expect, it } from 'vitest';
import { CORE_ITEM_IDS } from '../games/minion_battles/character_defs/items';
import { coreBasicItem } from '../games/minion_battles/character_defs/items/core/004_core_basic';
import { rocksItem } from '../games/minion_battles/character_defs/items/hands/001_rocks';
import {
    collectResearchTreeAbilityIds,
    isPlayerVisibleResearchTree,
    researchTreeMatchesAbilityIds,
    sortResearchTreesByPlayerAbilities,
} from './treeAbilities';
import { trainingTree, TRAINING_NODE_DOUBLE_PUNCH, TRAINING_TREE_ID } from './trees/training';
import { crystalRocksTree } from './trees/crystal_rocks';
import { earthTree, EARTH_NODE_EARTH_CORE, EARTH_TREE_ID } from './trees/earth';
import { lightTree, LIGHT_NODE_CORE } from './trees/light';
import { bloodMageTree } from './trees/blood_mage';

function punchAbilityId(): string {
    const node = trainingTree.nodes.find((n) => n.id === TRAINING_NODE_DOUBLE_PUNCH);
    return node?.modifiesAbility?.from ?? '';
}

function earthCoreAbilityId(): string {
    const node = earthTree.nodes.find((n) => n.id === EARTH_NODE_EARTH_CORE);
    const add = node?.effects.find((e) => e.type === 'addCard');
    return add && add.type === 'addCard' ? add.cardId : '';
}

function lightCoreAbilityId(): string {
    const node = lightTree.nodes.find((n) => n.id === LIGHT_NODE_CORE);
    const add = node?.effects.find((e) => e.type === 'addCard');
    return add && add.type === 'addCard' ? add.cardId : '';
}

describe('collectResearchTreeAbilityIds', () => {
    it('includes punch from Training via the BasicCore access item', () => {
        expect(CORE_ITEM_IDS.BasicCore).toBe(coreBasicItem.id);
        const punchId = punchAbilityId();
        expect(punchId).toBeTruthy();
        expect(collectResearchTreeAbilityIds(trainingTree).has(punchId)).toBe(true);
        expect(coreBasicItem.cardsToAdd).toContain(punchId);
    });

    it('includes throw_rock on Rocks, not on Earth', () => {
        const rockId = rocksItem.cardsToAdd[0];
        expect(rockId).toBeTruthy();
        expect(collectResearchTreeAbilityIds(crystalRocksTree).has(rockId!)).toBe(true);
        expect(collectResearchTreeAbilityIds(earthTree).has(rockId!)).toBe(false);
        expect(collectResearchTreeAbilityIds(earthTree).has(earthCoreAbilityId())).toBe(true);
    });

    it('includes Light Core blast, not BasicCore cards', () => {
        const lightIds = collectResearchTreeAbilityIds(lightTree);
        expect(lightIds.has(lightCoreAbilityId())).toBe(true);
        for (const cardId of coreBasicItem.cardsToAdd) {
            expect(lightIds.has(cardId)).toBe(false);
        }
    });
});

describe('researchTreeMatchesAbilityIds', () => {
    it('matches Training for punch and not Earth', () => {
        const punch = new Set([punchAbilityId()]);
        expect(researchTreeMatchesAbilityIds(trainingTree, punch)).toBe(true);
        expect(researchTreeMatchesAbilityIds(earthTree, punch)).toBe(false);
        expect(researchTreeMatchesAbilityIds(bloodMageTree, punch)).toBe(false);
    });

    it('matches Earth once the player has the Earth Core ability', () => {
        expect(researchTreeMatchesAbilityIds(earthTree, new Set([earthCoreAbilityId()]))).toBe(true);
    });
});

describe('isPlayerVisibleResearchTree', () => {
    it('shows a researched tree even without current abilities', () => {
        expect(
            isPlayerVisibleResearchTree(earthTree, { [EARTH_TREE_ID]: [EARTH_NODE_EARTH_CORE] }, new Set()),
        ).toBe(true);
        expect(isPlayerVisibleResearchTree(earthTree, {}, new Set())).toBe(false);
    });
});

describe('sortResearchTreesByPlayerAbilities', () => {
    it('puts trees the player has abilities in first', () => {
        const sorted = sortResearchTreesByPlayerAbilities(
            [earthTree, trainingTree, bloodMageTree],
            new Set([punchAbilityId()]),
        );
        expect(sorted.map((t) => t.id)).toEqual([TRAINING_TREE_ID, EARTH_TREE_ID, bloodMageTree.id]);
    });
});
