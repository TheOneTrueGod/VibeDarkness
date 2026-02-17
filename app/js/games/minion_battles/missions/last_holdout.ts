/**
 * The Last Holdout - Mission enemy and terrain definitions.
 *
 * 3 Raiders and 1 Raider Captain. A tougher encounter.
 * Terrain: A U-shaped defensive position on the left blocked off by rocks
 * with a narrow chokepoint, and a large grassy area to the right where
 * enemies approach from. Scattered patches of rocks and thick grass.
 */

import type { MissionBattleConfig } from './types';
import { TerrainGrid, CELL_SIZE } from '../terrain/TerrainGrid';
import { TerrainType } from '../terrain/TerrainType';

// Grid: 30 columns × 20 rows (1200×800 world at 40px cells)

function createTerrain(): TerrainGrid {
    const grid = new TerrainGrid(30, 20, CELL_SIZE, TerrainType.Grass);

    // U-shaped rock walls on the left side (players defend inside the U)
    // Left wall (column 0, full height)
    for (let r = 0; r < 20; r++) {
        grid.set(0, r, TerrainType.Rock);
    }

    // Top wall of U (rows 0-1, columns 0-11)
    for (let c = 1; c < 12; c++) {
        grid.set(c, 0, TerrainType.Rock);
        grid.set(c, 1, TerrainType.Rock);
    }

    // Bottom wall of U (rows 18-19, columns 0-11)
    for (let c = 1; c < 12; c++) {
        grid.set(c, 18, TerrainType.Rock);
        grid.set(c, 19, TerrainType.Rock);
    }

    // Right wall of U — upper section (rows 2-7)
    for (let r = 2; r <= 7; r++) {
        grid.set(10, r, TerrainType.Rock);
        grid.set(11, r, TerrainType.Rock);
    }

    // Right wall of U — lower section (rows 12-17)
    for (let r = 12; r <= 17; r++) {
        grid.set(10, r, TerrainType.Rock);
        grid.set(11, r, TerrainType.Rock);
    }
    // Rows 8-11 are the chokepoint opening (no wall)

    // Small rock outcrops in the open field
    grid.set(19, 5, TerrainType.Rock);
    grid.set(20, 5, TerrainType.Rock);
    grid.set(19, 6, TerrainType.Rock);
    grid.set(20, 6, TerrainType.Rock);
    grid.set(20, 7, TerrainType.Rock);

    grid.set(23, 13, TerrainType.Rock);
    grid.set(24, 13, TerrainType.Rock);
    grid.set(24, 14, TerrainType.Rock);

    // Small rock near the chokepoint
    grid.set(13, 7, TerrainType.Rock);
    grid.set(13, 12, TerrainType.Rock);

    // Thick grass patches in the open field
    grid.set(15, 3, TerrainType.ThickGrass);
    grid.set(16, 3, TerrainType.ThickGrass);
    grid.set(15, 4, TerrainType.ThickGrass);
    grid.set(16, 4, TerrainType.ThickGrass);
    grid.set(17, 4, TerrainType.ThickGrass);

    grid.set(17, 15, TerrainType.ThickGrass);
    grid.set(18, 15, TerrainType.ThickGrass);
    grid.set(17, 16, TerrainType.ThickGrass);
    grid.set(18, 16, TerrainType.ThickGrass);

    grid.set(25, 9, TerrainType.ThickGrass);
    grid.set(26, 9, TerrainType.ThickGrass);
    grid.set(25, 10, TerrainType.ThickGrass);
    grid.set(26, 10, TerrainType.ThickGrass);
    grid.set(26, 11, TerrainType.ThickGrass);

    // Dirt patches inside the U for variety
    grid.set(3, 5, TerrainType.Dirt);
    grid.set(4, 5, TerrainType.Dirt);
    grid.set(3, 6, TerrainType.Dirt);
    grid.set(4, 6, TerrainType.Dirt);

    grid.set(5, 13, TerrainType.Dirt);
    grid.set(6, 13, TerrainType.Dirt);
    grid.set(5, 14, TerrainType.Dirt);
    grid.set(6, 14, TerrainType.Dirt);

    return grid;
}

export const LAST_HOLDOUT: MissionBattleConfig = {
    missionId: 'last_holdout',
    name: 'The Last Holdout',
    createTerrain,
    enemies: [
        {
            characterId: 'ranger',
            name: 'Raider Scout',
            hp: 40,
            speed: 100,
            position: { x: 950, y: 250 },
            teamId: 'enemy',
            abilities: ['0001'],
            aiSettings: { minRange: 100, maxRange: 180 },
        },
        {
            characterId: 'warrior',
            name: 'Raider Brute',
            hp: 70,
            speed: 60,
            position: { x: 1050, y: 400 },
            teamId: 'enemy',
            abilities: ['throw_knife'],
            aiSettings: { minRange: 30, maxRange: 80 },
        },
        {
            characterId: 'ranger',
            name: 'Raider Archer',
            hp: 35,
            speed: 30,
            position: { x: 1000, y: 550 },
            teamId: 'enemy',
            abilities: ['0001'],
            aiSettings: { minRange: 120, maxRange: 200 },
        },
        {
            characterId: 'warrior',
            name: 'Raider Captain',
            hp: 80,
            speed: 70,
            position: { x: 1100, y: 400 },
            teamId: 'enemy',
            abilities: ['throw_knife'],
            aiSettings: { minRange: 40, maxRange: 100 },
        },
    ],
};
