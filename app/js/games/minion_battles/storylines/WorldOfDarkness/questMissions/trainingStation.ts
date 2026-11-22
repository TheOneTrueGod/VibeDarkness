/**
 * Training station — special story node, a sibling of the campsite. Skips battle and lets the player
 * pick several free Training upgrades in a row (one choice phrase per pick), each from the Training tree
 * at a set rank. Core-specific Training nodes only show up for characters with that core.
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import { NINJUTSU_DISABLED } from '../../../game/ninjutsu/ninjutsuConfig';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { castleMapPosition } from '../chapter3Map';
import { TerrainGrid, CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import { TRAINING_STATION_TIER, TRAINING_TREE_ID } from '../../../../../researchTrees/trees/training';
import {
    chapter3Scripts,
    TRAINING_STATION_INTRO_TEXT,
    TRAINING_STATION_OFFERS_PER_PICK,
    TRAINING_STATION_PICKS,
    trainingStationChoiceId,
} from '../../../../../storylines/worldOfDarkness/chapter3.script';
import type { PostMissionPhrase, PostMissionStoryDef, ResearchRewardSlot } from '../../storyTypes';

export { TRAINING_STATION_INTRO_TEXT, TRAINING_STATION_PICKS, trainingStationChoiceId };

/** How a Training station offers its upgrades. */
export interface TrainingStationConfig {
    /** Upgrades picked one after another (default {@link TRAINING_STATION_PICKS}). */
    picks?: number;
    /** Offers per pick, at most (default {@link TRAINING_STATION_OFFERS_PER_PICK}). */
    offersPerPick?: number;
    /** Rank of the Training nodes offered (default {@link TRAINING_STATION_TIER}). */
    tier?: number;
}

/** Random Training-tree slots at one rank; a slot with nothing left is dropped. */
export function trainingStationSlots(offers: number, tier: number): ResearchRewardSlot[] {
    return Array.from({ length: offers }, () => ({
        treeId: TRAINING_TREE_ID,
        random: true,
        omitWhenUnavailable: true,
        minTier: tier,
        maxTier: tier,
    }));
}

function createTerrain(): TerrainGrid {
    return TerrainGrid.createTerrainFromArray(1, 1, CELL_SIZE, [[TerrainType.Grass]], TerrainType.Grass);
}

function buildPostMissionStory(config: Required<TrainingStationConfig>): PostMissionStoryDef {
    const slots = trainingStationSlots(config.offersPerPick, config.tier);
    const picks: PostMissionPhrase[] = Array.from({ length: config.picks }, (_, i) => ({
        type: 'choice',
        choiceId: trainingStationChoiceId(i + 1),
        backgroundImage: STORY_BACKGROUNDS.campfire,
        options: [],
        researchRewardSlots: slots,
    }));
    return {
        phrases: [
            {
                type: 'dialogue',
                speakerId: '1',
                text: TRAINING_STATION_INTRO_TEXT,
                portraitSide: 'left',
                backgroundImage: STORY_BACKGROUNDS.campfire,
            },
            ...picks,
        ],
    };
}

export class TrainingStationMission extends BaseMissionDef {
    missionId: string;
    mapPosition: { x: number; y: number };
    name: string;
    description: string;

    postMissionStory: PostMissionStoryDef;

    /**
     * Each station needs its own `missionId` so results never collide. Its name and description come
     * from the chapter 3 script under that id.
     */
    constructor(missionId: string, mapPosition: { x: number; y: number }, config: TrainingStationConfig = {}) {
        super();
        this.missionId = missionId;
        this.mapPosition = mapPosition;
        const script = chapter3Scripts[missionId as keyof typeof chapter3Scripts];
        this.name = script?.name ?? 'Training';
        this.description = script?.description ?? '';
        this.postMissionStory = buildPostMissionStory({
            picks: config.picks ?? TRAINING_STATION_PICKS,
            offersPerPick: config.offersPerPick ?? TRAINING_STATION_OFFERS_PER_PICK,
            tier: config.tier ?? TRAINING_STATION_TIER,
        });
    }

    missionType = 'training' as const;
    campaignId = 'world_of_darkness';
    worldWidth = CELL_SIZE;
    worldHeight = CELL_SIZE;
    enemies = [];
    createTerrain = createTerrain;
    skipBattle = true;
    /** Only an upgrade screen: there is no loadout to prepare. */
    skipPrepareScreen = true;
    lightLevelEnabled = false;
    ninjutsuPools = { shadow: NINJUTSU_DISABLED };
}

/**
 * Chapter 3's first node, on the 59_50 east cave, before the Lonely Castle: two Training picks.
 * Keeps the id of the campsite it replaced so old saves' results still count. (Not `campsite_3`:
 * that id was a removed chapter 2 campsite and may sit in old saves.)
 */
export const TRAINING_CH3_MISSION_ID = 'campsite_ch3';

export const TRAINING_CH3 = new TrainingStationMission(TRAINING_CH3_MISSION_ID, castleMapPosition(59, 50));
