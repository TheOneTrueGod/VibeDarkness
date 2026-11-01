/**
 * 64_44 Forbidden Archive - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Locked archive: a 4-wide corridor past four vault rooms with 1-wide doors, ending at a sealed
 * vault. Dead end off the upper east wing.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;

export const SEGMENT_64_44_FORBIDDEN_ARCHIVE: CastleSegment = {
    id: '64_44_forbidden_archive',
    gridCol: 64,
    gridRow: 44,
    description: 'A locked archive for texts judged dangerous or heretical, kept from all but a few trusted scholars.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, D, D, D, D, R, R, R, R, R, R, R, R, R],
        [R, R, D, D, D, D, D, D, R, D, D, D, D, R, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, R, D, D, D, D, R, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, R, D, D, D, D, R, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, R, D, D, D, D, R, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, R, D, D, D, D, R, D, D, D, D, D, D, R, R],
        [R, R, R, R, R, R, R, R, R, D, D, D, D, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, D, D, D, D, R, R, R, R, R, R, R, R, R],
        [R, R, D, D, D, D, D, D, R, D, D, D, D, R, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, R, D, D, D, D, R, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, R, D, D, D, D, R, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, R, D, D, D, D, R, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, R, D, D, D, D, R, D, D, D, D, D, D, R, R],
        [R, R, R, R, R, R, R, R, R, D, D, D, D, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R],
        [R, R, R, R, R, D, D, D, D, D, SW, SW, D, D, D, D, D, R, R, R, R, R],
        [R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Corridor.
        { id: '64_44_forbidden_archive', label: 'Forbidden Archive', col: 10, row: 9, type: 'patrol_point' },
        // Inside the sealed vault.
        { id: '64_44_sealed_vault', label: 'Sealed Vault', col: 7, row: 19, type: 'generic' },
        // North-west archive room.
        { id: '64_44_archive_vault_room', label: 'Archive Room', col: 4, row: 4, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '64_44_center', position: { kind: 'gridPoint', col: 10, row: 9 }, tags: ['castle'] }],
        edges: [],
    },
};
