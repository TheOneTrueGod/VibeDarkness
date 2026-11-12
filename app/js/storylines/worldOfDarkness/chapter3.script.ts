/**
 * World of Darkness, chapter III — The Lonely Castle.
 */

import type { MissionScript } from '../missionScript';

export const chapter3Scripts = {
    the_lonely_castle: {
        name: 'The Lonely Castle',
        description:
            'A second way out of the cave leads east along an old road, toward a castle standing alone in the dark.',
        objectives: {
            reach_bridge: 'Explore the new cave exit',
        },
    },
    the_castle_courtyard: {
        name: 'The Castle Courtyard',
        description:
            'Past the moat bridge, the castle gate stands open. Something in the courtyard keeps the dark alive.',
        objectives: {
            destroy_spawners: 'Destroy the two swarmling spawners',
        },
    },
} satisfies Record<string, MissionScript>;
