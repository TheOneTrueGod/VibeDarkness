/**
 * `spawner` component hooks (state in `spawnerComponent.ts`). `tick` runs the shared spawner core once per living
 * spawner per simulation tick: the first tick schedules the first burst one interval away, later ticks spawn when the
 * timer is due and the cap allows. While the spawner is at its cap the timer is held one interval ahead, so killing a
 * child starts a fresh wait before its replacement grows. Spawn positions and ids come from the engine's seeded RNG and id source, so every
 * client spawns the same children.
 *
 * What a child looks like is a `SpawnerSpec` registered by id (`registerSpawnerSpec`), keyed by the component's
 * `spawnerId`, so defs stay data. An unknown id spawns nothing.
 */

import type { Unit } from '../Unit';
import type { UnitComponentContext, UnitComponentHooks } from './unitComponentHooks';
import {
    buildNestSpawnContext,
    createSpawnerState,
    MIN_SPAWN_INTERVAL_SEC,
    pruneSpawnedIds,
    tickSpawner,
    type SpawnerSpec,
    type SpawnerState,
} from './spawnerCore';
import {
    peekSpawnerState,
    spawnerOptionsOf,
    type SpawnerComponentOptions,
} from './spawnerComponent';

const SPECS = new Map<string, SpawnerSpec<SpawnerComponentOptions>>();

/** Register a spawner spec by id. Returns an unregister function (for tests). Re-registering an id replaces it. */
export function registerSpawnerSpec(id: string, spec: SpawnerSpec<SpawnerComponentOptions>): () => void {
    SPECS.set(id, spec);
    return () => {
        if (SPECS.get(id) === spec) SPECS.delete(id);
    };
}

/** Advance one spawner by a tick. Exported for tests. */
export function tickSpawnerUnit(unit: Unit, ctx: UnitComponentContext): void {
    const state = peekSpawnerState(unit);
    const options = spawnerOptionsOf(unit);
    if (!state || !options) return;
    const spec = SPECS.get(options.spawnerId);
    if (!spec) return;
    if (state.nextSpawnAtGameTime === null) {
        state.nextSpawnAtGameTime = createSpawnerState(ctx.gameTime, options.intervalSec).nextSpawnAtGameTime;
        return;
    }
    const live = state as SpawnerState; // the timer is scheduled (non-null) from here on
    // At the cap the timer keeps running ahead of the clock, so a child that dies starts a fresh interval instead of
    // being replaced on the very next tick.
    pruneSpawnedIds(live, ctx.units);
    if (live.spawnedIds.length >= spec.maxChildren(options)) {
        live.nextSpawnAtGameTime = ctx.gameTime + Math.max(MIN_SPAWN_INTERVAL_SEC, spec.intervalSec(options));
        return;
    }
    tickSpawner({
        spawner: unit,
        cfg: options,
        state: live,
        spec,
        spawnCtx: buildNestSpawnContext({
            units: ctx.units,
            eventBus: ctx.eventBus,
            addUnit: (u, source) => ctx.addUnit(u, source),
            idSource: ctx.engine,
            mapPOIs: ctx.mapPOIs,
            generateRandomInteger: (min, max) => ctx.generateRandomInteger(min, max),
        }),
        env: { units: ctx.units, gameTime: ctx.gameTime },
    });
}

export const SPAWNER_HOOKS: UnitComponentHooks = {
    tick(ctx) {
        for (const unit of [...ctx.units]) {
            if (!unit.isAlive() || !peekSpawnerState(unit)) continue;
            tickSpawnerUnit(unit, ctx);
        }
    },
};
