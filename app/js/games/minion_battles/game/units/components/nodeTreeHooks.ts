/**
 * `nodeTree` component hooks (state and API in `nodeTree.ts`).
 *
 * - `tick`: the leash. A tethered child farther than its `tetherMaxLength` from its parent is pulled back to exactly
 *   the leash length (covers knockback, nudges and anything else that moved it).
 * - `onDeath` (per unit, runs on every client from the `unit_died` listener):
 *     1. fires the unit's own `onDeath` callback,
 *     2. if it was a tethered child, its vine becomes Briar on the tiles it covered (`placeBriar`, Step 4),
 *     3. removes it from its parent's living children and, if that emptied the list, fires the parent's
 *        `onLastChildDied` callback.
 *   A parent's death does NOT cascade: its children stay alive, their tethers simply stop existing (a dead end).
 *
 * Callbacks are named and resolved from a registry, so defs stay data and nothing is a closure on a unit:
 * `registerNodeTreeCallback('openShell', (unit, ctx, event) => { ... })`. An unknown id does nothing.
 */

import type { Unit } from '../Unit';
import type { UnitComponentContext, UnitComponentHooks } from './unitComponentHooks';
import { getTetherSegment, clampToLeash, tetherCoveredTiles } from '../../tethers/tether';
import { nodeTreeOptionsOf, peekNodeTreeState } from './nodeTree';

export type NodeTreeCallbackEvent = 'onLastChildDied' | 'onDeath';

/** `unit` is the node the callback is registered on (the parent for `onLastChildDied`); `child` is the one that died. */
export type NodeTreeCallback = (
    unit: Unit,
    ctx: UnitComponentContext,
    event: NodeTreeCallbackEvent,
    child?: Unit,
) => void;

const CALLBACKS = new Map<string, NodeTreeCallback>();

/** Register a named callback. Returns an unregister function (for tests). Re-registering an id replaces it. */
export function registerNodeTreeCallback(id: string, handler: NodeTreeCallback): () => void {
    CALLBACKS.set(id, handler);
    return () => {
        if (CALLBACKS.get(id) === handler) CALLBACKS.delete(id);
    };
}

function fire(
    unit: Unit,
    ctx: UnitComponentContext,
    event: NodeTreeCallbackEvent,
    child?: Unit,
): void {
    const id = nodeTreeOptionsOf(unit)?.[event];
    if (id) CALLBACKS.get(id)?.(unit, ctx, event, child);
}

/** Pull one tethered child back inside its leash. Exported for tests. */
export function applyLeash(child: Unit, ctx: UnitComponentContext): void {
    const seg = getTetherSegment(ctx.engine, child);
    if (!seg) return;
    const clamped = clampToLeash(seg.ax, seg.ay, child.x, child.y, seg.maxLength);
    if (clamped.x !== child.x || clamped.y !== child.y) {
        child.x = clamped.x;
        child.y = clamped.y;
    }
}

/** Run the death handling for one node. Exported for tests; the dispatcher calls it from `onDeath`. */
export function resolveNodeDeath(unit: Unit, ctx: UnitComponentContext): void {
    const state = peekNodeTreeState(unit);
    if (!state || state.resolved) return;
    state.resolved = true;

    fire(unit, ctx, 'onDeath');

    const parent = state.parentId !== null ? ctx.engine.getUnit(state.parentId) : undefined;

    if (state.tetherMaxLength !== null && parent && ctx.engine.terrainManager) {
        // The vine becomes Briar where it lay. The parent's last position is its position (units stay in `units`).
        const tiles = tetherCoveredTiles(parent.x, parent.y, unit.x, unit.y);
        ctx.engine.terrainManager.placeBriar(tiles);
    }

    const parentState = parent ? peekNodeTreeState(parent) : undefined;
    if (parent && parentState) {
        const had = parentState.childIds.length;
        parentState.childIds = parentState.childIds.filter((id) => id !== unit.id);
        if (had > 0 && parentState.childIds.length === 0) fire(parent, ctx, 'onLastChildDied', unit);
    }
}

export const NODE_TREE_HOOKS: UnitComponentHooks = {
    tick(ctx) {
        for (const unit of ctx.units) {
            if (!unit.isAlive()) continue;
            const state = peekNodeTreeState(unit);
            if (state && state.tetherMaxLength !== null) applyLeash(unit, ctx);
        }
    },
    onDeath(unit, ctx) {
        resolveNodeDeath(unit, ctx);
    },
};
