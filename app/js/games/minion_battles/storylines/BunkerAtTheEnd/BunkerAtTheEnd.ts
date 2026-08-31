/**
 * Storyline: The Bunker at the End
 * Starts with last_holdout mission, then swarm_pressure.
 */

import type { StorylineDef } from '../types';

export const BunkerAtTheEndStoryline: StorylineDef = {
    id: 'bunker_at_the_end',
    title: 'The Bunker at the End',
    startMissionId: 'last_holdout',
    edges: [
        { fromMissionId: 'last_holdout', result: 'victory', toMissionId: 'swarm_pressure' },
    ],
    chapters: [
        { id: 'bunker_ch1', numeral: 'I', missionIds: ['last_holdout', 'swarm_pressure'] },
    ],
};
