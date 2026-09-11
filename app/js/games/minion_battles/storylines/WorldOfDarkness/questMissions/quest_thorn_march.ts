/**
 * Quest copy of "Thorn March".
 * Separate missionId so campaign missionResults do not collide with a map clear.
 */

import { ThornMarchMission } from '../missions/008_thorn_march';

export const QUEST_THORN_MARCH_MISSION_ID = 'quest_thorn_march';

export class QuestThornMarchMission extends ThornMarchMission {
    override missionId = QUEST_THORN_MARCH_MISSION_ID;
    override name = 'Quest: Thorn March';
    override description =
        'Quest variant of the thornwood march — hold the lanternite nests as a step in a locked run.';
    /** Not placed on the main Mission Map graph. */
    override mapPosition = undefined;
}

export const QUEST_THORN_MARCH = new QuestThornMarchMission();
