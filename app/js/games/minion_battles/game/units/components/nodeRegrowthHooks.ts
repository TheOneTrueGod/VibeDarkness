/**
 * `nodeRegrowth` component hooks (state and rules in `nodeRegrowth.ts`) and the callback registry.
 *
 * Callbacks are named and resolved from a registry so defs stay data:
 * `registerNodeRegrowthCallback('myRegrow', (root, ctx, request) => grownCount)`. One function serves each id and is
 * told what is wanted through `request.event`:
 *  - `regrow` (`regrowCallback`): grow the missing nodes (`only` caps how many); return how many it grew.
 *  - `missing` (`regrowCallback`): grow nothing; return how many slots are missing (arms the trickle timer).
 *  - `opened` / `regrown` (`callbacks`): cues; the return value is ignored.
 * An unknown id does nothing (returns 0).
 */

import type { Unit } from '../Unit';
import type { UnitComponentContext, UnitComponentHooks } from './unitComponentHooks';
import { hasLivingChildren, rootHasRegrowth } from './nodeTree';
import { nodeRegrowthOptionsOf, peekNodeRegrowthState, type NodeRegrowthOptions } from './nodeRegrowth';

export type NodeRegrowthRequest =
    | { event: 'regrow'; only?: number }
    | { event: 'missing' }
    | { event: 'opened' }
    | { event: 'regrown' };

export type NodeRegrowthCallback = (
    root: Unit,
    ctx: UnitComponentContext,
    request: NodeRegrowthRequest,
) => number | void;

const CALLBACKS = new Map<string, NodeRegrowthCallback>();

/** Register a named callback. Returns an unregister function (for tests). Re-registering an id replaces it. */
export function registerNodeRegrowthCallback(id: string, handler: NodeRegrowthCallback): () => void {
    CALLBACKS.set(id, handler);
    return () => {
        if (CALLBACKS.get(id) === handler) CALLBACKS.delete(id);
    };
}

/** Trickle interval right now (world seconds), or undefined to use the option's `trickleSeconds`. */
export type NodeRegrowthTrickleRule = (root: Unit, ctx: UnitComponentContext) => number | undefined;

const TRICKLE_RULES = new Map<string, NodeRegrowthTrickleRule>();

/** Register a named trickle rule. Returns an unregister function (for tests). Re-registering an id replaces it. */
export function registerNodeRegrowthTrickleRule(id: string, rule: NodeRegrowthTrickleRule): () => void {
    TRICKLE_RULES.set(id, rule);
    return () => {
        if (TRICKLE_RULES.get(id) === rule) TRICKLE_RULES.delete(id);
    };
}

/** The root's trickle interval right now: its rule's answer when it gives one, else `trickleSeconds` (0 = none). */
export function nodeRegrowthTrickleSeconds(root: Unit, options: NodeRegrowthOptions, ctx: UnitComponentContext): number {
    const ruled = options.trickleSecondsRule ? TRICKLE_RULES.get(options.trickleSecondsRule)?.(root, ctx) : undefined;
    return Math.max(0, ruled ?? options.trickleSeconds ?? 0);
}

function call(id: string | undefined, root: Unit, ctx: UnitComponentContext, request: NodeRegrowthRequest): number {
    if (!id) return 0;
    const result = CALLBACKS.get(id)?.(root, ctx, request);
    return typeof result === 'number' ? result : 0;
}

/** Drop a pending window and trickle (a retreat, or a test). Safe on any unit. */
export function cancelNodeRegrowth(unit: Unit): void {
    const state = peekNodeRegrowthState(unit);
    if (!state) return;
    state.openUntil = null;
    state.nextTrickleAt = null;
}

/**
 * Open the window: called when the root's last child is killed. Does nothing for a dead root, a root already open, one
 * that is retreating, or one without the component's options.
 */
export function openNodeRegrowth(root: Unit, ctx: UnitComponentContext): void {
    const state = peekNodeRegrowthState(root);
    const options = nodeRegrowthOptionsOf(root);
    if (!state || !options || !root.isAlive() || state.openUntil != null || !rootHasRegrowth(root)) return;
    state.openUntil = ctx.gameTime + options.openSeconds;
    state.nextTrickleAt = null;
    call(options.callbacks?.opened, root, ctx, { event: 'opened' });
}

function tickRoot(root: Unit, options: NodeRegrowthOptions, ctx: UnitComponentContext): void {
    const state = peekNodeRegrowthState(root)!;
    if (!rootHasRegrowth(root)) {
        // Retreating: nothing regrows, nothing waits.
        cancelNodeRegrowth(root);
        return;
    }
    if (state.openUntil != null) {
        if (ctx.gameTime < state.openUntil) return;
        state.openUntil = null;
        state.nextTrickleAt = null;
        call(options.regrowCallback, root, ctx, { event: 'regrow' });
        call(options.callbacks?.regrown, root, ctx, { event: 'regrown' });
        return;
    }
    const trickleSeconds = nodeRegrowthTrickleSeconds(root, options, ctx);
    if (!trickleSeconds || !hasLivingChildren(root)) {
        state.nextTrickleAt = null;
        return;
    }
    if (state.nextTrickleAt == null) {
        if (call(options.regrowCallback, root, ctx, { event: 'missing' }) > 0) {
            state.nextTrickleAt = ctx.gameTime + trickleSeconds;
        }
        return;
    }
    if (ctx.gameTime < state.nextTrickleAt) return;
    state.nextTrickleAt = null; // re-armed next tick if something is still missing
    call(options.regrowCallback, root, ctx, { event: 'regrow', only: 1 });
}

export const NODE_REGROWTH_HOOKS: UnitComponentHooks = {
    tick(ctx) {
        for (const unit of ctx.units) {
            if (!unit.isAlive()) continue;
            const options = nodeRegrowthOptionsOf(unit);
            if (options && peekNodeRegrowthState(unit)) tickRoot(unit, options, ctx);
        }
    },
};
