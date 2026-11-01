/**
 * 64_45 Ossuary - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Catacomb of 2-wide passages with 1-cell burial niches, winding round a central bone chamber.
 * Connects the bell tower to the east wall walk.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;

export const SEGMENT_64_45_OSSUARY: CastleSegment = {
    id: '64_45_ossuary',
    gridCol: 64,
    gridRow: 45,
    description: 'A place where bones were moved once the graves were full, often stacked in patterns along the walls.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, D, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R],
        [R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R],
        [R, R, R, D, D, R, R, R, R, R, R, R, R, D, R, R, D, D, R, R, R, R],
        [R, R, R, D, D, D, R, D, D, D, D, D, D, D, R, R, D, D, D, R, R, R],
        [R, R, R, D, D, R, R, D, R, D, D, D, D, D, R, R, D, D, R, R, R, R],
        [R, R, R, D, D, R, R, D, D, D, D, D, R, D, R, R, D, D, R, R, R, R],
        [R, R, D, D, D, R, R, D, D, D, D, D, D, D, R, R, D, D, D, D, D, R],
        [R, R, R, D, D, R, R, R, R, R, D, R, R, R, R, R, D, D, D, D, D, D],
        [R, R, R, D, D, R, R, R, R, R, D, R, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R],
        [R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R],
        [R, R, R, R, R, R, R, D, R, R, D, D, R, R, D, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Lower passage.
        { id: '64_45_ossuary_passage', label: 'Ossuary Passage', col: 10, row: 13, type: 'patrol_point' },
        // Central bone chamber.
        { id: '64_45_ossuary_chamber', label: 'Bone Chamber', col: 10, row: 7, type: 'enemySpawn' },
        // West passage.
        { id: '64_45_ossuary_west', label: 'Ossuary West', col: 3, row: 8, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '64_45_center', position: { kind: 'gridPoint', col: 10, row: 13 }, tags: ['castle'] }],
        edges: [
            ['64_46_center', '64_45_center'],
        ],
    },
};
