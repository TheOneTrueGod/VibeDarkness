/**
 * 60_40 Treasury - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * An antechamber and a vault of treasure chests inside the north wall; dead end off the north wall
 * walk.
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

export const SEGMENT_60_40_TREASURY: CastleSegment = {
    id: '60_40_treasury',
    gridCol: 60,
    gridRow: 40,
    description: "The strongroom for the realm's coin, silver plate and tax takings, kept by the treasurer under heavy guard.",
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
        [R, R, R, R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, D, D, D, D, R, D, D, R, R],
        [R, D, D, D, D, D, D, R, D, D, R, D, D, D, D, D, D, D, D, D, R, R],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, D, D, R, D, D, D, D, R, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
        [R, R, R, R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Antechamber.
        { id: '60_40_treasury_antechamber', label: 'Treasury Antechamber', col: 4, row: 16, type: 'patrol_point' },
        // Vault floor.
        { id: '60_40_treasury_vault', label: 'Treasury Vault', col: 14, row: 16, type: 'generic' },
    ],
    network: {
        nodes: [{ id: '60_40_center', position: { kind: 'gridPoint', col: 4, row: 16 }, tags: ['castle'] }],
        edges: [
            ['59_40_center', '60_40_center'],
        ],
    },
};
