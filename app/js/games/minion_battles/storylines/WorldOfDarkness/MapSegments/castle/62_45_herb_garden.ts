/**
 * 62_45 Herb Garden - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * South-west quarter of the castle garden: rows of herb beds (thick grass) with gravel walks
 * between them. 2-wide door south to the chapel nave.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const D = TerrainType.Dirt;
const DW = TerrainType.DeepWater;
const G = TerrainType.Gravel;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const T = TerrainType.ThickGrass;
const W = TerrainType.Water;

export const SEGMENT_62_45_HERB_GARDEN: CastleSegment = {
    id: '62_45_herb_garden',
    gridCol: 62,
    gridRow: 45,
    description: 'A garden of medicinal and cooking herbs, supplying the infirmary and the kitchens.',
    terrain: [
        [R, _, T, T, T, _, _, _, _, D, D, _, _, SW, SW, W, W, W, W, DW, DW, DW],
        [R, _, T, T, T, _, _, _, _, D, D, _, _, SW, SW, W, W, W, W, DW, DW, DW],
        [R, _, _, T, _, _, _, _, _, D, D, _, _, SW, SW, SW, W, W, W, W, W, W],
        [R, _, _, _, _, _, _, _, _, _, D, D, _, _, SW, SW, W, W, W, W, W, W],
        [R, _, T, T, T, T, T, T, _, _, D, D, _, _, T, SW, SW, W, W, W, W, W],
        [R, _, T, T, T, T, T, T, _, _, D, D, D, _, T, SW, SW, SW, SW, W, W, W],
        [R, _, G, G, G, G, G, G, G, G, D, D, D, D, G, G, G, SW, SW, SW, SW, SW],
        [R, _, _, _, _, _, _, _, _, _, D, D, D, D, D, _, _, _, _, SW, SW, SW],
        [R, _, T, T, T, T, T, T, _, _, D, D, _, D, D, D, T, T, T, T, _, _],
        [R, _, T, T, T, T, T, T, _, _, D, D, _, _, D, D, D, D, D, T, _, _],
        [R, _, G, G, G, G, G, G, G, G, D, D, G, G, G, G, D, D, D, D, D, D],
        [R, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, D, D, D, D],
        [R, _, T, T, T, T, T, T, _, _, D, D, _, _, T, T, T, T, T, T, _, _],
        [R, _, T, T, T, T, T, T, _, _, D, D, _, _, T, T, T, T, T, T, _, _],
        [R, _, G, G, G, G, G, G, G, G, D, D, G, G, G, G, G, G, G, G, _, _],
        [R, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, _],
        [R, _, T, T, T, T, T, T, _, _, D, D, _, _, T, T, T, T, T, T, _, _],
        [R, _, T, T, T, T, T, T, _, _, D, D, _, _, T, T, T, T, T, T, _, _],
        [R, _, G, G, G, G, G, G, G, G, D, D, G, G, G, G, G, G, G, G, T, T],
        [R, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, T, T, T],
        [R, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, T, T],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // On the loop path round the pond.
        { id: '62_45_garden_loop_sw', label: 'Garden Loop (South-west)', col: 13, row: 8, type: 'patrol_point' },
        // On a gravel walk between the beds.
        { id: '62_45_herb_beds', label: 'Herb Beds', col: 4, row: 15, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '62_45_center', position: { kind: 'gridPoint', col: 13, row: 8 }, tags: ['castle'] }],
        edges: [],
    },
};
