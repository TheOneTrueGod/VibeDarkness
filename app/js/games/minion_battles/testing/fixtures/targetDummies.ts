import type { TerrainManager } from '../../terrain/TerrainManager';
import type { GameEngine } from '../../game/GameEngine';
import { Unit } from '../../game/units/Unit';
import { createUnitFromSpawnConfig } from '../../game/units/index';

const DEFAULT_DUMMY_HP = 500;

function targetDummySpawnArgs(
    x: number,
    y: number,
    engine: GameEngine,
    opts?: { hp?: number; id?: string; name?: string },
): Unit {
    return createUnitFromSpawnConfig(
        {
            id: opts?.id ?? 'target_dummy',
            characterId: 'enemy_melee',
            name: opts?.name ?? 'Target Dummy',
            hp: opts?.hp ?? DEFAULT_DUMMY_HP,
            x,
            y,
            teamId: 'enemy',
            ownerId: 'ai',
            /** Unknown tree id → no AI tick (stationary dummy). */
            unitAITreeId: 'static_test_no_ai',
        },
        engine.eventBus,
        engine,
    );
}

/** Target dummy at explicit world coordinates (same rules as grid variant). */
export function createTargetDummyAtWorld(
    engine: GameEngine,
    x: number,
    y: number,
    opts?: { hp?: number; id?: string; name?: string },
): Unit {
    return targetDummySpawnArgs(x, y, engine, opts);
}

/**
 * Spawn a stationary enemy_melee target dummy with high HP at a grid cell (world position from terrain).
 * Uses explicit id `target_dummy` when no custom id is needed for lookups.
 */
export function createTargetDummyAtGrid(
    terrain: TerrainManager,
    col: number,
    row: number,
    engine: GameEngine,
    opts?: { hp?: number; id?: string; name?: string },
): Unit {
    const { x, y } = terrain.grid.gridToWorld(col, row);
    return targetDummySpawnArgs(x, y, engine, opts);
}
