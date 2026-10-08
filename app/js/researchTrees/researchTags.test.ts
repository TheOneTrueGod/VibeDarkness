import { describe, expect, it } from 'vitest';
import { RESEARCH_TREES, getResearchTree } from './list';
import { getResearchNodeTags } from './types';

const BY_TAG = {
    weapon: ['tech_shield', 'crystal_rocks', 'stick_sword'],
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
});
