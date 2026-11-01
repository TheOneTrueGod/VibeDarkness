/**
 * 62_40 Portrait Gallery - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Long gallery inside the north wall with portrait pillars along both sides; dead end off the
 * north wall walk.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const D = TerrainType.Dirt;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const W = TerrainType.Water;

export const SEGMENT_62_40_PORTRAIT_GALLERY: CastleSegment = {
    id: '62_40_portrait_gallery',
    gridCol: 62,
    gridRow: 40,
    description: 'A long room hung with portraits of the ruling family, a display of lineage for important visitors.',
    terrain: [
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW],
        [W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W],
        [W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, D, D, D, R, D, D, D, R, D, D, D, R, D, D, D, D, D, D, R],
        [R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, D, D, D, D, D, R, D, D, D, R, D, D, D, R, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Gallery floor.
        { id: '62_40_portrait_gallery', label: 'Portrait Gallery', col: 12, row: 16, type: 'patrol_point' },
        // West end of the gallery.
        { id: '62_40_portrait_gallery_end', label: 'Gallery End', col: 4, row: 17, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '62_40_center', position: { kind: 'gridPoint', col: 12, row: 16 }, tags: ['castle'] }],
        edges: [
            ['63_40_center', '62_40_center'],
        ],
    },
};
