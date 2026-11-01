/**
 * 58_42 Dungeon Block - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * East-west corridor with cells north and south behind 1-wide doors; a 1-wide passage north to the
 * watch hall (narrow chokepoint).
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;

export const SEGMENT_58_42_DUNGEON_BLOCK: CastleSegment = {
    id: '58_42_dungeon_block',
    gridCol: 58,
    gridRow: 42,
    description: 'Deep cells for the most dangerous or most valuable prisoners, kept apart from the ordinary cells.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, D, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, D, R, R, R, R, R, R],
        [R, D, D, D, D, R, D, D, D, D, R, D, D, D, R, D, R, D, D, D, D, R],
        [R, D, D, D, D, R, D, D, D, D, R, D, D, D, R, D, R, D, D, D, D, R],
        [R, D, D, D, D, R, D, D, D, D, R, D, D, D, R, D, R, D, D, D, D, R],
        [R, D, D, D, D, R, D, D, D, D, R, D, D, D, R, D, R, D, D, D, D, R],
        [R, D, D, D, D, R, D, D, D, D, R, D, D, D, R, D, R, D, D, D, D, R],
        [R, D, D, D, D, R, D, D, D, D, R, D, D, D, R, D, R, D, D, D, D, R],
        [R, R, D, R, R, R, R, R, D, R, R, R, D, R, R, D, R, R, D, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, D, R, R, R, R, R, D, D, R, R, R, R, D, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, R, R, D, D, R, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, R, R, D, D, R, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, R, R, D, D, R, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, R, R, D, D, R, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, R, R, D, D, R, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, R, R, D, D, R, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, R, R, D, D, R, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Corridor.
        { id: '58_42_dungeon_corridor', label: 'Dungeon Corridor', col: 6, row: 10, type: 'patrol_point' },
        // North-west cell.
        { id: '58_42_dungeon_cell_west', label: 'West Cell', col: 2, row: 4, type: 'enemySpawn' },
        // North-east cell.
        { id: '58_42_dungeon_cell_east', label: 'East Cell', col: 18, row: 4, type: 'enemySpawn' },
        // South-east cell.
        { id: '58_42_dungeon_cell_south', label: 'South Cell', col: 16, row: 16, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '58_42_center', position: { kind: 'gridPoint', col: 6, row: 10 }, tags: ['castle'] }],
        edges: [
            ['59_42_center', '58_42_center'],
            ['58_43_center', '58_42_center'],
        ],
    },
};
