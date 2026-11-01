/**
 * 61_46 Hall of Banners - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Lower crossroads: the walkway meets the lower wings (barracks west, chapel east). Four 3x3
 * pillar clusters in the corners and four banner posts frame an open centre.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;

export const SEGMENT_61_46_HALL_OF_BANNERS: CastleSegment = {
    id: '61_46_hall_of_banners',
    gridCol: 61,
    gridRow: 46,
    description: 'A hall hung with the banners of the ruling house and its sworn allies. It was used for musters and ceremonies, and links the barracks wing to the chapel wing.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, D, D, D, D, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, D, R],
        [R, D, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, D, R],
        [R, D, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, D, R],
        [R, D, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, D, R],
        [R, D, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, D, D, D, D, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // The lower crossroads.
        { id: '61_46_banners_center', label: 'Banners Center', col: 10, row: 10, type: 'patrol_point' },
        // Behind the north-west pillar cluster.
        { id: '61_46_banners_northwest', label: 'Banners Northwest', col: 3, row: 6, type: 'enemySpawn' },
        // Behind the south-east pillar cluster.
        { id: '61_46_banners_southeast', label: 'Banners Southeast', col: 18, row: 15, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '61_46_center', position: { kind: 'gridPoint', col: 10, row: 10 }, tags: ['castle'] }],
        edges: [
            ['61_47_center', '61_46_center'],
        ],
    },
};
