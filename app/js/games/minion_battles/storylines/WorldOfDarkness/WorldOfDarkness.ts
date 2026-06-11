import type { StorylineDef } from '../types';

export const WorldOfDarknessStoryline: StorylineDef = {
    id: 'world_of_darkness',
    title: 'A World of Darkness',
    startMissionId: 'dark_awakening',
    edges: [
        { fromMissionId: 'dark_awakening', result: 'victory', toMissionId: 'towards_the_light' },
        { fromMissionId: 'towards_the_light', result: 'victory', toMissionId: 'light_empowered' },
        { fromMissionId: 'light_empowered', result: 'victory', toMissionId: 'cave_respite' },
        { fromMissionId: 'cave_respite', result: 'victory', toMissionId: 'crystal_corruption' },
        { fromMissionId: 'crystal_corruption', result: 'victory', toMissionId: 'monster' },
        { fromMissionId: 'monster', result: 'victory', toMissionId: 'core_awakening' },
        { fromMissionId: 'core_awakening', result: 'victory', toMissionId: 'ember_threshold' },
        { fromMissionId: 'ember_threshold', result: 'victory', toMissionId: 'thorn_march' },
        { fromMissionId: 'thorn_march', result: 'victory', toMissionId: 'thornling_rise' },
    ],
};
