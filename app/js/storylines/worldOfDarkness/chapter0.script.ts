/**
 * World of Darkness, chapter 0 — admin holding pen. Not a player-facing chapter.
 * Order matches `wod_ch0.missionIds`.
 */

import type { MissionScript } from '../missionScript';
import { STORY_BACKGROUNDS } from '../../games/minion_battles/assets/story';

export const chapter0Scripts = {
    thornbinder_arena: {
        name: 'Thornbinder Arena',
        description:
            'Bramble-weaving creatures hold a dirt circle east of the cave. Dark crystals mark the ring — more will come.',
        objectives: {
            survive_waves: 'Survive the arena waves',
            clear_arena: 'Defeat the remaining creatures',
        },
    },
    south_gate_swarm: {
        name: 'South Gate Swarm',
        description: 'Something has nested beyond the southern gate. Clear the opening pack and tear the nest down.',
        objectives: {
            destroy_nest: 'Destroy the swarm nest',
        },
        preMissionStory: {
            phrases: [
                {
                    type: 'dialogue',
                    speakerId: '1',
                    text: 'The cave mouth is no longer empty. Something has nested beyond the southern gate—and the pack outside is only the beginning.',
                    portraitSide: 'left',
                    backgroundImage: STORY_BACKGROUNDS.campfire,
                },
            ],
        },
        postMissionStory: {
            phrases: [
                {
                    type: 'dialogue',
                    speakerId: '1',
                    text: 'The nest collapses. South of the cave, the dark thins for a moment—but the road ahead still crawls.',
                    portraitSide: 'left',
                    backgroundImage: STORY_BACKGROUNDS.campfire,
                },
            ],
        },
    },
    crystal_corruption: {
        name: 'Crystal Corruption',
        description: 'The crystals pulse with dark energy. Purge the corruption before it spreads beyond the cave.',
        objectives: {
            survive: 'Survive the assault',
            eliminate: 'Kill the remaining enemies',
        },
        preMissionStory: {
            phrases: [
                {
                    type: 'dialogue',
                    speakerId: '1',
                    text: 'The howling outside the cave grows louder. They have found you.',
                    portraitSide: 'left',
                    backgroundImage: STORY_BACKGROUNDS.campfire,
                },
                {
                    type: 'dialogue',
                    speakerId: '1',
                    text: 'One by one the crystals flicker. The cave is no longer safe — only your hands can stop what comes next.',
                    portraitSide: 'left',
                    backgroundImage: STORY_BACKGROUNDS.campfire,
                },
            ],
        },
        postMissionStory: {
            phrases: [
                {
                    type: 'dialogue',
                    speakerId: '1',
                    text: 'The last of them falls. The cave stands — but the crystals are gone, and with them, the silence you once knew.',
                    portraitSide: 'left',
                    backgroundImage: STORY_BACKGROUNDS.campfire,
                },
                {
                    type: 'dialogue',
                    speakerId: '1',
                    text: 'Something worse is coming. You can feel it.',
                    portraitSide: 'left',
                    backgroundImage: STORY_BACKGROUNDS.campfire,
                },
            ],
        },
    },
    the_circle: {
        name: 'The Circle',
        description: 'A dirt circle in the grass. The cave you live in sits on its eastern edge.',
    },
    court_magician: {
        name: 'The Court Magician',
        description:
            'A robed figure waits in the circle, dark crystals turning slowly around him. They move when he moves his hands.',
        objectives: {
            defeat_court_magician: 'Defeat the Court Magician',
        },
    },
} satisfies Record<string, MissionScript>;
