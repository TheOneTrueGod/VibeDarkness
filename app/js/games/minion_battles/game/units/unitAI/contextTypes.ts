/**
 * UnitAIContext type system.
 *
 * Each AI tree defines its own context interface (in its folder's context.ts).
 * UnitAIContext is a discriminated union keyed on `aiTree`.
 */

export type { UnitAIContextBase } from './contextBase';

import type { UnitAIContextBase } from './contextBase';
import type { DefaultAITreeContext } from './default/context';
import type { AlphaWolfBossAITreeContext } from './alphaWolfBoss/context';
import type { AggroWanderAITreeContext } from './aggroWander/context';

/** Maps tree IDs to their typed context shape. Extend when adding a new tree. */
export interface AITreeContextMap {
    default: DefaultAITreeContext;
    alphaWolfBoss: AlphaWolfBossAITreeContext;
    aggroWander: AggroWanderAITreeContext;
}

export type AITreeId = keyof AITreeContextMap;

/** Uninitialized context (before first AI tick or for non-AI units). */
export interface UnitAIContextUninitialized extends UnitAIContextBase {
    aiTree?: undefined;
}

/** Discriminated union of all tree contexts + uninitialized fallback. */
export type UnitAIContext = AITreeContextMap[AITreeId] | UnitAIContextUninitialized;

/**
 * Initialize or narrow a unit's AI context for a specific tree.
 * Preserves shared fields (aiState, targetUnitId) when switching.
 */
export function initTreeContext<K extends AITreeId>(
    treeId: K,
    existing?: UnitAIContext,
): AITreeContextMap[K] {
    return { ...existing, aiTree: treeId } as AITreeContextMap[K];
}
