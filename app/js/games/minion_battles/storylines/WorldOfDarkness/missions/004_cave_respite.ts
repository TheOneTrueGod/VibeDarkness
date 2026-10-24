/**
 * Cave Respite - Mission 4: Story-only beat after the hunt. Safe in the cave, sharing food;
 * choose how to spend your time (research reward from existing progress).
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import { WOD_CH1_MAP_X_COL2, WOD_CH1_MAP_Y_ROW1 } from '../chapter1Map';
import { NINJUTSU_DISABLED } from '../../../game/ninjutsu/ninjutsuConfig';
import { ITEMS } from '../../../character_defs/items';
import type { PostMissionChoiceResolveParams } from '../../types';
import type { PostMissionStoryDef, StoryChoiceAction, StoryChoiceOptionRow } from '../../storyTypes';
import { EARTH_TREE_ID, EARTH_NODE_EARTH_CORE } from '../../../../../researchTrees/trees/earth';
import {
    CHARGED_ROCKS_TREE_ID,
    CRYSTAL_SHIELD_TREE_ID,
    MACE_TREE_ID,
    MELEE_WEAPONS_TREE_ID,
    NODE_IRON_WRISTS,
    NODE_MORE_POWER,
    NODE_MORE_ROCK,
    NODE_STRENGTHENING_LIGHT,
    NODE_TRAINING_REGIME,
    THROWN_WEAPONS_TREE_ID,
    WEAPON_ITEM_CHARGED_ROCKS,
    WEAPON_ITEM_CHARGED_SHIELD,
    WEAPON_ITEM_CRYSTAL_SHIELD,
    WEAPON_ITEM_KNIVES,
    WEAPON_ITEM_MACE,
    WEAPON_ITEM_SWORD,
} from '../../../../../researchTrees/trees/weaponTreeIds';
import {
    TRAINING_TREE_ID,
    TRAINING_NODE_CHARGING_PUNCH,
    TRAINING_NODE_CORE,
    TRAINING_NODE_DOUBLE_PUNCH,
    TRAINING_NODE_SNEAKY_PUNCH,
    TRAINING_NODE_STRONG_PUNCH,
} from '../../../../../researchTrees/trees/training';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { TerrainGrid, CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';

/** Forage and salvage while the party rests in the alcove. */
export const CAVE_RESPITE_FOOD_REWARD = 3;
export const CAVE_RESPITE_METAL_REWARD = 5;
export const CAVE_RESPITE_CRYSTAL_REWARD = 2;

function createTerrain(): TerrainGrid {
    return TerrainGrid.createTerrainFromArray(1, 1, CELL_SIZE, [[TerrainType.Grass]], TerrainType.Grass);
}

function getCaveRespitePunchChoiceRows(equippedItemIds: readonly string[]): StoryChoiceOptionRow[] {
    const grantPunch = (nodeId: string): StoryChoiceAction => ({
        type: 'grant_research_to_player',
        treeId: TRAINING_TREE_ID,
        nodeId,
    });
    const rows: StoryChoiceOptionRow[] = [
        {
            id: TRAINING_NODE_CHARGING_PUNCH,
            label: 'Charging Punch',
            loreTitle: 'Crystal Rhythm',
            loreDescription:
                'The cave crystals answer a steady rhythm. Channel their stored light through your strike so each hit builds 1 Light Charge for your next move.',
            action: grantPunch(TRAINING_NODE_CHARGING_PUNCH),
        },
        {
            id: TRAINING_NODE_SNEAKY_PUNCH,
            label: 'Sneaky Punch',
            loreTitle: 'Strike the Opening',
            loreDescription:
                'You learned to wait for clean openings in wolf packs. Punch deals extra damage to stunned enemies.',
            action: grantPunch(TRAINING_NODE_SNEAKY_PUNCH),
        },
        {
            id: TRAINING_NODE_STRONG_PUNCH,
            label: 'Strong Punch',
            loreTitle: 'Brace and Hit',
            loreDescription:
                'Hunting in rough ground taught you to plant your feet and drive through. Punch stuns and knocks back enemies.',
            action: grantPunch(TRAINING_NODE_STRONG_PUNCH),
        },
        {
            id: TRAINING_NODE_DOUBLE_PUNCH,
            label: 'Double Punch',
            loreTitle: 'Two Quick Blows',
            loreDescription:
                'Fighting in tight cave paths trained fast follow-ups. Punch can target two enemies in sequence.',
            action: grantPunch(TRAINING_NODE_DOUBLE_PUNCH),
        },
    ];
    // Charging Punch feeds Throw Charged Rock; hide it unless Charged Rocks is equipped (mirrors the tree requirement).
    if (!equippedItemIds.includes(WEAPON_ITEM_CHARGED_ROCKS)) {
        return rows.filter((row) => row.id !== TRAINING_NODE_CHARGING_PUNCH);
    }
    return rows;
}

function getCaveRespiteResearchFallbackRows(): StoryChoiceOptionRow[] {
    return [
        {
            id: TRAINING_NODE_CORE,
            label: 'Core Training',
            loreTitle: 'The Still Ember',
            loreDescription:
                'No relic—only breath, stance, and the quiet refusal to break when the dark presses close.',
            action: {
                type: 'grant_research_to_player',
                treeId: TRAINING_TREE_ID,
                nodeId: TRAINING_NODE_CORE,
            },
        },
    ];
}

function getCaveRespiteResearchChoiceRows(equippedItemIds: readonly string[], playerId?: string): StoryChoiceOptionRow[] {
    const equipped = (itemId: string) => equippedItemIds.includes(itemId);
    const grant = (treeId: string, nodeId: string): StoryChoiceAction => ({
        type: 'grant_research_to_player',
        treeId,
        nodeId,
    });

    const chipRow: StoryChoiceOptionRow | null = (playerId === '9' || playerId === '1') ? {
        id: 'chip_bone_claws',
        label: 'A gift for you, Chip',
        loreTitle: 'A gift for you, Chip',
        loreDescription: 'Bone claws made from the skeleton of the boar',
        action: grant(EARTH_TREE_ID, EARTH_NODE_EARTH_CORE),
    } : null;
    const withChip = (rows: StoryChoiceOptionRow[]) => chipRow ? [chipRow, ...rows] : rows;

    if (equipped(WEAPON_ITEM_CRYSTAL_SHIELD)) {
        const chargedShield = ITEMS[WEAPON_ITEM_CHARGED_SHIELD];
        return withChip([
            {
                id: WEAPON_ITEM_CHARGED_SHIELD,
                label: chargedShield.name,
                loreTitle: 'Crystal Bolt',
                loreDescription:
                    "Lean into the shield's new geometry\u2014let a shard answer the dark at range.",
                action: { type: 'equip_item', itemId: WEAPON_ITEM_CHARGED_SHIELD },
            },
            {
                id: NODE_STRENGTHENING_LIGHT,
                label: 'Strengthening Light',
                loreTitle: 'Fortified Gleam',
                loreDescription: 'Weave the cave-light into your guard; each block carries a little healing onward.',
                action: grant(CRYSTAL_SHIELD_TREE_ID, NODE_STRENGTHENING_LIGHT),
            },
        ]);
    }

    if (equipped(WEAPON_ITEM_CHARGED_ROCKS)) {
        return withChip([
            {
                id: NODE_MORE_POWER,
                label: 'More Power',
                loreTitle: 'Heavier Impact',
                loreDescription: 'Practice putting the charged weight of a throw behind every impact.',
                action: grant(CHARGED_ROCKS_TREE_ID, NODE_MORE_POWER),
            },
            {
                id: NODE_MORE_ROCK,
                label: 'More Rock',
                loreTitle: 'Split Intent',
                loreDescription: 'Train your aim so one motion can threaten two threats.',
                action: grant(THROWN_WEAPONS_TREE_ID, NODE_MORE_ROCK),
            },
        ]);
    }

    if (equipped(WEAPON_ITEM_KNIVES)) {
        return withChip([
            {
                id: NODE_MORE_ROCK,
                label: 'More Rock',
                loreTitle: 'Second Line',
                loreDescription: 'Hone the follow-through so your knives can find another mark.',
                action: grant(THROWN_WEAPONS_TREE_ID, NODE_MORE_ROCK),
            },
        ]);
    }

    if (equipped(WEAPON_ITEM_SWORD)) {
        return withChip([
            {
                id: NODE_IRON_WRISTS,
                label: '+2 Swing Sword Uses',
                loreTitle: 'Endurance Edge',
                loreDescription: 'Oil the wrists and lungs\u2014squeeze two more full swings from the same stance.',
                action: grant(MELEE_WEAPONS_TREE_ID, NODE_IRON_WRISTS),
            },
        ]);
    }

    if (equipped(WEAPON_ITEM_MACE)) {
        return withChip([
            {
                id: NODE_TRAINING_REGIME,
                label: 'Training Regime',
                loreTitle: 'Heavy Habit',
                loreDescription: 'Drill the mace until its weight lands exactly where you mean it to.',
                action: grant(MACE_TREE_ID, NODE_TRAINING_REGIME),
            },
            {
                id: NODE_IRON_WRISTS,
                label: 'Iron Wrists',
                loreTitle: 'Endurance Edge',
                loreDescription: 'Oil the wrists and lungs\u2014squeeze more full swings from the same stance.',
                action: grant(MELEE_WEAPONS_TREE_ID, NODE_IRON_WRISTS),
            },
        ]);
    }

    return withChip(getCaveRespiteResearchFallbackRows());
}

const POST_MISSION_STORY: PostMissionStoryDef = {
    phrases: [
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'The cave holds you. Outside, the dark still hunts—but in here, by the faint light, you are safe for now.',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'You settle in and share another meal while it lasts. The quiet feels borrowed—enough room to sharpen body and gear alike.',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'choice',
            choiceId: 'cave_respite_punch_choice',
            options: [],
        },
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'Hands steadied, your thoughts turn to what you carry. What upgrade will serve you next?',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'choice',
            choiceId: 'cave_respite_research_choice',
            options: [],
        },
    ],
};

export class CaveRespiteMission extends BaseMissionDef {
    getPostMissionChoiceOptions(params: PostMissionChoiceResolveParams): StoryChoiceOptionRow[] | null {
        if (params.choiceId === 'cave_respite_punch_choice') {
            return getCaveRespitePunchChoiceRows(params.equippedItemIds);
        }
        if (params.choiceId === 'cave_respite_research_choice') {
            return getCaveRespiteResearchChoiceRows(params.equippedItemIds, params.playerId);
        }
        return null;
    }

    missionId = 'cave_respite';
    mapPosition = { x: WOD_CH1_MAP_X_COL2, y: WOD_CH1_MAP_Y_ROW1 };
    missionType = 'story' as const;
    description = 'A rare moment of rest in a hidden alcove. Choose wisely how to spend your time.';
    campaignId = 'world_of_darkness';
    name = 'Cave respite';
    completionRewards = {
        resourceDelta: {
            food: CAVE_RESPITE_FOOD_REWARD,
            metal: CAVE_RESPITE_METAL_REWARD,
            crystals: CAVE_RESPITE_CRYSTAL_REWARD,
        },
        unlockItemTiers: [{ slot: 'weapon' as const, tier: 3 }],
    };
    worldWidth = CELL_SIZE;
    worldHeight = CELL_SIZE;
    enemies = [];
    createTerrain = createTerrain;
    postMissionStory = POST_MISSION_STORY;
    skipBattle = true;
    lightLevelEnabled = false;
    ninjutsuPools = { shadow: NINJUTSU_DISABLED };
}

export const CAVE_RESPITE = new CaveRespiteMission();
