/**
 * Quest copy of "Crystal Corruption".
 * Separate missionId so campaign missionResults do not collide with the side-mission clear.
 */

import { CrystalCorruptionMission } from '../missions/004b_crystal_corruption';

export const QUEST_CRYSTAL_CORRUPTION_MISSION_ID = 'quest_crystal_corruption';

export class QuestCrystalCorruptionMission extends CrystalCorruptionMission {
    override missionId = QUEST_CRYSTAL_CORRUPTION_MISSION_ID;
    override name = 'Quest: Crystal Corruption';
    override description =
        'Quest variant of the cave assault — purge corruption as a step in a locked run.';
    /** Not placed on the main Mission Map graph. */
    override mapPosition = undefined;
}

export const QUEST_CRYSTAL_CORRUPTION = new QuestCrystalCorruptionMission();
