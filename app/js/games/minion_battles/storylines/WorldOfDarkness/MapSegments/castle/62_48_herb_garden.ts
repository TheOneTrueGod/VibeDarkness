/**
 * 62_48 Herb Garden - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Grass garden with beds of herbs (Thick Grass) either side of a dirt path and a sundial.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const D = TerrainType.Dirt;
const R = TerrainType.Rock;
const T = TerrainType.ThickGrass;

export const SEGMENT_62_48_HERB_GARDEN: CastleSegment = {
    id: '62_48_herb_garden',
    gridCol: 62,
    gridRow: 48,
    description: 'A garden of medicinal and cooking herbs, supplying the infirmary and the kitchens.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, _, _, _, _, _, _, _, _, D, D, D, D, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, D, D, D, D, _, _, _, _, _, _, _, _, R],
        [R, _, T, T, T, T, T, T, T, D, D, D, D, T, T, T, T, T, T, T, _, R],
        [R, _, T, T, T, T, T, T, T, D, D, D, D, T, T, T, T, T, T, T, _, R],
        [R, _, _, _, _, _, _, _, _, D, D, D, D, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, D, D, D, D, _, _, _, _, _, _, _, _, R],
        [R, _, T, T, T, T, T, T, T, D, D, D, D, T, T, T, T, T, T, T, _, R],
        [R, _, T, T, T, T, T, T, T, D, D, D, D, T, T, T, T, T, T, T, _, R],
        [R, _, _, _, _, _, _, _, _, D, D, D, D, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, D, R, R, D, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, D, D, D, D, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, D, D, D, D, _, _, _, _, _, _, _, _, R],
        [R, _, T, T, T, T, T, T, T, D, D, D, D, T, T, T, T, T, T, T, _, R],
        [R, _, T, T, T, T, T, T, T, D, D, D, D, T, T, T, T, T, T, T, _, D],
        [R, _, _, _, _, _, _, _, _, D, D, D, D, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, D, D, D, D, _, _, _, _, _, _, _, _, R],
        [R, _, T, T, T, T, T, T, T, D, D, D, D, T, T, T, T, T, T, T, _, R],
        [R, _, T, T, T, T, T, T, T, D, D, D, D, T, T, T, T, T, T, T, _, R],
        [R, _, _, _, _, _, _, _, _, D, D, D, D, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, D, D, D, D, _, _, _, _, _, _, _, _, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // On the path.
        { id: '62_48_herb_garden', label: 'Herb Garden', col: 10, row: 12, type: 'patrol_point' },
        // West herb beds.
        { id: '62_48_herb_beds_west', label: 'West Beds', col: 4, row: 7, type: 'enemySpawn' },
        // East herb beds.
        { id: '62_48_herb_beds_east', label: 'East Beds', col: 16, row: 17, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '62_48_center', position: { kind: 'gridPoint', col: 10, row: 12 }, tags: ['castle'] }],
        edges: [
            ['62_47_center', '62_48_center'],
        ],
    },
};
