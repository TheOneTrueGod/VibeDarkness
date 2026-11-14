/**
 * 63_45 Summoning Circle - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * South-east room of the wizard's tower, and the boss-sized arena at its heart: the great
 * summoning circle (eight pillars, a shallow ritual groove, a grass heart) is centred where the
 * four rooms meet; its eight pillars are natural standing stones (Rock). A small binding circle
 * in the corner feeds a ley line. No door to the wall walk.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const B = TerrainType.Brick;
const D = TerrainType.Dirt;
const G = TerrainType.Gravel;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;

export const SEGMENT_63_45_SUMMONING_CIRCLE: CastleSegment = {
    id: '63_45_summoning_circle',
    gridCol: 63,
    gridRow: 45,
    description: 'A ritual chamber with a circle inscribed on the floor, where sorcerers called up spirits or creatures and bound them to service.',
    terrain: [
        [_, _, D, D, SW, D, D, G, G, G, D, G, G, G, G, G, G, G, G, G, G, B],
        [_, _, D, D, SW, D, D, G, G, G, D, G, G, G, G, G, G, G, G, G, G, B],
        [D, D, D, D, SW, D, D, R, R, G, D, G, G, G, G, G, G, G, G, B, G, B],
        [D, D, D, SW, D, D, D, R, R, D, D, G, G, G, G, G, G, G, G, B, G, B],
        [SW, SW, SW, D, SW, D, G, G, G, D, D, G, G, G, G, G, G, G, G, B, G, B],
        [D, D, D, D, D, SW, G, G, D, D, D, D, G, G, G, G, G, G, G, B, G, B],
        [D, D, D, D, G, G, SW, G, D, G, G, D, D, G, G, G, G, G, G, B, G, B],
        [G, G, R, R, G, G, G, SW, D, G, G, G, D, D, G, G, G, G, G, G, G, B],
        [G, G, R, R, G, D, D, D, SW, G, G, G, G, D, D, D, G, G, G, G, G, B],
        [G, G, G, D, D, D, G, G, G, SW, G, G, G, G, G, D, D, G, G, G, G, B],
        [D, D, D, D, D, G, G, G, G, G, SW, G, G, G, G, G, D, D, G, G, G, B],
        [G, G, G, G, D, D, G, G, G, G, G, SW, G, G, G, G, G, D, D, G, G, B],
        [G, G, G, G, G, D, D, G, G, G, G, G, SW, G, G, B, G, G, G, G, G, B],
        [G, G, G, G, G, G, D, G, G, G, G, G, G, SW, SW, SW, SW, G, G, G, G, B],
        [G, G, G, G, G, G, D, D, G, G, G, G, G, SW, SW, G, G, SW, G, G, G, B],
        [G, G, G, G, G, G, G, D, D, G, G, G, B, SW, G, _, G, SW, B, G, G, B],
        [G, G, G, G, G, G, G, G, D, D, G, G, G, SW, G, G, G, SW, G, G, G, B],
        [G, G, G, G, G, G, G, G, G, D, G, G, G, G, SW, SW, SW, G, G, G, G, B],
        [G, G, G, G, G, G, G, G, G, D, D, G, G, G, G, B, G, G, G, G, G, B],
        [G, G, B, B, B, B, B, G, G, G, D, G, G, G, G, G, G, G, G, G, G, B],
        [G, G, G, G, G, G, G, G, G, G, D, G, G, G, G, G, G, G, G, G, G, B],
        [B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B],
    ],
    pointsOfInterest: [
        // On the loop path round the summoning circle.
        { id: '63_45_arcane_loop_se', label: 'Arcane Loop (South-east)', col: 6, row: 8, type: 'patrol_point' },
        // Inside the ritual groove of the great summoning circle.
        { id: '63_45_great_circle', label: 'Great Circle', col: 2, row: 2, type: 'generic', tags: ['boss', 'explore'] },
        // Between the groove and the pillars.
        { id: '63_45_great_circle_rim', label: 'Great Circle Rim', col: 5, row: 3, type: 'enemySpawn' },
        // Heart of the small binding circle.
        { id: '63_45_binding_circle', label: 'Binding Circle', col: 15, row: 15, type: 'generic', tags: ['explore'] },
    ],
    network: {
        nodes: [{ id: '63_45_center', position: { kind: 'gridPoint', col: 6, row: 8 }, tags: ['castle'] }],
        edges: [],
    },
};
