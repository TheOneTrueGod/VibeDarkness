/**
 * 60_44 Armoury - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Staggered weapon racks (1-wide rock) around a 4-wide central aisle between the training yard and
 * the hall of arms.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;

export const SEGMENT_60_44_ARMOURY: CastleSegment = {
    id: '60_44_armoury',
    gridCol: 60,
    gridRow: 44,
    description: "The locked store for the garrison's weapons and armour, issued by the armourer when the guard turned out or the castle came under attack.",
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, R, R, R, R, R, R, D, D, D, D, R, R, R, R, R, R, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, D, D, D, D, D, D, D, D, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, R, R, R, R, R, R, D, D, D, D, R, R, R, R, R, R, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, D, D, D, D, D, D, D, D, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Central aisle.
        { id: '60_44_armoury_aisle', label: 'Armoury Aisle', col: 10, row: 10, type: 'patrol_point' },
        // Between the west racks.
        { id: '60_44_armoury_racks_west', label: 'West Racks', col: 3, row: 6, type: 'enemySpawn' },
        // Between the east racks.
        { id: '60_44_armoury_racks_east', label: 'East Racks', col: 18, row: 14, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '60_44_center', position: { kind: 'gridPoint', col: 10, row: 10 }, tags: ['castle'] }],
        edges: [
            ['60_45_center', '60_44_center'],
            ['59_44_center', '60_44_center'],
        ],
    },
};
