/**
 * 61_43 Royal Treasury - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Behind the throne: the treasure vault inside the north curtain wall, reached only by the 1-wide
 * secret door. North of the wall: moat and open grass.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const D = TerrainType.Dirt;
const G = TerrainType.Gravel;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const W = TerrainType.Water;

export const SEGMENT_61_43_ROYAL_TREASURY: CastleSegment = {
    id: '61_43_royal_treasury',
    gridCol: 61,
    gridRow: 43,
    description: "The strongroom for the crown's coin, regalia and most valuable deeds, kept behind the throne. Its secret door was known only to the ruler and a few trusted servants.",
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
        [R, R, R, R, R, R, R, R, R, R, G, G, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, G, G, G, G, G, G, G, G, G, G, G, G, R, R, R, R, R],
        [R, R, R, R, R, G, G, G, G, G, G, G, G, G, G, G, G, R, R, R, R, R],
        [R, R, R, R, R, G, G, R, D, D, D, D, D, G, R, G, G, R, R, R, R, R],
        [R, R, R, R, R, G, G, G, D, D, D, D, D, G, G, G, G, R, R, R, R, R],
        [R, R, R, R, R, G, G, G, D, D, D, D, D, G, G, G, G, R, R, R, R, R],
        [R, R, R, R, R, G, G, G, D, D, D, D, D, G, G, G, G, R, R, R, R, R],
        [R, R, R, R, R, G, G, G, D, D, D, D, D, G, G, G, G, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, R, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Back of the vault.
        { id: '61_43_royal_vault_treasure', label: 'Royal Treasure', col: 10, row: 14, type: 'generic' },
    ],
    network: {
        nodes: [{ id: '61_43_center', position: { kind: 'gridPoint', col: 10, row: 18 }, tags: ['castle'] }],
        edges: [
            ['61_44_center', '61_43_center'],
        ],
    },
};
