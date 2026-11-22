import { describe, expect, it } from 'vitest';
import '../../../abilities/AbilityRegistry';
import { TRAINING_CH3, TRAINING_CH3_MISSION_ID, TRAINING_STATION_PICKS, trainingStationChoiceId } from './trainingStation';
import { MISSION_MAP } from '../../index';
import { overlayPendingResearchGrants, resolveResearchRewardSlots } from '../../researchRewardSlots';
import type { ChoicePhrase } from '../../storyTypes';
import { KNOWLEDGE_RESEARCH } from '../../../../../accountKnowledge';
import { CORE_ITEM_IDS } from '../../../character_defs/items';
import { getResearchNodeChromeTree, getResearchTree } from '../../../../../researchTrees/list';
import {
    BRIGHT_RESERVES_GATHER_LIGHT_ADD,
    BRIGHT_RESERVES_LIGHT_MAX_ADD,
    SPARE_CHARGE_MAX_ADD,
    STORED_STATIC_ADD,
    TRAINING_NODE_BRIGHT_RESERVES,
    TRAINING_NODE_EARTHEN_STRIDE,
    TRAINING_NODE_EMPOWER_PET,
    TRAINING_NODE_HEALTHY,
    TRAINING_NODE_MIGHTY,
    TRAINING_NODE_SPARE_CHARGE,
    TRAINING_NODE_STORED_STATIC,
    TRAINING_TREE_ID,
    trainingTree,
} from '../../../../../researchTrees/trees/training';
import { EARTH_TREE_ID, EARTH_NODE_EARTH_CORE } from '../../../../../researchTrees/trees/earth';
import { LIGHT_NODE_CORE, LIGHT_TREE_ID } from '../../../../../researchTrees/trees/light';
import { ARMORY_NODE_CORE, ARMORY_TREE_ID } from '../../../../../researchTrees/trees/armory';
import { STORM_NODE_CORE, STORM_TREE_ID } from '../../../../../researchTrees/trees/storm';
import {
    COMMAND_CORE_NODE_LOYAL_COMPANION,
    COMMAND_CORE_TREE_ID,
    commandCoreTree,
} from '../../../../../researchTrees/trees/command_core';
import { buildTinyBattleEngine, placePlayerFromLoadout, TINY_BATTLE_PLAYER_ID } from '../../../testing/harness/buildTinyBattleEngine';
import { LIGHT_STARTING_MAX } from '../../../resources/Light';
import { CHARGE_MAX } from '../../../resources/Charge';
import { STATIC_MAX, STATIC_MISSION_START } from '../../../resources/Static';
import { GATHER_LIGHT_ABILITY_ID } from '../../../card_defs/08_light_core/0804_GatherLight/0804Constants';
import { getGatherLightAmount, GATHER_LIGHT_AMOUNT } from '../../../card_defs/08_light_core/0804_GatherLight/0804Constants';

const KNOWLEDGE = { [KNOWLEDGE_RESEARCH]: true };

function choicePhrases(): ChoicePhrase[] {
    return TRAINING_CH3.postMissionStory.phrases.filter((p): p is ChoicePhrase => p.type === 'choice');
}

function offeredNodeIds(
    researchTrees: Record<string, string[]>,
    equipment: string[],
    seed = 'seed',
    researchNodeLevels = {},
): string[] {
    const slots = choicePhrases()[0].researchRewardSlots ?? [];
    return resolveResearchRewardSlots(slots, researchTrees, equipment, seed, {
        accountKnowledge: KNOWLEDGE,
        researchNodeLevels,
    }).map((row) => {
        const action = row.action as { treeId: string; nodeId: string };
        expect(action.treeId).toBe(TRAINING_TREE_ID);
        return action.nodeId;
    });
}

describe('Chapter 3 Training station', () => {
    it('replaces the opening campsite under the same mission id', () => {
        expect(MISSION_MAP[TRAINING_CH3_MISSION_ID]).toBe(TRAINING_CH3);
        expect(TRAINING_CH3.missionType).toBe('training');
        expect(TRAINING_CH3.name).toBe('Training');
        expect(TRAINING_CH3.skipBattle).toBe(true);
    });

    it('asks for two picks, each from rank 11 of the Training tree', () => {
        const picks = choicePhrases();
        expect(picks).toHaveLength(TRAINING_STATION_PICKS);
        expect(picks.map((p) => p.choiceId)).toEqual([trainingStationChoiceId(1), trainingStationChoiceId(2)]);
        for (const pick of picks) {
            for (const slot of pick.researchRewardSlots ?? []) {
                expect(slot).toMatchObject({ treeId: TRAINING_TREE_ID, random: true, minTier: 11, maxTier: 11 });
            }
        }
    });

    it('offers Healthy and Mighty to anyone, and only the equipped core\'s Training node', () => {
        const earth = offeredNodeIds({ [EARTH_TREE_ID]: [EARTH_NODE_EARTH_CORE] }, [CORE_ITEM_IDS.EarthCore]);
        expect(earth.sort()).toEqual([TRAINING_NODE_EARTHEN_STRIDE, TRAINING_NODE_HEALTHY, TRAINING_NODE_MIGHTY].sort());

        expect(offeredNodeIds({ [LIGHT_TREE_ID]: [LIGHT_NODE_CORE] }, [CORE_ITEM_IDS.LightCore])).toContain(TRAINING_NODE_BRIGHT_RESERVES);
        expect(offeredNodeIds({ [ARMORY_TREE_ID]: [ARMORY_NODE_CORE] }, [CORE_ITEM_IDS.ArmoryCore])).toContain(TRAINING_NODE_SPARE_CHARGE);
        expect(offeredNodeIds({ [STORM_TREE_ID]: [STORM_NODE_CORE] }, [CORE_ITEM_IDS.StormCore])).toContain(TRAINING_NODE_STORED_STATIC);
        expect(
            offeredNodeIds({ [COMMAND_CORE_TREE_ID]: [COMMAND_CORE_NODE_LOYAL_COMPANION] }, [CORE_ITEM_IDS.CommandCore]),
        ).toContain(TRAINING_NODE_EMPOWER_PET);
        expect(offeredNodeIds({}, [CORE_ITEM_IDS.BasicCore]).sort()).toEqual([TRAINING_NODE_HEALTHY, TRAINING_NODE_MIGHTY].sort());
    });

    it('does not re-offer the first pick before the server echoes it back', () => {
        const stored = { researchTrees: { [EARTH_TREE_ID]: [EARTH_NODE_EARTH_CORE] }, researchNodeLevels: {} };
        const research = overlayPendingResearchGrants(stored, stored, [
            { treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_EARTHEN_STRIDE },
        ]);
        expect(offeredNodeIds(research.researchTrees, [CORE_ITEM_IDS.EarthCore], 'seed', research.researchNodeLevels))
            .not.toContain(TRAINING_NODE_EARTHEN_STRIDE);
        // Once the server has applied it, the overlay does not add a second level.
        const echoed = overlayPendingResearchGrants(
            { researchTrees: { [TRAINING_TREE_ID]: [TRAINING_NODE_HEALTHY] }, researchNodeLevels: { [TRAINING_TREE_ID]: { [TRAINING_NODE_HEALTHY]: 1 } } },
            { researchTrees: {}, researchNodeLevels: {} },
            [{ treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_HEALTHY }],
        );
        expect(echoed.researchNodeLevels[TRAINING_TREE_ID]?.[TRAINING_NODE_HEALTHY]).toBe(1);
    });
});

describe('Core-specific Training nodes', () => {
    it('draw in their core tree\'s chrome but live in Training', () => {
        const expected: Record<string, string> = {
            [TRAINING_NODE_EARTHEN_STRIDE]: EARTH_TREE_ID,
            [TRAINING_NODE_EMPOWER_PET]: COMMAND_CORE_TREE_ID,
            [TRAINING_NODE_BRIGHT_RESERVES]: LIGHT_TREE_ID,
            [TRAINING_NODE_SPARE_CHARGE]: ARMORY_TREE_ID,
            [TRAINING_NODE_STORED_STATIC]: STORM_TREE_ID,
        };
        for (const [nodeId, treeId] of Object.entries(expected)) {
            const node = trainingTree.nodes.find((n) => n.id === nodeId)!;
            expect(getResearchNodeChromeTree(node, trainingTree)).toBe(getResearchTree(treeId));
        }
        expect(commandCoreTree.nodes.some((n) => n.id === TRAINING_NODE_EMPOWER_PET)).toBe(false);
    });

    function spawn(equipment: string[], researchTrees: Record<string, string[]>) {
        const engine = buildTinyBattleEngine({ gridW: 10, gridH: 10, localPlayerId: TINY_BATTLE_PLAYER_ID });
        return placePlayerFromLoadout(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            world: { x: 200, y: 200 },
            equipment,
            researchTrees,
        }).player;
    }

    it('Bright Reserves raises max Light and Gather Light\'s yield', () => {
        const player = spawn([CORE_ITEM_IDS.LightCore], {
            [LIGHT_TREE_ID]: [LIGHT_NODE_CORE],
            [TRAINING_TREE_ID]: [TRAINING_NODE_BRIGHT_RESERVES],
        });
        expect(player.getResource('light')?.max).toBe(LIGHT_STARTING_MAX + BRIGHT_RESERVES_LIGHT_MAX_ADD);
        expect(player.abilityModifiers[GATHER_LIGHT_ABILITY_ID]?.resourceGainFlat).toBe(BRIGHT_RESERVES_GATHER_LIGHT_ADD);
        expect(getGatherLightAmount(player)).toBe(GATHER_LIGHT_AMOUNT + BRIGHT_RESERVES_GATHER_LIGHT_ADD);
    });

    it('Spare Charge raises max Charge', () => {
        const player = spawn([CORE_ITEM_IDS.ArmoryCore], {
            [ARMORY_TREE_ID]: [ARMORY_NODE_CORE],
            [TRAINING_TREE_ID]: [TRAINING_NODE_SPARE_CHARGE],
        });
        expect(player.getResource('charge')?.max).toBe(CHARGE_MAX + SPARE_CHARGE_MAX_ADD);
    });

    it('Stored Static raises max and starting Static', () => {
        const player = spawn([CORE_ITEM_IDS.StormCore], {
            [STORM_TREE_ID]: [STORM_NODE_CORE],
            [TRAINING_TREE_ID]: [TRAINING_NODE_STORED_STATIC],
        });
        const staticRes = player.getResource('static');
        expect(staticRes?.max).toBe(STATIC_MAX + STORED_STATIC_ADD);
        expect(staticRes?.current).toBe(STATIC_MISSION_START + STORED_STATIC_ADD);
    });
});
