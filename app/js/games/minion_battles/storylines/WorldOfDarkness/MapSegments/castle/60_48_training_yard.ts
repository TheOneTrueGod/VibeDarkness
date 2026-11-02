/**
 * 60_48 Training Yard - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Open grass yard with training dummies and a sparring ring of posts, between the gladiator pit
 * and the west guardhouse.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const D = TerrainType.Dirt;
const R = TerrainType.Rock;

export const SEGMENT_60_48_TRAINING_YARD: CastleSegment = {
    id: '60_48_training_yard',
    gridCol: 60,
    gridRow: 48,
    description: 'An open yard where soldiers practised swordplay, wrestling and formation drills, often against wooden posts called pells.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, D, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, R, R, R, R, _, R],
        [R, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, R, _, _, R, _, _, _, D, D, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, R],
        [D, _, _, R, _, _, R, _, _, _, D, D, _, _, R, _, _, R, _, _, _, R],
        [D, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, R, _, _, R, _, _, _, D, R, _, _, _, _, _, _, _, _, R, R],
        [R, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, _, D, R, _, _, _, _, _, _, _, _, R, R],
        [R, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, _, D, D, _, _, R, _, _, R, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Inside the sparring ring.
        { id: '60_48_training_ring', label: 'Sparring Ring', col: 15, row: 14, type: 'patrol_point' },
        // Among the dummies.
        { id: '60_48_training_dummies', label: 'Training Dummies', col: 4, row: 11, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '60_48_center', position: { kind: 'gridPoint', col: 10, row: 12 }, tags: ['castle'] }],
        edges: [
            ['60_47_center', '60_48_center'],
        ],
    },
};
