/**
 * Aggregates passive research node bonuses into a character `passiveBonuses` bag.
 * Values are determined from research at mission start / Stat Bonuses UI — not persisted.
 */

import { RESEARCH_TREES } from './list';
import type {
    PassiveBonusEntry,
    PassiveBonuses,
    PassiveStatKey,
    ResearchNodeDef,
    ResearchNodeLevels,
} from './types';

/** Default maximum levels when `node.levels` is omitted (binary unlock). */
export const DEFAULT_RESEARCH_NODE_LEVELS = 1;

/** Neutral mult when no passive mult bonuses apply. */
export const DEFAULT_PASSIVE_MULT = 1;

/**
 * Max purchasable levels for a node. Binary nodes (no `levels`) are treated as 1.
 */
export function getNodeMaxLevels(node: ResearchNodeDef): number {
    const max = node.levels ?? DEFAULT_RESEARCH_NODE_LEVELS;
    return max >= DEFAULT_RESEARCH_NODE_LEVELS ? max : DEFAULT_RESEARCH_NODE_LEVELS;
}

/**
 * Current purchased level for a node.
 * Binary / first unlock: presence in `researchTrees` counts as level 1 when levels map is missing.
 * Leveled nodes: prefer `researchNodeLevels`, fall back to 1 if present in the researched list.
 */
export function getNodeLevel(
    treeId: string,
    nodeId: string,
    researchTrees: Record<string, string[]> | undefined,
    researchNodeLevels: ResearchNodeLevels | undefined,
): number {
    const fromLevels = researchNodeLevels?.[treeId]?.[nodeId];
    if (typeof fromLevels === 'number' && Number.isFinite(fromLevels) && fromLevels > 0) {
        return Math.floor(fromLevels);
    }
    const list = researchTrees?.[treeId] ?? [];
    return list.includes(nodeId) ? DEFAULT_RESEARCH_NODE_LEVELS : 0;
}

/** True when the node can still be leveled up (under max). */
export function canLevelUpNode(
    node: ResearchNodeDef,
    treeId: string,
    researchTrees: Record<string, string[]> | undefined,
    researchNodeLevels: ResearchNodeLevels | undefined,
): boolean {
    const current = getNodeLevel(treeId, node.id, researchTrees, researchNodeLevels);
    return current < getNodeMaxLevels(node);
}

/**
 * Per-level add contribution for display / application (floored).
 * E.g. maxAdd 50 over 5 levels → 10 per level.
 */
export function getPerLevelAdd(maxAdd: number, maxLevels: number): number {
    if (maxLevels <= 0) return 0;
    return Math.floor(maxAdd / maxLevels);
}

/**
 * Floored add contribution at the given purchased level.
 */
export function getAddAtLevel(maxAdd: number, level: number, maxLevels: number): number {
    if (maxLevels <= 0 || level <= 0) return 0;
    return Math.floor((maxAdd * level) / maxLevels);
}

/**
 * Mult-bonus (amount above 1.0) at the given purchased level.
 * E.g. maxMult 2 over 5 levels at L=1 → 0.2 (final mult = 1.2).
 */
export function getMultBonusAtLevel(maxMult: number, level: number, maxLevels: number): number {
    if (maxLevels <= 0 || level <= 0) return 0;
    return ((maxMult - DEFAULT_PASSIVE_MULT) * level) / maxLevels;
}

function ensureEntry(result: PassiveBonuses, key: PassiveStatKey): { add: number; mult: number } {
    const existing = result[key];
    if (existing) return existing;
    const created = { add: 0, mult: DEFAULT_PASSIVE_MULT };
    result[key] = created;
    return created;
}

function contributeEntry(
    result: PassiveBonuses,
    key: PassiveStatKey,
    entry: PassiveBonusEntry,
    level: number,
    maxLevels: number,
): void {
    const bag = ensureEntry(result, key);
    if (entry.add !== undefined) {
        bag.add += getAddAtLevel(entry.add, level, maxLevels);
    }
    if (entry.mult !== undefined) {
        // Additive mult stacking across nodes: store running sum of (mult-1), apply as 1+sum.
        bag.mult += getMultBonusAtLevel(entry.mult, level, maxLevels);
    }
}

/**
 * Aggregate passive bonuses from all researched nodes (respecting levels).
 * Empty bag keys are omitted; only stats with non-zero add or non-default mult are kept.
 */
export function computePassiveBonuses(
    researchTrees: Record<string, string[]> | undefined,
    researchNodeLevels?: ResearchNodeLevels,
): PassiveBonuses {
    const result: PassiveBonuses = {};

    for (const tree of RESEARCH_TREES) {
        for (const node of tree.nodes) {
            if (!node.passiveBonus) continue;
            const level = getNodeLevel(tree.id, node.id, researchTrees, researchNodeLevels);
            if (level <= 0) continue;
            const maxLevels = getNodeMaxLevels(node);
            for (const [rawKey, entry] of Object.entries(node.passiveBonus)) {
                if (!entry) continue;
                contributeEntry(result, rawKey as PassiveStatKey, entry, level, maxLevels);
            }
        }
    }

    // Drop keys that ended up as zero contribution.
    for (const key of Object.keys(result) as PassiveStatKey[]) {
        const entry = result[key];
        if (!entry) continue;
        if (entry.add === 0 && entry.mult === DEFAULT_PASSIVE_MULT) {
            delete result[key];
        }
    }

    return result;
}

/**
 * Apply add+mult to a base numeric stat. Integer results are floored.
 */
export function applyPassiveBonusToBase(
    base: number,
    entry: { add: number; mult: number } | undefined,
): number {
    if (!entry) return Math.floor(base);
    return Math.floor((base + entry.add) * entry.mult);
}

/**
 * Rows suitable for the Stat Bonuses tab: only non-zero contributions.
 */
export function getNonZeroPassiveBonusRows(
    bonuses: PassiveBonuses,
): Array<{ key: PassiveStatKey; add: number; mult: number }> {
    const rows: Array<{ key: PassiveStatKey; add: number; mult: number }> = [];
    for (const [key, entry] of Object.entries(bonuses) as Array<
        [PassiveStatKey, { add: number; mult: number }]
    >) {
        if (!entry) continue;
        if (entry.add === 0 && entry.mult === DEFAULT_PASSIVE_MULT) continue;
        rows.push({ key, add: entry.add, mult: entry.mult });
    }
    return rows.sort((a, b) => a.key.localeCompare(b.key));
}
