/**
 * The Training Grounds - Chapter 3, optional; the Combos mission. After Kennels and Range: from where
 * the dummy track meets the archery green (60_47) round the training ring and down through the sparring
 * pit (60_48) to just inside the courtyard's west door, under the standard castle spawn cadence.
 *
 * It unlocks Combos: the battle start grants `Combos` knowledge (`startRewards`), the pre-mission story
 * grants Flurry (every weapon's basic ability gains Combo) to anyone without it, and the Combos tutorial
 * plays at the start of the fight (`TUTORIAL_COMBOS`).
 *
 * The party ends inside the west door rather than in the courtyard: the courtyard was cleared in The
 * Castle Courtyard, and adding it would make an L-shaped block with an empty 61_47 tile and the
 * courtyard's spawn points.
 */

import { KNOWLEDGE_COMBOS } from '../../../../../accountKnowledge';
import { NODE_KNIFE_COMBO, WEAPONS_TREE_ID } from '../../../../../researchTrees/trees/weaponTreeIds';
import { chapter3Scripts } from '../../../../../storylines/worldOfDarkness/chapter3.script';
import type { PreMissionStoryDef } from '../../storyTypes';
import { SEGMENT_60_47_TRAINING_RING } from '../MapSegments/castle/60_47_training_ring';
import { SEGMENT_60_48_SPARRING_PIT } from '../MapSegments/castle/60_48_sparring_pit';
import { castlePoi, defineCastleMission } from './castle/castleMission';

export const TRAINING_GROUNDS_MISSION_ID = 'training_grounds';

const SCRIPT = chapter3Scripts.training_grounds;

/** The script's narration, then a silent Flurry grant for every player who does not have it yet. */
const PRE_MISSION_STORY: PreMissionStoryDef = {
    phrases: [
        ...SCRIPT.preMissionStory.phrases,
        {
            type: 'grant_research_auto',
            treeId: WEAPONS_TREE_ID,
            nodeId: NODE_KNIFE_COMBO,
            skipIfResearched: [{ treeId: WEAPONS_TREE_ID, nodeIds: [NODE_KNIFE_COMBO] }],
        },
    ],
};

export const TRAINING_GROUNDS = defineCastleMission({
    id: TRAINING_GROUNDS_MISSION_ID,
    name: SCRIPT.name,
    description: SCRIPT.description,
    preMissionStory: PRE_MISSION_STORY,
    startRewards: { knowledgeKeys: [KNOWLEDGE_COMBOS] },
    rooms: [SEGMENT_60_47_TRAINING_RING.id, SEGMENT_60_48_SPARRING_PIT.id],
    entry: castlePoi(SEGMENT_60_47_TRAINING_RING, '60_47_entry_west'),
    exit: castlePoi(SEGMENT_60_48_SPARRING_PIT, '60_48_west_door'),
    exitLabel: SCRIPT.objectives.reach_exit,
    spawnPreset: 'castle_standard',
    isSideMission: true,
    // Reads as a Training node on the map: the mission where Combos unlock.
    mapNodeType: 'training',
});
