/**
 * 60_47 Training Ring - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * North-east quarter of the training ring: an oval dirt track round a field of practice dummies
 * (rock posts). Along the north edge a walled lane, not part of the ring, runs from the
 * crossroads' west exit (61_47) to the barracks' south door (60_46).
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const B = TerrainType.Brick;
const D = TerrainType.Dirt;
const R = TerrainType.Rock;
const T = TerrainType.ThickGrass;

export const SEGMENT_60_47_TRAINING_RING: CastleSegment = {
    id: '60_47_training_ring',
    gridCol: 60,
    gridRow: 47,
    description: 'A practice ground where recruits ran laps and drilled against wooden dummies before they were trusted with real opponents.',
    terrain: [
        [B, B, B, B, B, B, B, B, B, B, D, D, B, B, B, B, B, B, B, B, B, B],
        [_, _, _, _, _, _, _, _, B, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [_, _, _, _, _, _, _, _, B, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [_, _, _, _, _, _, _, _, B, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [T, _, _, _, _, _, _, _, B, B, B, B, B, B, B, B, B, B, B, B, B, B],
        [T, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, B],
        [T, _, _, _, _, _, _, D, D, D, D, D, D, D, _, _, _, _, _, _, _, B],
        [_, _, _, _, _, D, D, D, D, D, D, D, D, D, D, D, _, _, _, _, _, B],
        [_, _, _, _, D, D, D, D, _, _, _, _, _, D, D, D, D, _, _, _, _, B],
        [_, _, _, D, D, D, _, _, _, _, _, _, _, _, _, D, D, D, _, _, _, B],
        [_, _, D, D, _, _, _, _, _, _, _, _, _, _, _, _, _, D, D, _, _, B],
        [_, D, D, D, _, _, _, R, _, _, R, _, _, R, _, _, _, D, D, D, _, B],
        [D, D, D, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, D, D, _, B],
        [D, D, D, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, D, D, _, B],
        [_, D, D, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, D, D, _, B],
        [_, D, D, _, _, _, _, R, _, _, R, _, _, R, _, _, _, _, D, D, _, B],
        [_, D, D, D, _, _, _, _, _, _, _, _, _, _, _, _, _, D, D, D, _, B],
        [_, _, D, D, _, _, _, _, _, _, _, _, _, _, _, _, _, D, D, _, _, B],
        [_, _, _, D, D, D, _, _, _, _, _, _, _, _, _, D, D, D, _, _, _, B],
        [_, _, _, _, D, D, D, D, _, _, _, _, _, D, D, D, D, _, _, _, _, B],
        [_, _, _, _, _, D, D, D, D, D, D, D, D, D, D, D, _, _, _, _, _, B],
        [_, _, _, _, _, _, _, D, D, D, D, D, D, D, _, _, _, _, _, _, _, B],
    ],
    pointsOfInterest: [
        // On the north bend of the track.
        { id: '60_47_track_north', label: 'Track (North)', col: 10, row: 6, type: 'patrol_point' },
        // Among the dummies inside the track.
        { id: '60_47_dummies', label: 'Practice Dummies', col: 10, row: 13, type: 'enemySpawn' },
        // Grass corner north of the track.
        { id: '60_47_ring_northwest', label: 'North-west Corner', col: 3, row: 2, type: 'enemySpawn' },
        // Where the track path meets the archery green: where the training-grounds mission ends.
        { id: '60_47_exit_west', label: 'Exit: West', col: 1, row: 12, type: 'generic', tags: ['exit'] },
        // In the walled lane from the crossroads to the barracks.
        { id: '60_47_barracks_lane', label: 'Barracks Lane', col: 12, row: 2, type: 'generic' },
    ],
    network: {
        nodes: [
            { id: '60_47_center', position: { kind: 'gridPoint', col: 2, row: 12 }, tags: ['castle'] },
            { id: '60_47_lane', position: { kind: 'gridPoint', col: 12, row: 2 }, tags: ['castle'] },
        ],
        edges: [
            ['60_47_center', '60_48_center'],
            ['61_47_center', '60_47_lane'],
            ['60_46_center', '60_47_lane'],
        ],
    },
};
