/**
 * The Bunker at the End. One chapter: last holdout, then swarm pressure.
 */

import type { MissionScript } from '../missionScript';

export const bunkerChapterScripts = {
    last_holdout: {
        name: 'The Last Holdout',
        description: 'The last shelter before the end. Defend it with everything you have — there is no retreat.',
    },
    swarm_pressure: {
        name: 'Swarm Pressure',
        description: 'Stress test: a narrowed bunker choke and a dense opening pack in the eastern spawn zone.',
    },
} satisfies Record<string, MissionScript>;
