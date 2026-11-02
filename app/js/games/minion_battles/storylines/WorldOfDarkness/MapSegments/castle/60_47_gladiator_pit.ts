/**
 * 60_47 Gladiator Pit - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Battle arena: a round pit walled by a rock ring with four 2-wide gates, a shallow blood pool in
 * the centre, and a narrow spectator ring with corner pillars outside.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const G = TerrainType.Gravel;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;

export const SEGMENT_60_47_GLADIATOR_PIT: CastleSegment = {
    id: '60_47_gladiator_pit',
    gridCol: 60,
    gridRow: 47,
    description: 'A sunken fighting ring where prisoners, champions or beasts fought for the entertainment of spectators watching from above.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, G, G, G, G, G, G, G, G, D, D, D, D, G, G, G, G, G, G, G, G, R],
        [R, G, R, R, G, G, G, G, G, D, D, D, G, G, G, G, G, G, R, R, G, R],
        [R, G, R, R, G, G, G, G, R, R, D, D, R, R, G, G, G, G, R, R, G, R],
        [R, G, G, G, G, G, R, R, G, D, D, D, G, G, R, R, G, G, G, G, G, R],
        [R, G, G, G, G, R, R, G, G, D, D, D, G, G, G, R, R, G, G, G, G, R],
        [R, G, G, G, R, R, D, D, D, D, D, D, D, D, D, D, R, R, G, G, G, R],
        [R, G, G, G, R, D, D, D, D, D, D, D, D, D, D, D, D, R, G, G, G, R],
        [R, G, G, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, G, G, R],
        [R, D, D, R, D, D, D, D, D, D, SW, SW, G, G, D, D, D, D, R, D, G, R],
        [D, D, D, D, D, D, D, D, D, SW, SW, SW, SW, G, G, D, D, D, D, D, D, R],
        [D, D, D, D, D, D, G, D, D, SW, SW, SW, SW, G, G, G, D, D, D, D, D, R],
        [R, D, G, R, G, G, G, D, D, D, SW, SW, G, G, G, G, G, G, R, D, D, R],
        [R, G, G, R, G, G, G, G, D, D, D, D, G, G, G, G, G, G, R, D, D, R],
        [R, G, G, G, R, G, G, G, G, D, D, D, G, G, G, G, G, R, D, D, D, R],
        [R, G, G, G, R, R, G, G, G, D, D, D, G, G, G, G, R, R, D, D, D, R],
        [R, G, G, G, G, R, R, G, G, D, D, D, G, G, G, R, R, G, D, D, D, R],
        [R, G, G, G, G, G, R, R, G, D, D, D, G, G, R, R, G, G, D, D, D, D],
        [R, G, R, R, G, G, G, G, R, R, D, D, R, R, G, G, G, G, R, R, D, R],
        [R, G, R, R, G, G, G, G, G, D, D, D, G, G, G, G, G, G, R, R, G, R],
        [R, G, G, G, G, G, G, G, D, D, D, D, D, G, G, G, G, G, G, G, G, R],
        [R, R, R, R, R, R, R, R, R, D, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Inside the pit.
        { id: '60_47_pit_floor', label: 'Pit Floor', col: 10, row: 7, type: 'patrol_point' },
        // Blood pool at the centre.
        { id: '60_47_pit_center', label: 'Pit Center', col: 10, row: 10, type: 'generic' },
        // North-east corner of the stands.
        { id: '60_47_pit_stands_northeast', label: 'North-east Stands', col: 20, row: 1, type: 'enemySpawn' },
        // South-west corner of the stands.
        { id: '60_47_pit_stands_southwest', label: 'South-west Stands', col: 1, row: 20, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '60_47_center', position: { kind: 'gridPoint', col: 10, row: 7 }, tags: ['castle'] }],
        edges: [
            ['60_46_center', '60_47_center'],
            ['61_47_center', '60_47_center'],
        ],
    },
};
