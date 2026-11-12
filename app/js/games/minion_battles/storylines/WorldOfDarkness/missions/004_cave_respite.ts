/**
 * Cave Respite - Mission 4: Story-only beat after the hunt. Safe in the cave, sharing food;
 * choose which punch to train.
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import { WOD_CH1_MAP_X_COL2, WOD_CH1_MAP_Y_ROW1 } from '../chapter1Map';
import { NINJUTSU_DISABLED } from '../../../game/ninjutsu/ninjutsuConfig';
import type { PostMissionChoiceResolveParams } from '../../types';
import type { StoryChoiceOptionRow } from '../../storyTypes';
import { CAVE_RESPITE_PUNCH_CHOICES, chapter1Scripts } from '../../../../../storylines/worldOfDarkness/chapter1.script';
import {
    TRAINING_TREE_ID,
    TRAINING_NODE_CHARGING_PUNCH,
    TRAINING_NODE_DOUBLE_PUNCH,
    TRAINING_NODE_SNEAKY_PUNCH,
    TRAINING_NODE_STRONG_PUNCH,
} from '../../../../../researchTrees/trees/training';
import { WEAPON_ITEM_CHARGED_ROCKS } from '../../../../../researchTrees/trees/weaponTreeIds';
import { TerrainGrid, CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';

/** Forage and salvage while the party rests in the alcove. */
export const CAVE_RESPITE_VIGOR_REWARD = 3;
export const CAVE_RESPITE_METAL_REWARD = 5;
export const CAVE_RESPITE_ATTUNEMENT_REWARD = 2;

function createTerrain(): TerrainGrid {
    return TerrainGrid.createTerrainFromArray(1, 1, CELL_SIZE, [[TerrainType.Grass]], TerrainType.Grass);
}

function punchRow(nodeId: string): StoryChoiceOptionRow {
    const copy = CAVE_RESPITE_PUNCH_CHOICES[nodeId];
    return {
        id: nodeId,
        label: copy.label,
        loreTitle: copy.loreTitle,
        loreDescription: copy.loreDescription,
        action: {
            type: 'grant_research_to_player',
            treeId: TRAINING_TREE_ID,
            nodeId,
        },
    };
}

function getCaveRespitePunchChoiceRows(equippedItemIds: readonly string[]): StoryChoiceOptionRow[] {
    const rows: StoryChoiceOptionRow[] = [
        punchRow(TRAINING_NODE_CHARGING_PUNCH),
        punchRow(TRAINING_NODE_SNEAKY_PUNCH),
        punchRow(TRAINING_NODE_STRONG_PUNCH),
        punchRow(TRAINING_NODE_DOUBLE_PUNCH),
    ];
    // Charging Punch feeds Throw Charged Rock; hide it unless Charged Rocks is equipped (mirrors the tree requirement).
    if (!equippedItemIds.includes(WEAPON_ITEM_CHARGED_ROCKS)) {
        return rows.filter((row) => row.id !== TRAINING_NODE_CHARGING_PUNCH);
    }
    return rows;
}

const CAVE_RESPITE_SCRIPT = chapter1Scripts.cave_respite;

export class CaveRespiteMission extends BaseMissionDef {
    getPostMissionChoiceOptions(params: PostMissionChoiceResolveParams): StoryChoiceOptionRow[] | null {
        if (params.choiceId === 'cave_respite_punch_choice') {
            return getCaveRespitePunchChoiceRows(params.equippedItemIds);
        }
        return null;
    }

    missionId = 'cave_respite';
    mapPosition = { x: WOD_CH1_MAP_X_COL2, y: WOD_CH1_MAP_Y_ROW1 };
    missionType = 'story' as const;
    description = CAVE_RESPITE_SCRIPT.description;
    campaignId = 'world_of_darkness';
    name = CAVE_RESPITE_SCRIPT.name;
    completionRewards = {
        resourceDelta: {
            vigor: CAVE_RESPITE_VIGOR_REWARD,
            metal: CAVE_RESPITE_METAL_REWARD,
            attunement: CAVE_RESPITE_ATTUNEMENT_REWARD,
        },
    };
    worldWidth = CELL_SIZE;
    worldHeight = CELL_SIZE;
    enemies = [];
    createTerrain = createTerrain;
    postMissionStory = CAVE_RESPITE_SCRIPT.postMissionStory;
    skipBattle = true;
    lightLevelEnabled = false;
    ninjutsuPools = { shadow: NINJUTSU_DISABLED };
}

export const CAVE_RESPITE = new CaveRespiteMission();
