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
import {
    getTetherSegment,
    clampToLeash,
    tetherCoveredTiles,
    tetherVinePoints,
    STEM_WITHER_EFFECT_TYPE,
} from '../../tethers/tether';
import { findNodeTreeRoot, nodeTreeOptionsOf, peekNodeTreeState, rootHasRegrowth } from './nodeTree';
import { openNodeRegrowth } from './nodeRegrowthHooks';
import { getEnemyHealthMultiplier } from '../../../constants/enemyConstants';
import { Effect } from '../../effects/Effect';

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

/** Seconds a withering Stem takes to fade out. */
export const STEM_WITHER_SECONDS = 0.6;

/**
 * Run the death handling for one node. Exported for tests; the dispatcher calls it from `onDeath`.
 * `killerUnitId` is who dealt the killing blow (null for a dismissal or an environmental death); Severance credits it.
 */
export function resolveNodeDeath(unit: Unit, ctx: UnitComponentContext, killerUnitId: string | null = null): void {
    const state = peekNodeTreeState(unit);
    if (!state || state.resolved) return;
    state.resolved = true;

    fire(unit, ctx, 'onDeath');

    const parent = state.parentId !== null ? ctx.engine.getUnit(state.parentId) : undefined;
    const root = findNodeTreeRoot(unit, (id) => ctx.engine.getUnit(id));
    const rootOptions = root !== unit ? nodeTreeOptionsOf(root) : undefined;
    const withers =
        !state.dismissed
        && rootOptions?.stemDeath === 'witherWhileRegrowing'
        && root.isAlive()
        && rootHasRegrowth(root);

    if (state.tetherMaxLength !== null && parent) {
        if (withers) {
            addStemWitherEffect(ctx, parent, unit);
        } else if (ctx.engine.terrainManager) {
            // The vine becomes Briar where it lay. The parent's last position is its position (units stay in `units`).
            const tiles = tetherCoveredTiles(parent.x, parent.y, unit.x, unit.y);
            ctx.engine.terrainManager.placeBriar(tiles);
        }
    }

    const parentState = parent ? peekNodeTreeState(parent) : undefined;
    if (parent && parentState) {
        const had = parentState.childIds.length;
        parentState.childIds = parentState.childIds.filter((id) => id !== unit.id);
        if (had > 0 && parentState.childIds.length === 0) fire(parent, ctx, 'onLastChildDied', unit);
    }

    // Severance: a kill (not a dismissal) costs the root health, ignoring its Shell and any Bared bonus.
    const severance = rootOptions?.severance;
    if (severance && !state.dismissed && root.isAlive()) {
        const scale = severance.scaleWithEnemyHealth ? getEnemyHealthMultiplier(ctx.engine.enemyScalingPlayerCount) : 1;
        const amount = Math.max(0, Math.round(severance.damage * scale));
        if (amount > 0) root.takeDamage(amount, killerUnitId ?? unit.id, ctx.eventBus, { ignoreTargetModifiers: true });
    }

    // Regrowth: the root's last node was killed, so it opens (after Severance, so a hit that sends it into a retreat
    // opens nothing). A dismissal never opens it.
    if (!state.dismissed && parent && parent === root && parentState && parentState.childIds.length === 0) {
        openNodeRegrowth(root, ctx);
    }
}

/** Render-only: the Stem between `parent` and a node that just died fades out where it lay. */
function addStemWitherEffect(ctx: UnitComponentContext, parent: Unit, child: Unit): void {
    const points = tetherVinePoints(
        { ax: parent.x, ay: parent.y, bx: child.x, by: child.y, childId: child.id },
        ctx.gameTime,
    );
    ctx.engine.addEffect(
        new Effect({
            x: parent.x,
            y: parent.y,
            duration: STEM_WITHER_SECONDS,
            effectType: STEM_WITHER_EFFECT_TYPE,
            effectData: { points: points.map((p) => ({ x: p.x - parent.x, y: p.y - parent.y })) },
        }),
    );
}

export const NODE_TREE_HOOKS: UnitComponentHooks = {
    tick(ctx) {
        for (const unit of ctx.units) {
            if (!unit.isAlive()) continue;
            const state = peekNodeTreeState(unit);
            if (state && state.tetherMaxLength !== null) applyLeash(unit, ctx);
        }
    },
    onDeath(unit, ctx, killerUnitId) {
        resolveNodeDeath(unit, ctx, killerUnitId ?? null);
    },
};
