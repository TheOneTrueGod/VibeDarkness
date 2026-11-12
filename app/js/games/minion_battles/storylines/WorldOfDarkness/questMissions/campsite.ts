/**
 * Campsite — special story node. Skips battle, recovers Hunger, and offers up to six random free
 * core research picks. Weapon and stat research is not offered here.
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import { NINJUTSU_DISABLED } from '../../../game/ninjutsu/ninjutsuConfig';
import {
    WOD_CH2_MAP_X_COL1,
    WOD_CH2_MAP_X_COL2,
    WOD_CH2_MAP_Y_ROW0,
    WOD_CH2_MAP_Y_ROW1,
} from '../chapter2Map';
import { TerrainGrid, CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import {
    CAMPSITE_CHOICE_ID,
    CAMPSITE_CORE_PICKS,
    CAMPSITE_HUNGER_RECOVERY,
    CAMPSITE_INTRO_TEXT,
    CAMPSITE_RESEARCH_OPTION_COUNT,
    CAMPSITE_RESEARCH_SLOTS,
    chapter2Scripts,
} from '../../../../../storylines/worldOfDarkness/chapter2.script';

export {
    CAMPSITE_CHOICE_ID,
    CAMPSITE_CORE_PICKS,
    CAMPSITE_HUNGER_RECOVERY,
    CAMPSITE_INTRO_TEXT,
    CAMPSITE_RESEARCH_OPTION_COUNT,
    CAMPSITE_RESEARCH_SLOTS,
};

/** Campsite between Surface Quests 2 and 3. */
export const CAMPSITE_MISSION_ID = 'campsite';
/** Campsite between Surface Quests 3 and Displacer. */
export const CAMPSITE_2_MISSION_ID = 'campsite_2';

const CAMPSITE_SCRIPT = chapter2Scripts.campsite;

function createTerrain(): TerrainGrid {
    return TerrainGrid.createTerrainFromArray(1, 1, CELL_SIZE, [[TerrainType.Grass]], TerrainType.Grass);
}

export class CampsiteMission extends BaseMissionDef {
    missionId: string;
    mapPosition: { x: number; y: number };

    /** Each campsite needs its own `missionId` so their results never collide. */
    constructor(missionId: string, mapPosition: { x: number; y: number }) {
        super();
        this.missionId = missionId;
        this.mapPosition = mapPosition;
    }

    missionType = 'campsite' as const;
    description = CAMPSITE_SCRIPT.description;
    campaignId = 'world_of_darkness';
    name = CAMPSITE_SCRIPT.name;
    worldWidth = CELL_SIZE;
    worldHeight = CELL_SIZE;
    enemies = [];
    createTerrain = createTerrain;
    postMissionStory = CAMPSITE_SCRIPT.postMissionStory;
    skipBattle = true;
    /** A campsite is only an upgrade screen: there is no loadout to prepare. */
    skipPrepareScreen = true;
    lightLevelEnabled = false;
    ninjutsuPools = { shadow: NINJUTSU_DISABLED };
}

/** Chapter 2 row 0 col 2, between Surface Quests 2 and 3. */
export const CAMPSITE = new CampsiteMission(CAMPSITE_MISSION_ID, {
    x: WOD_CH2_MAP_X_COL2,
    y: WOD_CH2_MAP_Y_ROW0,
});

/** Chapter 2 row 1 col 1, between Surface Quests 3 and Displacer. */
export const CAMPSITE_2 = new CampsiteMission(CAMPSITE_2_MISSION_ID, {
    x: WOD_CH2_MAP_X_COL1,
    y: WOD_CH2_MAP_Y_ROW1,
});
