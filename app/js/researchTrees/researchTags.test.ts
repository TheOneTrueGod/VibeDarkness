import { describe, expect, it } from 'vitest';
import { RESEARCH_TREES, getResearchTree } from './list';
import { getResearchNodeTags } from './types';
import { sortResearchTreesByPlayerAbilities } from './treeAbilities';

const EQUIPMENT_TREE_IDS = [
    'tech_shield',
    'crystal_rocks',
    'stick_sword',
    'charged_rocks_item',
    'knives_item',
    'sword_item',
    'mace_item',
    'crystal_shield_item',
    'charged_shield_item',
    'thrown_weapons',
    'melee_weapons',
] as const;

const BY_TAG = {
    weapon: EQUIPMENT_TREE_IDS,
    equipment: EQUIPMENT_TREE_IDS,
    stat: ['training'],
    core: ['light_core', 'earth', 'command_core', 'gravity_core', 'blood_mage'],
} as const;

describe('research tags', () => {
    it('tags every node of the weapon, stat and core trees through its tree', () => {
        for (const [tag, treeIds] of Object.entries(BY_TAG)) {
            for (const treeId of treeIds) {
                const tree = getResearchTree(treeId);
                expect(tree, treeId).toBeDefined();
                for (const node of tree!.nodes) expect(getResearchNodeTags(tree!, node)).toContain(tag);
            }
        }
    });

    it('leaves every other tree untagged', () => {
        const tagged = new Set<string>(Object.values(BY_TAG).flat());
        for (const tree of RESEARCH_TREES) {
            if (tagged.has(tree.id)) continue;
            expect(tree.tags ?? [], tree.id).toEqual([]);
        }
    });

    it('merges tree and node tags without duplicates', () => {
        expect(getResearchNodeTags({ tags: ['core'] }, { tags: ['stat', 'core'] })).toEqual(['core', 'stat']);
        expect(getResearchNodeTags({}, {})).toEqual([]);
    });

    it('sorts equipment-tagged trees after all others, keeping order within each group', () => {
        const tree = (id: string, tags: ('weapon' | 'equipment')[] = []) =>
            ({ id, tags, accessRequirements: [], nodes: [] }) as unknown as Parameters<
                typeof sortResearchTreesByPlayerAbilities
            >[0][number];
        const sorted = sortResearchTreesByPlayerAbilities(
            [tree('gear_a', ['weapon', 'equipment']), tree('plain_a'), tree('gear_b', ['equipment']), tree('plain_b')],
            new Set(),
        );
        expect(sorted.map((t) => t.id)).toEqual(['plain_a', 'plain_b', 'gear_a', 'gear_b']);
    });
});
