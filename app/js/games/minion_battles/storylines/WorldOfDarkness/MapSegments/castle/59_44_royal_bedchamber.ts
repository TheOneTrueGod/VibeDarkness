/**
 * 59_44 Royal Bedchamber - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * The royal bed on a rug, a hearth, and a walled dressing room; a 1-wide door to the west wall
 * walk.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const D = TerrainType.Dirt;
const G = TerrainType.Gravel;
const R = TerrainType.Rock;

export const SEGMENT_59_44_ROYAL_BEDCHAMBER: CastleSegment = {
    id: '59_44_royal_bedchamber',
    gridCol: 59,
    gridRow: 44,
    description: "The ruler's private bedroom. Being received here was a mark of special favour for advisers and guests.",
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, G, G, G, G, G, G, G, R, G, G, G, G, G, G, G, G, G, G, G, G, R],
        [R, G, G, G, G, G, G, G, R, G, G, _, _, _, _, _, _, _, _, G, G, R],
        [R, G, G, G, G, G, G, G, R, G, G, _, _, R, R, R, R, _, _, G, G, R],
        [R, G, G, G, G, G, G, G, R, G, G, _, _, R, R, R, R, _, _, G, G, R],
        [R, G, G, G, G, G, G, G, G, G, G, _, _, R, R, R, R, _, _, G, G, R],
        [R, G, G, G, G, G, G, G, R, G, G, _, _, R, R, R, R, _, _, G, G, R],
        [R, G, G, G, G, G, G, G, R, G, G, _, _, _, _, _, _, _, _, G, G, R],
        [R, G, G, G, G, G, G, G, R, G, G, _, _, _, _, _, _, _, _, G, G, R],
        [R, R, R, R, R, R, R, R, R, G, G, G, G, G, G, G, G, G, G, G, D, R],
        [D, D, D, D, G, G, G, G, G, G, G, G, G, G, G, G, G, G, D, D, D, D],
        [R, D, D, D, D, G, G, G, G, G, G, G, G, G, G, G, G, D, D, D, D, D],
        [R, D, D, D, D, D, G, G, G, G, G, G, G, G, G, G, D, D, D, D, R, R],
        [R, G, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
        [R, G, G, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, G, R, R],
        [R, G, G, G, D, D, D, D, D, D, D, D, D, D, D, D, D, D, G, G, R, R],
        [R, G, G, G, G, G, G, G, G, D, D, D, G, G, G, G, G, G, G, G, G, R],
        [R, G, G, G, G, G, G, G, G, D, D, D, G, G, G, G, G, G, G, G, G, R],
        [R, G, G, G, G, G, G, G, G, D, D, D, G, G, G, G, G, G, G, G, G, R],
        [R, G, G, G, G, G, G, G, G, D, D, D, G, G, G, G, G, G, G, G, G, R],
        [R, G, G, G, G, G, G, G, G, D, D, D, D, G, G, G, G, G, G, G, G, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Foot of the bed.
        { id: '59_44_royal_bed', label: 'Royal Bed', col: 14, row: 8, type: 'generic' },
        // Chamber floor.
        { id: '59_44_royal_bedchamber', label: 'Royal Bedchamber', col: 10, row: 14, type: 'patrol_point' },
        // Dressing room.
        { id: '59_44_royal_dressing_room', label: 'Dressing Room', col: 4, row: 4, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '59_44_center', position: { kind: 'gridPoint', col: 10, row: 14 }, tags: ['castle'] }],
        edges: [
            ['60_44_center', '59_44_center'],
            ['58_44_center', '59_44_center'],
        ],
    },
};
