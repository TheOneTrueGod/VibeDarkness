/**
 * 62_41 Royal Bedchamber - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * The royal bed on a rug, a hearth, and a walled dressing room; 1-wide side door into the throne
 * room.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const D = TerrainType.Dirt;
const R = TerrainType.Rock;

export const SEGMENT_62_41_ROYAL_BEDCHAMBER: CastleSegment = {
    id: '62_41_royal_bedchamber',
    gridCol: 62,
    gridRow: 41,
    description: "The ruler's private bedroom. Being received here was a mark of special favour for advisers and guests.",
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, R, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, R, D, D, _, _, _, _, _, _, _, _, D, D, R],
        [R, D, D, D, D, D, D, D, R, D, D, _, _, R, R, R, R, _, _, D, D, R],
        [R, D, D, D, D, D, D, D, R, D, D, _, _, R, R, R, R, _, _, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, _, _, R, R, R, R, _, _, D, D, R],
        [R, D, D, D, D, D, D, D, R, D, D, _, _, R, R, R, R, _, _, D, D, D],
        [R, D, D, D, D, D, D, D, R, D, D, _, _, _, _, _, _, _, _, D, D, R],
        [R, D, D, D, D, D, D, D, R, D, D, _, _, _, _, _, _, _, _, D, D, R],
        [R, R, R, R, R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Foot of the bed.
        { id: '62_41_royal_bed', label: 'Royal Bed', col: 14, row: 8, type: 'generic' },
        // Chamber floor.
        { id: '62_41_royal_bedchamber', label: 'Royal Bedchamber', col: 10, row: 14, type: 'patrol_point' },
        // Dressing room.
        { id: '62_41_royal_dressing_room', label: 'Dressing Room', col: 4, row: 4, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '62_41_center', position: { kind: 'gridPoint', col: 10, row: 14 }, tags: ['castle'] }],
        edges: [
            ['61_41_center', '62_41_center'],
            ['62_42_center', '62_41_center'],
            ['63_41_center', '62_41_center'],
        ],
    },
};
