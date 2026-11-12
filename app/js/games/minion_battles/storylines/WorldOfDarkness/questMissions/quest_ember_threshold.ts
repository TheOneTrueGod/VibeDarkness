/**
 * Quest copy of "Ember at the Threshold".
 * Separate missionId so campaign missionResults do not collide with a map clear.
 */

import { EmberThresholdMission } from '../missions/007_ember_threshold';
import { questScripts } from '../../../../../storylines/worldOfDarkness/quests.script';

export const QUEST_EMBER_THRESHOLD_MISSION_ID = 'quest_ember_threshold';

export class QuestEmberThresholdMission extends EmberThresholdMission {
    override missionId = QUEST_EMBER_THRESHOLD_MISSION_ID;
    override name = questScripts.quest_ember_threshold.name;
    override description = questScripts.quest_ember_threshold.description;
    /** Not placed on the main Mission Map graph. */
    override mapPosition = undefined;
}

export const QUEST_EMBER_THRESHOLD = new QuestEmberThresholdMission();
