/**
 * 60_48 Stables - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Central aisle between two rows of hay-strewn stalls; a water trough mid-aisle. Opens south to
 * the west guardhouse.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const T = TerrainType.ThickGrass;

export const SEGMENT_60_48_STABLES: CastleSegment = {
    id: '60_48_stables',
    gridCol: 60,
    gridRow: 48,
    description: "Stalls for the castle's horses, with feed, tack and grooms' quarters. Horses carried knights, messengers and supplies, so stables were kept well guarded.",
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, T, T, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, T, T, R],
        [R, T, T, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, T, T, R],
        [R, R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, T, T, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, T, T, R],
        [R, T, T, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, T, T, R],
        [R, R, R, R, R, R, D, D, D, SW, SW, SW, SW, D, D, D, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, T, T, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, T, T, R],
        [R, T, T, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, T, T, R],
        [R, R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [D, T, T, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, T, T, R],
        [R, T, T, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, T, T, R],
        [R, R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, T, T, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, T, T, R],
        [R, T, T, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, T, T, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Central aisle.
        { id: '60_48_stables_aisle', label: 'Stable Aisle', col: 10, row: 12, type: 'patrol_point' },
        // A west stall.
        { id: '60_48_stables_stall_west', label: 'West Stalls', col: 3, row: 10, type: 'enemySpawn' },
        // An east stall.
        { id: '60_48_stables_stall_east', label: 'East Stalls', col: 18, row: 10, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '60_48_center', position: { kind: 'gridPoint', col: 10, row: 12 }, tags: ['castle'] }],
        edges: [
            ['60_47_center', '60_48_center'],
        ],
    },
};
