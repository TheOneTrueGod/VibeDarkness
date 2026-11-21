/**
 * `nodeRegrowth` component: a node-tree ROOT whose tree comes back. State and options only; the tick, the registry of
 * named callbacks and the open/cancel entry points live in `nodeRegrowthHooks.ts`.
 *
 * Reusable engine piece: nothing here names the Garden Heart. Any root with a `nodeTree` can declare it:
 * `componentSpec(NODE_REGROWTH_COMPONENT, { openSeconds: 5, trickleSeconds: 10, regrowCallback: 'myRegrow' })`.
 *
 * ## Rules (all on WORLD time, so Time Stop and world slow pause the window)
 * - When the root's last living child dies (a kill, not a dismissal) it OPENS for `openSeconds` and fires the `opened`
 *   callback. When the window ends it calls `regrowCallback` (full regrowth) and fires `regrown`.
 * - While the root has at least one living child and at least one slot is missing, every `trickleSeconds` it calls
 *   `regrowCallback` with `{ only: 1 }` (the callback decides what to grow: parents before children). A
 *   `trickleSecondsRule` can vary the interval (per phase, say); it is read when the timer is armed.
 * - A burrow retreat (the root's phase burrow) cancels both. A dead root does nothing.
 *
 * The id is `NODE_REGROWTH_COMPONENT_ID` (`nodeTree.ts`): a root carrying it "has regrowth" (`rootHasRegrowth`), which
 * is what lets a node's Stem wither instead of becoming Briar.
 */

import type { Unit } from '../Unit';
import { NODE_REGROWTH_COMPONENT_ID } from './nodeTree';
import { defineUnitComponent, findComponentState, getComponentOptions } from './unitComponent';

export interface NodeRegrowthOptions {
    /** World seconds the root stays open (Bared) after its last node dies. */
    openSeconds: number;
    /** World seconds between single-node regrowths while the root is still shelled. Omit for no trickle. */
    trickleSeconds?: number;
    /**
     * Registered trickle rule id (`registerNodeRegrowthTrickleRule`) that gives the trickle interval right now, e.g.
     * one per boss phase. It wins over `trickleSeconds` when it returns a number; `undefined` falls back to it.
     */
    trickleSecondsRule?: string;
    /** Registered callback id (`registerNodeRegrowthCallback`) that grows the missing nodes. */
    regrowCallback: string;
    /** Optional registered callback ids fired when the window opens and when the tree has regrown. */
    callbacks?: { opened?: string; regrown?: string };
}

export interface NodeRegrowthState {
    /** World time the open window ends, or null when not open. */
    openUntil: number | null;
    /** World time the next trickle regrowth is due, or null when none is pending. */
    nextTrickleAt: number | null;
}

export const NODE_REGROWTH_COMPONENT = defineUnitComponent<NodeRegrowthState, NodeRegrowthOptions>({
    id: NODE_REGROWTH_COMPONENT_ID,
    create: () => ({ openUntil: null, nextTrickleAt: null }),
    toJSON: (s) => ({
        ...(s.openUntil != null ? { regrowthOpenUntil: s.openUntil } : {}),
        ...(s.nextTrickleAt != null ? { regrowthNextTrickleAt: s.nextTrickleAt } : {}),
    }),
    fromJSON: (s, data) => {
        s.openUntil = typeof data.regrowthOpenUntil === 'number' ? data.regrowthOpenUntil : null;
        s.nextTrickleAt = typeof data.regrowthNextTrickleAt === 'number' ? data.regrowthNextTrickleAt : null;
    },
});

export function peekNodeRegrowthState(unit: Unit): NodeRegrowthState | undefined {
    return findComponentState(unit, NODE_REGROWTH_COMPONENT);
}

export function nodeRegrowthOptionsOf(unit: Unit): NodeRegrowthOptions | undefined {
    return getComponentOptions(unit, NODE_REGROWTH_COMPONENT);
}

export interface NodeRegrowthStatus {
    /** The window is open right now. */
    open: boolean;
    /** 1 when the window just opened, draining to 0 when it ends; 0 while not open. */
    fraction: number;
}

/** Where the open window stands at world time `time`. Safe on any unit (not open when it has no regrowth). */
export function getNodeRegrowthStatus(unit: Unit, time: number): NodeRegrowthStatus {
    const openUntil = peekNodeRegrowthState(unit)?.openUntil ?? null;
    const openSeconds = nodeRegrowthOptionsOf(unit)?.openSeconds ?? 0;
    if (openUntil == null || openSeconds <= 0) return { open: false, fraction: 0 };
    return { open: true, fraction: Math.min(1, Math.max(0, (openUntil - time) / openSeconds)) };
}
