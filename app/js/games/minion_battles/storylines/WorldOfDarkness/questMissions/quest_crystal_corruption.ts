/**
 * Quest copy of "Crystal Corruption", reversed: every cave crystal starts corrupted and one
 * recovers each round. Separate missionId so campaign missionResults do not collide with the
 * side-mission clear.
 */

import type { LevelEvent, SpecialTilePlacement } from '../../types';
import { darkCrystalSpecialTilesAt } from '../MapSegments/50_50_crystal_cave';
import { QUEST_CRYSTAL_RECOVERY_LINES, questScripts } from '../../../../../storylines/worldOfDarkness/quests.script';
import {
    CrystalCorruptionMission,
    CRYSTAL_CORRUPTION_CAMPFIRE,
    CRYSTAL_CORRUPTION_CAVE_COL,
    CRYSTAL_CORRUPTION_COMBAT_EVENTS,
    RESTORED_CRYSTAL_REPLACEMENT,
    crystalConversionEvents,
} from '../missions/004b_crystal_corruption';

export const QUEST_CRYSTAL_CORRUPTION_MISSION_ID = 'quest_crystal_corruption';

const SPECIAL_TILES: SpecialTilePlacement[] = [
    CRYSTAL_CORRUPTION_CAMPFIRE,
    ...darkCrystalSpecialTilesAt(CRYSTAL_CORRUPTION_CAVE_COL),
];

const LEVEL_EVENTS: LevelEvent[] = [
    ...CRYSTAL_CORRUPTION_COMBAT_EVENTS,
    ...crystalConversionEvents('Crystal', RESTORED_CRYSTAL_REPLACEMENT, [...QUEST_CRYSTAL_RECOVERY_LINES]),
];

const QUEST_CRYSTAL_SCRIPT = questScripts.quest_crystal_corruption;

export class QuestCrystalCorruptionMission extends CrystalCorruptionMission {
    override missionId = QUEST_CRYSTAL_CORRUPTION_MISSION_ID;
    override name = QUEST_CRYSTAL_SCRIPT.name;
    override description = QUEST_CRYSTAL_SCRIPT.description;
    /** Not placed on the main Mission Map graph. */
    override mapPosition = undefined;
    /** Quest runs stay playable even though the campaign map copy is disabled. */
    override disabled = false;
    override specialTiles = SPECIAL_TILES;
    override levelEvents = LEVEL_EVENTS;
    override preMissionStory = QUEST_CRYSTAL_SCRIPT.preMissionStory;
    override postMissionStory = QUEST_CRYSTAL_SCRIPT.postMissionStory;
}

export const QUEST_CRYSTAL_CORRUPTION = new QuestCrystalCorruptionMission();
