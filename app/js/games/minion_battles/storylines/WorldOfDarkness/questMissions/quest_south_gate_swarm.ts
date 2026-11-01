/**
 * Quest copy of "South Gate Swarm".
 * Separate missionId so campaign missionResults do not collide with the old main-path clear.
 */

import { SouthGateSwarmMission } from '../missions/006c_south_gate_swarm';

export const QUEST_SOUTH_GATE_SWARM_MISSION_ID = 'quest_south_gate_swarm';

export class QuestSouthGateSwarmMission extends SouthGateSwarmMission {
    override missionId = QUEST_SOUTH_GATE_SWARM_MISSION_ID;
    /** Not placed on the main Mission Map graph. */
    override mapPosition = undefined;
}

export const QUEST_SOUTH_GATE_SWARM = new QuestSouthGateSwarmMission();
