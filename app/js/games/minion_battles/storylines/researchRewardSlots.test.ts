import { describe, expect, it } from 'vitest';
import { resolveResearchRewardSlots } from './researchRewardSlots';
import type { ResearchRewardSlot } from './storyTypes';
import { CRYSTAL_ROCKS_NODE_CHARGED_ROCKS, CRYSTAL_ROCKS_TREE_ID } from '../../../researchTrees/trees/crystal_rocks';
import { STICK_SWORD_NODE_BASE, STICK_SWORD_TREE_ID } from '../../../researchTrees/trees/stick_sword';
import { LIGHT_NODE_CORE, LIGHT_TREE_ID } from '../../../researchTrees/trees/light';
import {
    TRAINING_HEALTHY_LEVELS,
    TRAINING_MIGHTY_LEVELS,
    TRAINING_NODE_CORE,
    TRAINING_NODE_HEALTHY,
    TRAINING_NODE_MIGHTY,
    TRAINING_TREE_ID,
} from '../../../researchTrees/trees/training';
import {
    EARTH_NODE_EARTH_ATTUNED,
    EARTH_NODE_ROCK_SYNERGY_DAMAGE,
    EARTH_TREE_ID,
} from '../../../researchTrees/trees/earth';
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

describe('resolveResearchRewardSlots - stat (Training) slots', () => {
    const STAT_SLOT: ResearchRewardSlot = { tag: 'stat', random: true };
    const KNOWS_RESEARCH = { Research: { acquiredAt: 1 } };
    // Chip from lobby D2D556: Rocks + Earth Core, no Training research yet.
    const CHIP_EQUIPMENT = [ROCKS, CORE_ITEM_IDS.EarthCore];
    const CHIP_RESEARCH = {
        [CRYSTAL_ROCKS_TREE_ID]: ['throw_rock', CRYSTAL_ROCKS_NODE_CHARGED_ROCKS, 'more_rock'],
        [EARTH_TREE_ID]: ['earth_core', 'digging_claws', 'earth_rock_slide', 'earth_stone_tomb', 'rapid_throw'],
    };

    function offeredStatNodeIds(
        research: Record<string, string[]>,
        equipment: string[],
        context: Parameters<typeof resolveResearchRewardSlots>[4],
    ): Set<string> {
        const seen = new Set<string>();
        for (let i = 0; i < 60; i++) {
            const [row] = resolveResearchRewardSlots([STAT_SLOT], research, equipment, `seed${i}`, context);
            if (row.disabledLabel) continue;
            seen.add((row.action as { nodeId: string }).nodeId);
        }
        return seen;
    }

    it('offers Healthy and Mighty to a non-Basic-Core character whose account knows Research', () => {
        const seen = offeredStatNodeIds(CHIP_RESEARCH, CHIP_EQUIPMENT, { accountKnowledge: KNOWS_RESEARCH });
        expect(seen.has(TRAINING_NODE_HEALTHY)).toBe(true);
        expect(seen.has(TRAINING_NODE_MIGHTY)).toBe(true);
    });

    it('offers no Training research when the account lacks the Research knowledge', () => {
        const seen = offeredStatNodeIds(CHIP_RESEARCH, CHIP_EQUIPMENT, { accountKnowledge: {} });
        const trainingNodeIds = [TRAINING_NODE_CORE, TRAINING_NODE_HEALTHY, TRAINING_NODE_MIGHTY];
        expect(trainingNodeIds.some((id) => seen.has(id))).toBe(false);
    });

    it('keeps offering a leveled node until it reaches its max level', () => {
        const research = { ...CHIP_RESEARCH, [TRAINING_TREE_ID]: [TRAINING_NODE_HEALTHY, TRAINING_NODE_MIGHTY] };
        const partway = offeredStatNodeIds(research, CHIP_EQUIPMENT, {
            accountKnowledge: KNOWS_RESEARCH,
            researchNodeLevels: { [TRAINING_TREE_ID]: { [TRAINING_NODE_HEALTHY]: 2, [TRAINING_NODE_MIGHTY]: 1 } },
        });
        expect(partway.has(TRAINING_NODE_HEALTHY)).toBe(true);
        expect(partway.has(TRAINING_NODE_MIGHTY)).toBe(true);

        const maxed = offeredStatNodeIds(research, CHIP_EQUIPMENT, {
            accountKnowledge: KNOWS_RESEARCH,
            researchNodeLevels: {
                [TRAINING_TREE_ID]: {
                    [TRAINING_NODE_HEALTHY]: TRAINING_HEALTHY_LEVELS,
                    [TRAINING_NODE_MIGHTY]: TRAINING_MIGHTY_LEVELS,
                },
            },
        });
        expect(maxed.has(TRAINING_NODE_HEALTHY)).toBe(false);
        expect(maxed.has(TRAINING_NODE_MIGHTY)).toBe(false);
    });

    it('offers Stone Synergy as a stat upgrade to an Earth Core character', () => {
        const seen = offeredStatNodeIds(CHIP_RESEARCH, CHIP_EQUIPMENT, { accountKnowledge: KNOWS_RESEARCH });
        expect(seen.has(EARTH_NODE_ROCK_SYNERGY_DAMAGE)).toBe(true);
    });

    it('offers Earth Attuned as a stat upgrade to an Earth Core character', () => {
        const seen = offeredStatNodeIds(CHIP_RESEARCH, CHIP_EQUIPMENT, { accountKnowledge: KNOWS_RESEARCH });
        expect(seen.has(EARTH_NODE_EARTH_ATTUNED)).toBe(true);
    });

    it('never offers a single-level node that is already researched', () => {
        const research = { ...CHIP_RESEARCH, [TRAINING_TREE_ID]: [TRAINING_NODE_CORE] };
        const seen = offeredStatNodeIds(research, CHIP_EQUIPMENT, { accountKnowledge: KNOWS_RESEARCH });
        expect(seen.has(TRAINING_NODE_CORE)).toBe(false);
    });
});
