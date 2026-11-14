/**
 * The Training Grounds - Chapter 3, optional. Through the courtyard's west door into the training
 * ring: from the sparring pit (60_48) north round the dummy track (60_47) to the archery green's
 * side, under the standard castle spawn cadence.
 *
 * The party starts just inside the west door at `60_48_entry_east` rather than in the courtyard:
 * the courtyard was cleared in The Castle Courtyard, and adding it would make an L-shaped block
 * with an empty 61_47 tile and the courtyard's spawn points.
 */

import { chapter3Scripts } from '../../../../../storylines/worldOfDarkness/chapter3.script';
import { SEGMENT_60_47_TRAINING_RING } from '../MapSegments/castle/60_47_training_ring';
import { SEGMENT_60_48_SPARRING_PIT } from '../MapSegments/castle/60_48_sparring_pit';
import { castlePoi, defineCastleMission } from './castle/castleMission';

export const TRAINING_GROUNDS_MISSION_ID = 'training_grounds';

const SCRIPT = chapter3Scripts.training_grounds;

export const TRAINING_GROUNDS = defineCastleMission({
    id: TRAINING_GROUNDS_MISSION_ID,
    name: SCRIPT.name,
    description: SCRIPT.description,
    preMissionStory: SCRIPT.preMissionStory,
    rooms: [SEGMENT_60_47_TRAINING_RING.id, SEGMENT_60_48_SPARRING_PIT.id],
    entry: castlePoi(SEGMENT_60_48_SPARRING_PIT, '60_48_entry_east'),
    exit: castlePoi(SEGMENT_60_47_TRAINING_RING, '60_47_exit_west'),
    exitLabel: SCRIPT.objectives.reach_exit,
    spawnPreset: 'castle_standard',
    isSideMission: true,
});
