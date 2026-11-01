/**
 * 60_43 Hall of Arms - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Upper west wing. A 5-wide corridor lined with suits of armour; a trophy room north (to the
 * officers' quarters) and a south room (to the armoury).
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;

export const SEGMENT_60_43_HALL_OF_ARMS: CastleSegment = {
    id: '60_43_hall_of_arms',
    gridCol: 60,
    gridRow: 43,
    description: "A hall displaying the household's coats of arms alongside captured weapons and armour, a record of past victories. It also served as a guard post on the way to the throne.",
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R],
        [R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R],
        [R, R, R, R, R, D, D, R, D, D, D, D, D, D, R, D, D, R, R, R, R, R],
        [R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R],
        [R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R],
        [R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, D, R, D, D, R, D, D, D, D, D, D, D, D, D, D, R, D, D, R, D, R],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, D, R, D, D, R, D, D, D, D, D, D, D, D, D, D, R, D, D, R, D, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R],
        [R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R],
        [R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R],
        [R, R, R, R, R, D, D, R, D, D, D, D, D, D, R, D, D, R, R, R, R, R],
        [R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R],
        [R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R],
        [R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Corridor centre.
        { id: '60_43_hall_of_arms', label: 'Hall of Arms', col: 10, row: 10, type: 'patrol_point' },
        // Trophy room.
        { id: '60_43_hall_of_arms_trophies', label: 'Trophy Room', col: 6, row: 4, type: 'enemySpawn' },
        // South room.
        { id: '60_43_hall_of_arms_south', label: 'South Room', col: 15, row: 18, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '60_43_center', position: { kind: 'gridPoint', col: 10, row: 10 }, tags: ['castle'] }],
        edges: [
            ['61_43_center', '60_43_center'],
            ['60_44_center', '60_43_center'],
        ],
    },
};
