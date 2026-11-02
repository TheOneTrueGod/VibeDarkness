/**
 * 63_48 Summoning Circle - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * South-east room of the arcane quarter, and the boss-sized arena at its heart: the great
 * summoning circle (eight pillars, a shallow ritual groove, a grass heart) is centred where the
 * four rooms meet. A small binding circle in the corner feeds a ley line. Doors south to the ice
 * house and east (1-wide) to the wall walk.
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

export const SEGMENT_63_48_SUMMONING_CIRCLE: CastleSegment = {
    id: '63_48_summoning_circle',
    gridCol: 63,
    gridRow: 48,
    description: 'A ritual chamber with a circle inscribed on the floor, where sorcerers called up spirits or creatures and bound them to service.',
    terrain: [
        [_, _, D, D, SW, D, D, G, G, G, D, G, G, G, G, G, G, G, G, G, G, R],
        [_, _, D, D, SW, D, D, G, G, G, D, G, G, G, G, G, G, G, G, G, G, R],
        [D, D, D, D, SW, D, D, R, R, G, D, G, G, G, G, G, G, G, G, R, G, R],
        [D, D, D, SW, D, D, D, R, R, D, D, G, G, G, G, G, G, G, G, R, G, R],
        [SW, SW, SW, D, SW, D, G, G, G, D, D, G, G, G, G, G, G, G, G, R, G, R],
        [D, D, D, D, D, SW, G, G, D, D, D, D, G, G, G, G, G, G, G, R, G, R],
        [D, D, D, D, G, G, SW, G, D, G, G, D, D, G, G, G, G, G, G, R, G, R],
        [G, G, R, R, G, G, G, SW, D, G, G, G, D, D, G, G, G, G, G, G, G, R],
        [G, G, R, R, G, D, D, D, SW, G, G, G, G, D, D, D, G, G, G, G, G, R],
        [G, G, G, D, D, D, G, G, G, SW, G, G, G, G, G, D, D, G, G, G, G, R],
        [D, D, D, D, D, G, G, G, G, G, SW, G, G, G, G, G, D, D, G, G, G, R],
        [G, G, G, G, D, D, G, G, G, G, G, SW, G, G, G, G, G, D, D, D, D, D],
        [G, G, G, G, G, D, D, G, G, G, G, G, SW, G, G, R, G, G, G, G, G, R],
        [G, G, G, G, G, G, D, G, G, G, G, G, G, SW, SW, SW, SW, G, G, G, G, R],
        [G, G, G, G, G, G, D, D, G, G, G, G, G, SW, SW, G, G, SW, G, G, G, R],
        [G, G, G, G, G, G, G, D, D, G, G, G, R, SW, G, _, G, SW, R, G, G, R],
        [G, G, G, G, G, G, G, G, D, D, G, G, G, SW, G, G, G, SW, G, G, G, R],
        [G, G, G, G, G, G, G, G, G, D, G, G, G, G, SW, SW, SW, G, G, G, G, R],
        [G, G, G, G, G, G, G, G, G, D, D, G, G, G, G, R, G, G, G, G, G, R],
        [G, G, R, R, R, R, R, G, G, G, D, G, G, G, G, G, G, G, G, G, G, R],
        [G, G, G, G, G, G, G, G, G, G, D, G, G, G, G, G, G, G, G, G, G, R],
        [R, R, R, R, R, R, R, R, R, R, D, R, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // On the loop path round the summoning circle.
        { id: '63_48_arcane_loop_se', label: 'Arcane Loop (South-east)', col: 6, row: 8, type: 'patrol_point' },
        // Inside the ritual groove of the great summoning circle.
        { id: '63_48_great_circle', label: 'Great Circle', col: 2, row: 2, type: 'generic' },
        // Between the groove and the pillars.
        { id: '63_48_great_circle_rim', label: 'Great Circle Rim', col: 5, row: 3, type: 'enemySpawn' },
        // Heart of the small binding circle.
        { id: '63_48_binding_circle', label: 'Binding Circle', col: 15, row: 15, type: 'generic' },
    ],
    network: {
        nodes: [{ id: '63_48_center', position: { kind: 'gridPoint', col: 6, row: 8 }, tags: ['castle'] }],
        edges: [
            ['64_48_center', '63_48_center'],
        ],
    },
};
