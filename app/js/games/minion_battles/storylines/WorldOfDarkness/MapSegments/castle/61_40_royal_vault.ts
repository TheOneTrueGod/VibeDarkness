/**
 * 61_40 Royal Vault - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Behind the throne: a small treasure vault inside the north curtain wall, reached only by the
 * 1-wide secret door. North of the wall: moat and open grass.
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

export const SEGMENT_61_40_ROYAL_VAULT: CastleSegment = {
    id: '61_40_royal_vault',
    gridCol: 61,
    gridRow: 40,
    description: "A secret strongroom behind the throne for the crown's most valuable possessions, such as regalia, deeds and emergency gold. Only the ruler and a few trusted servants knew the way in.",
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
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R],
        [R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R],
        [R, R, R, R, R, D, D, R, D, D, D, D, D, D, R, D, D, R, R, R, R, R],
        [R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R],
        [R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R],
        [R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R],
        [R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, R, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Back of the vault.
        { id: '61_40_royal_vault_treasure', label: 'Royal Treasure', col: 10, row: 14, type: 'generic' },
    ],
    network: {
        nodes: [{ id: '61_40_center', position: { kind: 'gridPoint', col: 10, row: 18 }, tags: ['castle'] }],
        edges: [
            ['61_41_center', '61_40_center'],
        ],
    },
};
