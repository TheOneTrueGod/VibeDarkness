/**
 * Castle boss setups: what a boss fight places around its centre cell and the objective it adds.
 * `defineCastleMission` takes one through its `boss` option; the Chapter 0 Court Magician test bed
 * (`013_court_magician.ts`) calls `courtMagicianBossSetup` directly.
 */

import type { BattleObjectiveDef, EnemySpawnDef } from '../../../types';
import { ObjectiveType } from '../../../objectiveTypes';
import {
    COURT_CRYSTAL_START_COUNT,
    ENEMY_ALPHA_WOLF,
    ENEMY_COURT_CRYSTAL,
    ENEMY_COURT_MAGICIAN,
} from '../../../../constants/enemyConstants';
import { cellCentre } from './castleSpawnPresets';

type GridCell = { col: number; row: number };

/** A boss fight: the units it starts with and the objective(s) that finish it. */
export interface CastleBossSetup {
    enemies: EnemySpawnDef[];
    objectives: BattleObjectiveDef[];
}

// --- Placeholder boss ------------------------------------------------------
// PLACEHOLDER BOSS: stands in for the castle bosses that have no unit of their own yet.

export const PLACEHOLDER_BOSS_OBJECTIVE_ID = 'defeat_boss';

/** Placeholder boss: one Alpha Wolf at the centre (its escort comes from the spawn preset's opening). */
export function placeholderBossSetup(centre: GridCell, objectiveLabel: string): CastleBossSetup {
    return {
        enemies: [{ ...ENEMY_ALPHA_WOLF, position: cellCentre(centre) }],
        objectives: [
            {
                id: PLACEHOLDER_BOSS_OBJECTIVE_ID,
                objectiveType: ObjectiveType.KillTarget,
                label: objectiveLabel,
                toComplete: { type: 'unitDead', unitCharacterId: ENEMY_ALPHA_WOLF.characterId },
            },
        ],
    };
}

// --- Court Magician --------------------------------------------------------

export const COURT_MAGICIAN_OBJECTIVE_ID = 'defeat_court_magician';
/** Crystals the magician starts with; he conjures up to five more as he loses health (Conjure Crystal, 1407). */
export const COURT_CRYSTAL_COUNT = COURT_CRYSTAL_START_COUNT;
/** Radius (tiles) of the starting crystal ring around the centre. */
export const COURT_CRYSTAL_START_RADIUS_TILES = 4;

/** Starting crystal tiles: an even ring around `centre` (opposite sides for two). */
export function courtCrystalStartTiles(centre: GridCell): GridCell[] {
    return Array.from({ length: COURT_CRYSTAL_COUNT }, (_, i) => {
        // Turned half a step so no point lands on the 0_0 arena's interior rocks.
        const a = ((i + 0.5) / COURT_CRYSTAL_COUNT) * Math.PI * 2;
        return {
            col: centre.col + Math.round(Math.cos(a) * COURT_CRYSTAL_START_RADIUS_TILES),
            row: centre.row + Math.round(Math.sin(a) * COURT_CRYSTAL_START_RADIUS_TILES),
        };
    });
}

/**
 * The Court Magician fight around `centre`: the magician on it, his starting crystal ring, and the
 * defeat-the-magician objective.
 */
export function courtMagicianBossSetup(centre: GridCell, objectiveLabel: string): CastleBossSetup & { crystalTiles: GridCell[] } {
    const crystalTiles = courtCrystalStartTiles(centre);
    return {
        crystalTiles,
        enemies: [
            { ...ENEMY_COURT_MAGICIAN, position: cellCentre(centre) },
            ...crystalTiles.map((t) => ({ ...ENEMY_COURT_CRYSTAL, position: cellCentre(t) })),
        ],
        objectives: [
            {
                id: COURT_MAGICIAN_OBJECTIVE_ID,
                objectiveType: ObjectiveType.KillTarget,
                label: objectiveLabel,
                toComplete: { type: 'unitDead', unitCharacterId: ENEMY_COURT_MAGICIAN.characterId },
            },
        ],
    };
}
