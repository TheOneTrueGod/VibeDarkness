/**
 * World of Darkness, chapter III — The Lonely Castle.
 *
 * Keys follow the chapter's `missionIds` (Mission Map order). The castle missions' copy is
 * placeholder until the chapter's story is written: see `// TODO(story)`.
 */

import type { MissionScript } from '../missionScript';
import type { PreMissionStoryDef } from '../../games/minion_battles/storylines/storyTypes';
import { STORY_BACKGROUNDS } from '../../games/minion_battles/assets/story';
import { chapter2Scripts } from './chapter2.script';

/** Every campsite shares one script (`CampsiteMission` reads chapter 2's). */
const campsiteScript = chapter2Scripts.campsite;

/** Upgrades picked, one after another, at a Training station (`TrainingStationMission`). */
export const TRAINING_STATION_PICKS = 2;
/** Offers shown per pick, at most (a slot with nothing left is dropped). */
export const TRAINING_STATION_OFFERS_PER_PICK = 4;
export const TRAINING_STATION_INTRO_TEXT = 'You have found an old training ground';
/** Choice id of the n-th pick (1-based): each pick is its own choice phrase. */
export function trainingStationChoiceId(pick: number): string {
    return `training_station_choice_${pick}`;
}

const trainingStationScript: MissionScript = {
    name: 'Training',
    description: `A place to drill. Pick ${TRAINING_STATION_PICKS} free Training upgrades, one after the other.`,
};

/** One narrator line before the battle. */
function preMissionLine(text: string): PreMissionStoryDef {
    return {
        phrases: [
            {
                type: 'dialogue',
                speakerId: '1',
                text,
                portraitSide: 'left',
                backgroundImage: STORY_BACKGROUNDS.campfire,
            },
        ],
    };
}

export const chapter3Scripts = {
    campsite_ch3: trainingStationScript,
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
    // TODO(story): placeholder copy for the castle's main path.
    castle_crossroads: {
        name: 'The Crossroads',
        description: 'Beyond the courtyard, old roads cross among the trees. The great hall stands to the north.',
        objectives: {
            reach_exit: 'Reach the great hall doors',
        },
        preMissionStory: preMissionLine('The courtyard is quiet now. North, past the trees, a lamp still burns in the great hall.'),
    },
    campsite_ch3_crossroads: campsiteScript,
    great_hall: {
        name: 'The Great Hall',
        description: 'The keep door opens on a long hall, and past it a bridge over a chasm.',
        objectives: {
            reach_exit: 'Cross the bridge to the throne room',
        },
        preMissionStory: preMissionLine('The great hall is set for a feast no one came to. Beyond it, a narrow bridge crosses the dark.'),
    },
    the_kings_court: {
        name: "The King's Court",
        description: 'Something waits on the throne at the end of the bridge.',
        objectives: {
            defeat_boss: 'Defeat the beast on the throne',
        },
        preMissionStory: preMissionLine('The throne room doors stand open. Something large is breathing in the dark.'),
    },
    // TODO(story): placeholder copy for the optional training branch.
    training_grounds: {
        name: 'The Training Grounds',
        description: "West of the courtyard, the castle's old training ring lies overgrown. Something moves among the practice dummies.",
        objectives: {
            reach_exit: 'Cross the training ring',
        },
        preMissionStory: preMissionLine('Through the west door the grass grows tall over a sparring pit and a ring of wooden dummies.'),
    },
    kennels_and_range: {
        name: 'Kennels and Range',
        description: 'Past the empty kennels, two old fire pits by the archery green could still hold a camp.',
        objectives: {
            reach_exit: 'Reach the fire pits by the archery green',
        },
        preMissionStory: preMissionLine('The kennels stand open and empty. Beyond them, by the archery targets, there are two fire pits.'),
    },
    campsite_ch3_training_a: campsiteScript,
    campsite_ch3_training_b: campsiteScript,
    // TODO(story): placeholder copy for the garden branch.
    overgrown_garden: {
        name: 'The Overgrown Garden',
        description: "East of the courtyard, the castle's gardens have run wild. Paths wind through the herb beds and the orchard.",
        objectives: {
            reach_exit: 'Cross the orchard to the conservatory',
        },
        preMissionStory: preMissionLine('Through the east door the herb beds have grown over the paths. Something rustles in the orchard.'),
    },
    garden_heart: {
        name: 'The Garden Heart',
        description: "Past the pond, in the queen's garden, something has made its den.",
        objectives: {
            defeat_boss: 'Defeat the beast in the garden',
        },
        preMissionStory: preMissionLine('The fountain still runs. Beyond it, among the hedges, something large is waiting.'),
    },
    // TODO(story): placeholder copy for the wizard tower branch.
    chapel_wing: {
        name: 'The Chapel Wing',
        description: 'East of the crossroads a chapel stands in its churchyard. Past it, the castle wall has fallen in.',
        objectives: {
            reach_exit: 'Reach the breach in the east wall',
        },
        preMissionStory: preMissionLine('The chapel doors hang open. Past the headstones, the east wall lies in rubble.'),
    },
    east_wall_walk: {
        name: 'The East Wall Walk',
        description: 'From the breach, the old wall walk winds north through guard rooms and galleries toward the tower.',
        objectives: {
            reach_exit: "Reach the wizard's tower door",
        },
        preMissionStory: preMissionLine('Stairs climb from the breach onto the wall. Far along it, a tower door glows faintly.'),
    },
    campsite_ch3_walls: campsiteScript,
    wizards_tower: {
        name: "The Wizard's Tower",
        description: 'The tower is quiet, but its rooms are not empty. Search them before going deeper.',
        objectives: {
            reach_crucible: 'Search the great crucible',
            reach_binding_circle: 'Find the binding circle',
            reach_great_circle: 'Reach the great summoning circle',
        },
        preMissionStory: preMissionLine('Inside the tower the air hums. Shelves, vats and circles of old stone fill the dark.'),
    },
    court_magician_tower: {
        name: 'The Court Magician',
        description: 'In the heart of the tower, the court magician waits in his summoning circle.',
        objectives: {
            defeat_court_magician: 'Defeat the court magician',
        },
        preMissionStory: preMissionLine('Crystals hang in the air over the great circle. In the middle of them, a figure turns to look.'),
    },
    // TODO(story): placeholder copy for the royal chambers branch.
    barracks_wing: {
        name: 'The Barracks Wing',
        description: 'West of the crossroads, the old barracks yard leads to the portcullis hall and the sally port.',
        objectives: {
            reach_exit: 'Reach the sally port',
        },
        preMissionStory: preMissionLine('The barracks lane runs west from the crossroads. Bunks and weapon racks stand empty in the yard.'),
    },
    west_wall_walk: {
        name: 'The West Wall Walk',
        description: 'From the sally port, the old wall walk winds north through guard rooms and galleries toward the royal chambers.',
        objectives: {
            reach_exit: 'Reach the royal chambers door',
        },
        preMissionStory: preMissionLine('Stairs climb from the sally port onto the wall. At the top, a door leads into the royal chambers.'),
    },
    royal_chambers: {
        name: 'The Royal Chambers',
        description: "Past the guard room, the king's own rooms lie dark. Search the bedroom and the baths.",
        objectives: {
            reach_exit: 'Reach the privy chamber door',
        },
        preMissionStory: preMissionLine('The master bedroom is cold and the bed is torn. Water drips somewhere in the baths below.'),
    },
    royal_bedchamber: {
        name: 'The Royal Bedchamber',
        description: 'Something has come back to the master bedroom.',
        objectives: {
            defeat_boss: 'Defeat the beast in the bedchamber',
        },
        preMissionStory: preMissionLine('A low growl comes from the bedchamber. Whatever tore the bed has come home.'),
    },
} satisfies Record<string, MissionScript>;
