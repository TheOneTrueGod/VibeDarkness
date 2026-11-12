/**
 * Quest copy of "Find some food" (light_empowered).
 * Separate missionId so campaign missionResults do not collide with the main-path clear.
 */

import { LightEmpoweredMission } from '../missions/003_light_empowered';
import { questScripts } from '../../../../../storylines/worldOfDarkness/quests.script';

export const QUEST_FIND_SOME_FOOD_MISSION_ID = 'quest_find_some_food';

export class QuestFindSomeFoodMission extends LightEmpoweredMission {
    override missionId = QUEST_FIND_SOME_FOOD_MISSION_ID;
    override name = questScripts.quest_find_some_food.name;
    override description = questScripts.quest_find_some_food.description;
    /** Not placed on the main Mission Map graph. */
    override mapPosition = undefined;
}

export const QUEST_FIND_SOME_FOOD = new QuestFindSomeFoodMission();
