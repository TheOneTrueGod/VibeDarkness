/**
 * 65_46 East Breach - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * The east curtain wall has collapsed: a rubble-strewn breach and a shallow ford across the moat,
 * overgrown outside. Second way into the castle.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const D = TerrainType.Dirt;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const T = TerrainType.ThickGrass;
const W = TerrainType.Water;

export const SEGMENT_65_46_EAST_BREACH: CastleSegment = {
    id: '65_46_east_breach',
    gridCol: 65,
    gridRow: 46,
    description: 'A breach is a gap broken in a wall by siege engines or neglect. Here the curtain wall has collapsed, and the rubble lets attackers wade across the moat.',
    terrain: [
        [R, R, R, R, R, D, D, R, R, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, T, T, T, T, _, _, _],
        [R, R, R, R, R, D, D, D, D, D, D, D, W, W, SW, T, T, T, T, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, D, D, SW, SW, SW, T, T, T, T, _, _, _],
        [R, D, D, D, D, D, D, D, D, D, D, D, SW, SW, SW, T, T, T, T, _, _, _],
        [D, D, D, D, D, D, D, D, D, D, R, D, SW, SW, SW, T, T, T, T, _, _, _],
        [D, D, D, D, D, D, D, D, D, D, D, D, SW, SW, SW, T, T, T, T, _, _, _],
        [R, D, D, D, D, D, D, D, D, D, D, R, SW, SW, SW, T, T, T, T, _, _, _],
        [R, R, R, R, R, D, D, D, D, D, D, D, W, W, SW, T, T, T, T, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, T, T, T, T, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, R, R, R, R, R, W, W, SW, _, _, _, _, _, _, _],
    ],
    pointsOfInterest: [
        // In the breach.
        { id: '65_46_east_breach', label: 'Breach', col: 10, row: 9, type: 'generic' },
        // Shallow ford across the moat.
        { id: '65_46_east_breach_ford', label: 'Ford', col: 12, row: 10, type: 'generic' },
        // In the overgrowth outside the breach.
        { id: '65_46_east_breach_outside', label: 'Overgrowth', col: 17, row: 10, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '65_46_center', position: { kind: 'gridPoint', col: 6, row: 10 }, tags: ['castle'] }],
        edges: [
            ['64_46_center', '65_46_center'],
            ['65_45_center', '65_46_center'],
        ],
    },
};
