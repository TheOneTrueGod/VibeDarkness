/**
 * 62_43 Hall of Mirrors - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Upper east wing. A 5-wide corridor with mirror panels staggered along both sides, and two
 * galleries north and south with more panels.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;

export const SEGMENT_62_43_HALL_OF_MIRRORS: CastleSegment = {
    id: '62_43_hall_of_mirrors',
    gridCol: 62,
    gridRow: 43,
    description: 'A gallery lined with mirrors, a costly display of wealth used for receptions. The mirrors multiplied the candlelight across the room.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R],
        [R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R],
        [R, R, R, R, D, D, R, D, D, D, D, D, D, D, D, R, D, D, R, R, R, R],
        [R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R],
        [R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, R, R, D, D, D, D, D, D, D, D, R, R, D, D, D, D, D, D, R],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, D, D, D, D, D, D, R, R, D, D, D, D, D, D, D, D, R, R, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R],
        [R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R],
        [R, R, R, R, D, D, D, D, R, D, D, D, D, R, D, D, D, D, R, R, R, R],
        [R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R],
        [R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Corridor centre.
        { id: '62_43_hall_of_mirrors', label: 'Hall of Mirrors', col: 10, row: 10, type: 'patrol_point' },
        // North gallery.
        { id: '62_43_mirrors_north', label: 'North Gallery', col: 5, row: 3, type: 'enemySpawn' },
        // South gallery.
        { id: '62_43_mirrors_south', label: 'South Gallery', col: 16, row: 18, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '62_43_center', position: { kind: 'gridPoint', col: 10, row: 10 }, tags: ['castle'] }],
        edges: [
            ['61_43_center', '62_43_center'],
            ['62_44_center', '62_43_center'],
        ],
    },
};
