/**
 * 60_47 Kitchens - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Hearth set into the west wall, four work tables, and a walled pantry in the north-east corner.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;

export const SEGMENT_60_47_KITCHENS: CastleSegment = {
    id: '60_47_kitchens',
    gridCol: 60,
    gridRow: 47,
    description: 'Where meals for the whole household were cooked over open hearths and in bread ovens. Kitchens were often kept apart from the halls because of fire, smoke and smell.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, D, D, D, D, R],
        [R, D, D, D, D, D, R, R, R, D, D, D, R, R, R, D, R, R, R, R, R, R],
        [R, R, R, D, D, D, R, R, R, D, D, D, R, R, R, D, D, D, D, D, D, R],
        [R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, D, D, D, R, R, R, D, D, D, D, R, R, R, D, D, D, D, D, R],
        [R, R, R, D, D, D, R, R, R, D, D, D, D, R, R, R, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Between the work tables.
        { id: '60_47_kitchens_center', label: 'Kitchens', col: 10, row: 10, type: 'patrol_point' },
        // In front of the hearth.
        { id: '60_47_kitchens_hearth', label: 'Kitchen Hearth', col: 3, row: 10, type: 'generic' },
        // Inside the pantry.
        { id: '60_47_kitchens_pantry', label: 'Pantry', col: 18, row: 3, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '60_47_center', position: { kind: 'gridPoint', col: 10, row: 10 }, tags: ['castle'] }],
        edges: [
            ['61_47_center', '60_47_center'],
            ['60_46_center', '60_47_center'],
        ],
    },
};
