/**
 * Quest copy of "Ember at the Threshold".
 * Separate missionId so campaign missionResults do not collide with a map clear.
 */

import { EmberThresholdMission } from '../missions/007_ember_threshold';

export const QUEST_EMBER_THRESHOLD_MISSION_ID = 'quest_ember_threshold';

export class QuestEmberThresholdMission extends EmberThresholdMission {
    override missionId = QUEST_EMBER_THRESHOLD_MISSION_ID;
    override name = 'Quest: Ember at the Threshold';
    override description =
        'Quest variant of the lanternite threshold — follow the scouts while the run is locked.';
    /** Not placed on the main Mission Map graph. */
    override mapPosition = undefined;
}

export const QUEST_EMBER_THRESHOLD = new QuestEmberThresholdMission();
