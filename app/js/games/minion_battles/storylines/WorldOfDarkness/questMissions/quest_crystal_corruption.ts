/**
 * Quest copy of "Crystal Corruption", reversed: every cave crystal starts corrupted and one
 * recovers each round. Separate missionId so campaign missionResults do not collide with the
 * side-mission clear.
 */

import type { LevelEvent, SpecialTilePlacement } from '../../types';
import type { PreMissionStoryDef, PostMissionStoryDef } from '../../storyTypes';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { darkCrystalSpecialTilesAt } from '../MapSegments/50_50_crystal_cave';
import {
    CrystalCorruptionMission,
    CRYSTAL_CORRUPTION_CAMPFIRE,
    CRYSTAL_CORRUPTION_CAVE_COL,
    CRYSTAL_CORRUPTION_COMBAT_EVENTS,
    RESTORED_CRYSTAL_REPLACEMENT,
    crystalConversionEvents,
} from '../missions/004b_crystal_corruption';

export const QUEST_CRYSTAL_CORRUPTION_MISSION_ID = 'quest_crystal_corruption';

const SPECIAL_TILES: SpecialTilePlacement[] = [
    CRYSTAL_CORRUPTION_CAMPFIRE,
    ...darkCrystalSpecialTilesAt(CRYSTAL_CORRUPTION_CAVE_COL),
];

const LEVEL_EVENTS: LevelEvent[] = [
    ...CRYSTAL_CORRUPTION_COMBAT_EVENTS,
    ...crystalConversionEvents('Crystal', RESTORED_CRYSTAL_REPLACEMENT, [
        'A crystal flickers back to life.',
        'Another crystal sheds its corruption.',
        'The cave grows brighter.',
        'The protection is returning.',
        'The last crystal shines again. Kill the remaining enemies!',
    ]),
];

const PRE_MISSION_STORY: PreMissionStoryDef = {
    phrases: [
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'You return to the cave to find every crystal dark, pulsing with corruption. The howling is close behind you.',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'Deep inside, a faint light still stirs. Hold the cave long enough, and the crystals may recover.',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
    ],
};

const POST_MISSION_STORY: PostMissionStoryDef = {
    phrases: [
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'The last of them falls. Around you, the crystals glow clean and bright once more.',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
    ],
};

export class QuestCrystalCorruptionMission extends CrystalCorruptionMission {
    override missionId = QUEST_CRYSTAL_CORRUPTION_MISSION_ID;
    override name = 'Quest: Crystal Corruption';
    override description =
        'The cave crystals have turned dark. Hold the cave while they recover, one by one.';
    /** Not placed on the main Mission Map graph. */
    override mapPosition = undefined;
    /** Quest runs stay playable even though the campaign map copy is disabled. */
    override disabled = false;
    override specialTiles = SPECIAL_TILES;
    override levelEvents = LEVEL_EVENTS;
    override preMissionStory = PRE_MISSION_STORY;
    override postMissionStory = POST_MISSION_STORY;
}

export const QUEST_CRYSTAL_CORRUPTION = new QuestCrystalCorruptionMission();
