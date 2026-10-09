import { describe, expect, it } from 'vitest';
import { resolveResearchRewardSlots } from './researchRewardSlots';
import type { ResearchRewardSlot } from './storyTypes';
import { CRYSTAL_ROCKS_NODE_CHARGED_ROCKS, CRYSTAL_ROCKS_TREE_ID } from '../../../researchTrees/trees/crystal_rocks';
import { STICK_SWORD_NODE_BASE, STICK_SWORD_TREE_ID } from '../../../researchTrees/trees/stick_sword';
import { LIGHT_NODE_CORE, LIGHT_TREE_ID } from '../../../researchTrees/trees/light';
import { CORE_ITEM_IDS } from '../character_defs/items';

const ROCKS = '001';
const STICK = '002';

const WEAPON_SLOT: ResearchRewardSlot = { tag: 'weapon', random: true };

function offeredTreeIds(slot: ResearchRewardSlot, research: Record<string, string[]>, equipment: string[]) {
    const seen: { treeId: string; nodeId: string }[] = [];
    for (let i = 0; i < 40; i++) {
        const [row] = resolveResearchRewardSlots([slot], research, equipment, `seed${i}`);
        if (row.disabledLabel) continue;
        const a = row.action as { treeId: string; nodeId: string };
        seen.push({ treeId: a.treeId, nodeId: a.nodeId });
    }
    return seen;
}

describe('resolveResearchRewardSlots - active research', () => {
    it('never offers a crystal_rocks node for a random weapon slot when the Stick is equipped', () => {
        const research = {
            [CRYSTAL_ROCKS_TREE_ID]: ['throw_rock'],
            [STICK_SWORD_TREE_ID]: [STICK_SWORD_NODE_BASE],
        };
        const seen = offeredTreeIds(WEAPON_SLOT, research, [STICK]);
        expect(seen.length).toBeGreaterThan(0);
        expect(seen.every((s) => s.treeId !== CRYSTAL_ROCKS_TREE_ID)).toBe(true);
    });

    it('can offer charged_rocks with Rocks equipped and no stored research (virtual root)', () => {
        const seen = offeredTreeIds(
            { tag: 'weapon', random: true, treeId: CRYSTAL_ROCKS_TREE_ID },
            {},
            [ROCKS],
        );
        expect(seen.some((s) => s.nodeId === CRYSTAL_ROCKS_NODE_CHARGED_ROCKS)).toBe(true);
    });

    it('keeps offering core-tagged research as before', () => {
        const rows = resolveResearchRewardSlots(
            [{ tag: 'core', random: true }],
            { [LIGHT_TREE_ID]: [LIGHT_NODE_CORE] },
            [CORE_ITEM_IDS.LightCore],
            'p1',
        );
        expect(rows[0].disabledLabel).toBeUndefined();
    });

    it('leaves specific designer slots untouched', () => {
        const [row] = resolveResearchRewardSlots(
            [{ treeId: CRYSTAL_ROCKS_TREE_ID, nodeId: CRYSTAL_ROCKS_NODE_CHARGED_ROCKS }],
            {},
            [STICK],
        );
        expect(row.action).toEqual({
            type: 'grant_research_to_player',
            treeId: CRYSTAL_ROCKS_TREE_ID,
            nodeId: CRYSTAL_ROCKS_NODE_CHARGED_ROCKS,
        });
    });
});
