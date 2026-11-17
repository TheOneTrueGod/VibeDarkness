/**
 * Spawning a node child already linked to its parent. This is the API Step 7 builds Buds and Knots on:
 *
 * ```ts
 * const bud = spawnNodeChild(engine, heart, { characterId: 'thornspitter', ...def }, { tetherMaxLength: 220 });
 * ```
 *
 * The child is placed by the spawn definition's own `placement` (use `relativeToUnit` / `fixedWorld`), linked under
 * `parent` (`childIds`), and, when `tetherMaxLength` is given, joined to it by a Stem tether with that leash.
 */

import type { Unit } from '../Unit';
import type { SpawnDefinition } from '../spawning/spawnDefinition';
import { spawnUnit, type SpawnUnitContext } from '../spawning/spawnUnit';
import { linkNodeChild, type LinkNodeChildOptions } from './nodeTree';

/** Spawn `def` and link every unit it produced (normally one) under `parent`. Returns the first, or undefined. */
export function spawnNodeChild(
    ctx: SpawnUnitContext,
    parent: Unit,
    def: SpawnDefinition,
    link: LinkNodeChildOptions = {},
): Unit | undefined {
    const spawned = spawnUnit(ctx, def, 'abilitySpawn');
    for (const child of spawned) linkNodeChild(parent, child, link);
    return spawned[0];
}
