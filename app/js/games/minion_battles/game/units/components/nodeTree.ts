/**
 * `nodeTree` component: a unit's place in a tree of linked units (a parent and its children), plus an optional Stem
 * tether to its parent. State and the public API; hooks, callbacks and the leash live in `nodeTreeHooks.ts`.
 *
 * Reusable engine piece: nothing here names the Garden Heart. Any boss with sub-units (nodes) can use it.
 *
 * ## Model
 * - `parentId`: the unit this one hangs off, or null for a root.
 * - `childIds`: the LIVING children, in link order. A child removes itself when it dies, so
 *   `childIds.length > 0` IS "has living children" (the condition needs only the unit, never the engine).
 * - `tetherMaxLength`: set on the CHILD when it is linked with a tether. It is the leash (px between the two
 *   unit centres). The tether body itself is derived from the two unit positions (`game/tethers/tether.ts`), so it
 *   serializes with the units and needs no engine-level state.
 *
 * ## Declaring and linking
 * A def may declare the component to attach callbacks:
 * `componentSpec(NODE_TREE_COMPONENT, { onLastChildDied: 'openShell', onDeath: 'someId' })`.
 * Callback ids are resolved from `registerNodeTreeCallback` (see `nodeTreeHooks.ts`), so defs stay plain data.
 * Units that declare nothing get the component attached lazily when linked.
 *
 * Link two existing units with `linkNodeChild(parent, child, { tetherMaxLength })`, or spawn and link in one go
 * with `spawnNodeChild(ctx, parent, spawnDefinition, { tetherMaxLength })` (`nodeTreeSpawn.ts`).
 *
 * ## Condition
 * Importing this module registers the flat-reduction condition `hasLivingChildren` (`NODE_TREE_HAS_LIVING_CHILDREN`),
 * true while the unit still has a living child. Use it as `flatDamageReductions: [{ amount, floor, condition: ... }]`.
 */

import type { Unit } from '../Unit';
import { registerFlatReductionCondition } from '../flatDamageReduction';
import { defineUnitComponent, findComponentState, getComponentOptions, getComponentState } from './unitComponent';

/** Registered flat-reduction condition id: the unit has at least one living node child. */
export const NODE_TREE_HAS_LIVING_CHILDREN = 'hasLivingChildren';

export interface NodeTreeOptions {
    /** Callback id fired on THIS unit when its last living child dies (it had at least one). Fires once per emptying. */
    onLastChildDied?: string;
    /** Callback id fired on THIS unit when it dies. */
    onDeath?: string;
}

export interface NodeTreeState {
    parentId: string | null;
    /** Living children only. */
    childIds: string[];
    /** Leash length in px when this unit is tethered to its parent; null for an untethered link or a root. */
    tetherMaxLength: number | null;
    /** The death handling already ran (guards a double `unit_died`). */
    resolved: boolean;
}

export const NODE_TREE_COMPONENT = defineUnitComponent<NodeTreeState, NodeTreeOptions>({
    id: 'nodeTree',
    create: () => ({ parentId: null, childIds: [], tetherMaxLength: null, resolved: false }),
    toJSON: (state) => ({
        ...(state.parentId !== null ? { nodeParentId: state.parentId } : {}),
        ...(state.childIds.length > 0 ? { nodeChildIds: [...state.childIds] } : {}),
        ...(state.tetherMaxLength !== null ? { nodeTetherMaxLength: state.tetherMaxLength } : {}),
        ...(state.resolved ? { nodeResolved: true } : {}),
    }),
    fromJSON: (state, data) => {
        state.parentId = typeof data.nodeParentId === 'string' ? data.nodeParentId : null;
        state.childIds = Array.isArray(data.nodeChildIds)
            ? data.nodeChildIds.filter((id): id is string => typeof id === 'string')
            : [];
        state.tetherMaxLength = typeof data.nodeTetherMaxLength === 'number' ? data.nodeTetherMaxLength : null;
        state.resolved = data.nodeResolved === true;
    },
});

export function peekNodeTreeState(unit: Unit): NodeTreeState | undefined {
    return findComponentState(unit, NODE_TREE_COMPONENT);
}

export function nodeTreeOptionsOf(unit: Unit): NodeTreeOptions | undefined {
    return getComponentOptions(unit, NODE_TREE_COMPONENT);
}

export function getNodeParentId(unit: Unit): string | null {
    return peekNodeTreeState(unit)?.parentId ?? null;
}

/** Ids of the living children (a copy). */
export function getNodeChildIds(unit: Unit): string[] {
    return [...(peekNodeTreeState(unit)?.childIds ?? [])];
}

/** True while the unit has a living node child. This is what the `hasLivingChildren` condition reads. */
export function hasLivingChildren(unit: Unit): boolean {
    return (peekNodeTreeState(unit)?.childIds.length ?? 0) > 0;
}

registerFlatReductionCondition(NODE_TREE_HAS_LIVING_CHILDREN, hasLivingChildren);

export interface LinkNodeChildOptions {
    /** Tether the child to the parent with this leash (px between centres). Omit for an untethered link. */
    tetherMaxLength?: number;
}

/**
 * Make `child` a node child of `parent`. To re-parent, `unlinkNodeChild(oldParent, child)` first (units only know
 * ids, so this cannot find the old parent itself).
 */
export function linkNodeChild(parent: Unit, child: Unit, options: LinkNodeChildOptions = {}): void {
    if (parent === child) throw new Error('linkNodeChild: a unit cannot be its own parent');
    const childState = getComponentState(child, NODE_TREE_COMPONENT);
    const parentState = getComponentState(parent, NODE_TREE_COMPONENT);
    childState.parentId = parent.id;
    childState.tetherMaxLength = options.tetherMaxLength ?? null;
    if (!parentState.childIds.includes(child.id)) parentState.childIds.push(child.id);
}

/** Remove a child from its parent's living list without a death (re-parenting, tests). */
export function unlinkNodeChild(parent: Unit, child: Unit): void {
    const parentState = peekNodeTreeState(parent);
    if (parentState) parentState.childIds = parentState.childIds.filter((id) => id !== child.id);
    const childState = peekNodeTreeState(child);
    if (childState && childState.parentId === parent.id) {
        childState.parentId = null;
        childState.tetherMaxLength = null;
    }
}
