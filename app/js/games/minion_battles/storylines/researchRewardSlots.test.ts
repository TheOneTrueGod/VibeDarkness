import { describe, expect, it } from 'vitest';
import { resolveResearchRewardSlots } from './researchRewardSlots';
import type { ResearchRewardSlot } from './storyTypes';
import {
    NODE_IRON_WRISTS,
    NODE_MORE_POWER,
    NODE_MORE_ROCK,
    WEAPONS_TREE_ID,
    WEAPON_ITEM_CHARGED_ROCKS,
    WEAPON_ITEM_KNIVES,
    WEAPON_ITEM_SWORD,
} from '../../../researchTrees/trees/weaponTreeIds';
import { weaponsTree } from '../../../researchTrees/trees/weapons';
import { isVirtualRootNode } from '../../../researchTrees/types';
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
    it('only offers Sword upgrades for a random weapon slot when the Sword is equipped', () => {
        const research = { [WEAPONS_TREE_ID]: ['throw_rock', 'swing_stick', NODE_MORE_POWER] };
        const seen = offeredTreeIds(WEAPON_SLOT, research, [WEAPON_ITEM_SWORD]);
        expect(seen.length).toBeGreaterThan(0);
        expect(seen.every((s) => s.nodeId === NODE_IRON_WRISTS)).toBe(true);
    });

    it('never offers a virtual root', () => {
        const roots = new Set(weaponsTree.nodes.filter(isVirtualRootNode).map((n) => n.id));
        const seen = offeredTreeIds(WEAPON_SLOT, {}, [WEAPON_ITEM_SWORD, '001', '003']);
        expect(seen.every((s) => !roots.has(s.nodeId))).toBe(true);
        const [row] = resolveResearchRewardSlots([{ tag: 'weapon' }], {}, ['001']);
        expect(roots.has((row.action as { nodeId: string }).nodeId)).toBe(false);
    });

    it('offers More Power with Charged Rocks equipped and no stored research (virtual root)', () => {
        const seen = offeredTreeIds(
            { tag: 'weapon', random: true, treeId: WEAPONS_TREE_ID },
            {},
            [WEAPON_ITEM_CHARGED_ROCKS],
        );
        expect(seen.some((s) => s.nodeId === NODE_MORE_POWER)).toBe(true);
    });

    it('only offers upgrades of the equipped item (base Rocks has none)', () => {
        const seen = offeredTreeIds(WEAPON_SLOT, {}, [ROCKS]);
        expect(seen.every((s) => s.treeId !== WEAPONS_TREE_ID)).toBe(true);
    });

    it('offers the shared More Rock only while Knives are equipped', () => {
        const withKnives = offeredTreeIds(WEAPON_SLOT, {}, [WEAPON_ITEM_KNIVES]);
        expect(withKnives.some((s) => s.nodeId === NODE_MORE_ROCK)).toBe(true);
        expect(withKnives.every((s) => s.nodeId !== NODE_MORE_POWER)).toBe(true);

        const withStick = offeredTreeIds(WEAPON_SLOT, {}, [STICK]);
        expect(withStick.every((s) => s.treeId !== WEAPONS_TREE_ID)).toBe(true);
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
            [{ treeId: WEAPONS_TREE_ID, nodeId: NODE_MORE_POWER }],
            {},
            [STICK],
        );
        expect(row.action).toEqual({
            type: 'grant_research_to_player',
            treeId: WEAPONS_TREE_ID,
            nodeId: NODE_MORE_POWER,
        });
    });
});

describe('resolveResearchRewardSlots - equipmentUpgrade slots', () => {
    const UPGRADE: ResearchRewardSlot = { kind: 'equipmentUpgrade' };
    const itemIds = (rows: ReturnType<typeof resolveResearchRewardSlots>) =>
        rows.map((r) => (r.action as { itemId?: string }).itemId);

    it('offers one equip_item row per upgrade of the equipped item, with name and description', () => {
        const rows = resolveResearchRewardSlots([UPGRADE, UPGRADE], {}, [ROCKS]);
        expect(itemIds(rows)).toEqual(['011', '012']);
        expect(rows.every((r) => r.action.type === 'equip_item')).toBe(true);
        expect(rows[0].loreTitle).toBe('Charged Rocks');
        expect(rows[0].loreDescription).toBeTruthy();
        expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    });

    it('offers the Stick upgrades (Sword, Mace)', () => {
        expect(itemIds(resolveResearchRewardSlots([UPGRADE, UPGRADE], {}, [STICK]))).toEqual(['013', '014']);
    });

    it('offers a Shield player a single option (Crystal Shield) and omits the spare slot', () => {
        const rows = resolveResearchRewardSlots([UPGRADE, UPGRADE], {}, ['003']);
        expect(itemIds(rows)).toEqual(['015']);
    });

    it('offers nothing when no equipped item has an upgrade, and mixes with research slots', () => {
        expect(resolveResearchRewardSlots([UPGRADE], {}, ['011'])).toEqual([]);
        const rows = resolveResearchRewardSlots(
            [UPGRADE, { treeId: WEAPONS_TREE_ID, nodeId: NODE_MORE_POWER }],
            {},
            [ROCKS],
        );
        expect(rows.map((r) => r.action.type)).toEqual(['equip_item', 'grant_research_to_player']);
    });

    it('filters by equipment slot', () => {
        expect(resolveResearchRewardSlots([{ kind: 'equipmentUpgrade', slot: 'utility' }], {}, [ROCKS])).toEqual([]);
    });
});

describe('resolveResearchRewardSlots - stat (Training) slots', () => {
    const STAT_SLOT: ResearchRewardSlot = { tag: 'stat', random: true };
    const KNOWS_RESEARCH = { Research: { acquiredAt: 1 } };
    // Chip from lobby D2D556: Rocks + Earth Core, no Training research yet.
    const CHIP_EQUIPMENT = [ROCKS, CORE_ITEM_IDS.EarthCore];
    const CHIP_RESEARCH = {
        [WEAPONS_TREE_ID]: ['throw_rock'],
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
