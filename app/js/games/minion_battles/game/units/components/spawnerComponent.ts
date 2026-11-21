/**
 * `spawner` component: a unit that births other units on a timer, up to a cap of living children. State only; the
 * tick is in `spawnerHooks.ts` and the rules are the shared spawner core (`spawnerCore.ts`: pruning, cap, timer, burst,
 * placement). This is the generic way to give a def a nest (the Garden Heart's Hive Gourd is its first user); the
 * lanternite and swarm nests predate it and keep their own components.
 *
 * Declare on a def with
 * `components: [componentSpec(SPAWNER_COMPONENT, { spawnerId: 'hiveGourd', maxChildren: 4, intervalSec: 6, burstCount: 1 })]`.
 * `spawnerId` names a `SpawnerSpec` registered with `registerSpawnerSpec` (what a child looks like), so a def never
 * carries code; the numbers are the spec's config and stay on the def.
 */

import type { Unit } from '../Unit';
import type { UnitTag } from '../unitTag';
import { defineUnitComponent, findComponentState, getComponentOptions } from './unitComponent';

export interface SpawnerComponentOptions {
    /** Registered spawner spec id (see `registerSpawnerSpec`). */
    spawnerId: string;
    /** Cap on living children. */
    maxChildren: number;
    /** Seconds between bursts (the first burst is one interval after the unit's first tick). */
    intervalSec: number;
    /** Children per burst. Default 1. */
    burstCount?: number;
    /** Tags added to every unit this spawner births (e.g. kin tags that Wild attacks spare). */
    childTags?: readonly UnitTag[];
}

export interface SpawnerComponentState {
    /** Ids of the living children this spawner birthed. */
    spawnedIds: string[];
    /** Game time of the next burst; null until the first tick (which schedules the first one). */
    nextSpawnAtGameTime: number | null;
}

export const SPAWNER_COMPONENT = defineUnitComponent<SpawnerComponentState, SpawnerComponentOptions>({
    id: 'spawner',
    create: () => ({ spawnedIds: [], nextSpawnAtGameTime: null }),
    toJSON: (state) => ({
        ...(state.spawnedIds.length > 0 ? { spawnerSpawnedIds: [...state.spawnedIds] } : {}),
        ...(state.nextSpawnAtGameTime !== null ? { spawnerNextSpawnAt: state.nextSpawnAtGameTime } : {}),
    }),
    fromJSON: (state, data) => {
        state.spawnedIds = Array.isArray(data.spawnerSpawnedIds)
            ? data.spawnerSpawnedIds.filter((id): id is string => typeof id === 'string')
            : [];
        state.nextSpawnAtGameTime = typeof data.spawnerNextSpawnAt === 'number' ? data.spawnerNextSpawnAt : null;
    },
});

export function peekSpawnerState(unit: Unit): SpawnerComponentState | undefined {
    return findComponentState(unit, SPAWNER_COMPONENT);
}

export function spawnerOptionsOf(unit: Unit): SpawnerComponentOptions | undefined {
    return getComponentOptions(unit, SPAWNER_COMPONENT);
}
