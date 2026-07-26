/**
 * Quest copy of "Find some food" (light_empowered).
 * Separate missionId so campaign missionResults do not collide with the main-path clear.
 */

import { LightEmpoweredMission } from '../missions/003_light_empowered';

export const QUEST_FIND_SOME_FOOD_MISSION_ID = 'quest_find_some_food';

export class QuestFindSomeFoodMission extends LightEmpoweredMission {
    override missionId = QUEST_FIND_SOME_FOOD_MISSION_ID;
    override name = 'Quest: Find some food';
    override description =
        'Quest variant of the plains hunt — forage and fight for food while the run is locked.';
    /** Not placed on the main Mission Map graph. */
    override mapPosition = undefined;
}

export const QUEST_FIND_SOME_FOOD = new QuestFindSomeFoodMission();
