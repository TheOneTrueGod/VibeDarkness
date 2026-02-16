/**
 * Dark Awakening - Mission enemy and terrain definitions.
 *
 * 2 Skeleton Warriors and 1 Dark Mage. Placed on the right side of the arena.
 * Terrain: Grassy open area with patches of thick grass, small stone outcrops,
 * and one large irregular rock formation in the center.
 */

import type { MissionBattleConfig } from './types';
import { TerrainGrid, CELL_SIZE } from '../terrain/TerrainGrid';
import { TerrainType } from '../terrain/TerrainType';

// Grid: 30 columns × 20 rows (1200×800 world at 40px cells)

function createTerrain(): TerrainGrid {
    const grid = new TerrainGrid(30, 20, CELL_SIZE, TerrainType.Grass);

    // Large irregular rock formation in the center (~8×8, irregularly shaped)
    const bigRock: [number, number][] = [
        [13, 6], [14, 6], [15, 6],
        [12, 7], [13, 7], [14, 7], [15, 7], [16, 7],
        [11, 8], [12, 8], [13, 8], [14, 8], [15, 8], [16, 8], [17, 8],
        [11, 9], [12, 9], [13, 9], [14, 9], [15, 9], [16, 9], [17, 9],
        [12, 10], [13, 10], [14, 10], [15, 10], [16, 10],
        [12, 11], [13, 11], [14, 11], [15, 11], [16, 11],
        [13, 12], [14, 12], [15, 12],
    ];
    for (const [c, r] of bigRock) grid.set(c, r, TerrainType.Rock);

    // Small rock patch — upper-left area (irregular 3×2)
    grid.set(4, 4, TerrainType.Rock);
    grid.set(5, 4, TerrainType.Rock);
    grid.set(4, 5, TerrainType.Rock);
    grid.set(5, 5, TerrainType.Rock);
    grid.set(6, 5, TerrainType.Rock);

    // Small rock patch — lower-right area (irregular 2×3)
    grid.set(24, 14, TerrainType.Rock);
    grid.set(25, 14, TerrainType.Rock);
    grid.set(24, 15, TerrainType.Rock);
    grid.set(25, 15, TerrainType.Rock);
    grid.set(25, 16, TerrainType.Rock);

    // Small rock patch — right side near enemies
    grid.set(27, 3, TerrainType.Rock);
    grid.set(28, 3, TerrainType.Rock);
    grid.set(28, 4, TerrainType.Rock);

    // Thick grass patch — upper-left (irregular 3×3)
    grid.set(6, 2, TerrainType.ThickGrass);
    grid.set(7, 2, TerrainType.ThickGrass);
    grid.set(6, 3, TerrainType.ThickGrass);
    grid.set(7, 3, TerrainType.ThickGrass);
    grid.set(8, 3, TerrainType.ThickGrass);

    // Thick grass patch — lower-left (irregular 3×3)
    grid.set(7, 14, TerrainType.ThickGrass);
    grid.set(8, 14, TerrainType.ThickGrass);
    grid.set(7, 15, TerrainType.ThickGrass);
    grid.set(8, 15, TerrainType.ThickGrass);
    grid.set(8, 16, TerrainType.ThickGrass);

    // Thick grass patch — right side (irregular 2×3)
    grid.set(21, 4, TerrainType.ThickGrass);
    grid.set(22, 4, TerrainType.ThickGrass);
    grid.set(21, 5, TerrainType.ThickGrass);
    grid.set(22, 5, TerrainType.ThickGrass);
    grid.set(22, 6, TerrainType.ThickGrass);

    // Thick grass patch — lower-right (irregular 3×2)
    grid.set(22, 16, TerrainType.ThickGrass);
    grid.set(23, 16, TerrainType.ThickGrass);
    grid.set(22, 17, TerrainType.ThickGrass);
    grid.set(23, 17, TerrainType.ThickGrass);
    grid.set(24, 17, TerrainType.ThickGrass);

    return grid;
}

export const DARK_AWAKENING: MissionBattleConfig = {
    missionId: 'dark_awakening',
    name: 'A Dark Awakening',
    createTerrain,
    enemies: [
        {
            characterId: 'warrior',
            name: 'Skeleton Warrior',
            hp: 50,
            speed: 80,
            position: { x: 1000, y: 300 },
            teamId: 'enemy',
            abilities: ['throw_knife'],
            aiSettings: { minRange: 30, maxRange: 80 },
        },
        {
            characterId: 'warrior',
            name: 'Skeleton Guard',
            hp: 60,
            speed: 70,
            position: { x: 1050, y: 500 },
            teamId: 'enemy',
            abilities: ['throw_knife'],
            aiSettings: { minRange: 30, maxRange: 80 },
        },
        {
            characterId: 'mage',
            name: 'Dark Mage',
            hp: 30,
            speed: 50,
            position: { x: 1100, y: 400 },
            teamId: 'enemy',
            abilities: ['throw_knife'],
            aiSettings: { minRange: 150, maxRange: 250 },
        },
    ],
};
