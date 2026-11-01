/**
 * 58_47 Wine Cellar - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Rows of casks make 2-wide north-south lanes, crossed by an aisle through the middle. Narrow
 * lanes, short sight lines.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;

export const SEGMENT_58_47_WINE_CELLAR: CastleSegment = {
    id: '58_47_wine_cellar',
    gridCol: 58,
    gridRow: 47,
    description: 'A cool cellar for barrels of wine and ale. Drink was often safer than water, and the steward kept the cellar locked.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R],
        [R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R],
        [R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R],
        [R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R],
        [R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R],
        [R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R],
        [R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R],
        [D, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R],
        [R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R],
        [R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R],
        [R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Cross aisle.
        { id: '58_47_cellar_aisle', label: 'Cellar Aisle', col: 10, row: 10, type: 'patrol_point' },
        // Between the north casks.
        { id: '58_47_cellar_north_lanes', label: 'North Lanes', col: 4, row: 4, type: 'enemySpawn' },
        // Between the south casks.
        { id: '58_47_cellar_south_lanes', label: 'South Lanes', col: 16, row: 17, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '58_47_center', position: { kind: 'gridPoint', col: 10, row: 10 }, tags: ['castle'] }],
        edges: [
            ['59_47_center', '58_47_center'],
        ],
    },
};
