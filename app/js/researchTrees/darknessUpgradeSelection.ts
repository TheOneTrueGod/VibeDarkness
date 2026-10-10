import type { DarknessUpgradesState } from '../types';
import { getNodeLevel } from './passiveBonuses';
import { getResearchTree } from './list';
import { DARKNESS_UPGRADES_TREE_ID } from './trees/darkness_upgrades';

/**
 * Which of the host's owned Darkness Upgrades ("modifiers") are applied to a mission, and how many a
 * mission allows. Ownership lives in `DarknessUpgradesState`; the last chosen set lives in its
 * `selectedNodeIds` (absent = every owned upgrade).
 */

export interface DarknessUpgradeLimits {
    min: number;
    /** `Infinity` when the mission sets no cap. */
    max: number;
}

export type DarknessUpgradeSelectionCheck = { valid: true } | { valid: false; reason: string };

/** Mission limits with defaults: no minimum, no cap. */
export function getMissionDarknessUpgradeLimits(
    def: { minimumDarknessUpgrades?: number; maximumDarknessUpgrades?: number } | null | undefined,
): DarknessUpgradeLimits {
    const min = def?.minimumDarknessUpgrades;
    const max = def?.maximumDarknessUpgrades;
    return {
        min: typeof min === 'number' && min > 0 ? Math.floor(min) : 0,
        max: typeof max === 'number' && max >= 0 ? Math.floor(max) : Infinity,
    };
}

/** Owned (level > 0) upgrade node ids, in tree order. */
export function getOwnedDarknessUpgradeNodeIds(
    state: Pick<DarknessUpgradesState, 'researchTrees' | 'researchNodeLevels'> | null | undefined,
): string[] {
    const tree = getResearchTree(DARKNESS_UPGRADES_TREE_ID);
    if (!state || !tree) return [];
    return tree.nodes
        .filter((n) => getNodeLevel(tree.id, n.id, state.researchTrees, state.researchNodeLevels) > 0)
        .map((n) => n.id);
}

/** Owned upgrades the player has selected (all owned when no selection was ever stored). */
export function getSelectedDarknessUpgradeNodeIds(state: DarknessUpgradesState | null | undefined): string[] {
    const owned = getOwnedDarknessUpgradeNodeIds(state);
    const stored = state?.selectedNodeIds;
    if (!stored) return owned;
    const chosen = new Set(stored);
    return owned.filter((id) => chosen.has(id));
}

/** The "Edit Modifiers" button is only offered when something can be chosen and the mission allows any. */
export function shouldShowDarknessModifiersButton(ownedCount: number, limits: DarknessUpgradeLimits): boolean {
    return ownedCount > 0 && limits.max > 0;
}

/**
 * Whether `selectedCount` of `ownedCount` upgrades may start the mission. The minimum is waived down to
 * what the player owns (owning 1 of a required 2 is satisfied by selecting that 1).
 */
export function validateDarknessUpgradeSelection(
    selectedCount: number,
    ownedCount: number,
    limits: DarknessUpgradeLimits,
): DarknessUpgradeSelectionCheck {
    if (selectedCount > limits.max) {
        const extra = selectedCount - limits.max;
        return {
            valid: false,
            reason: `Too many modifiers selected: this mission allows at most ${limits.max}. Deselect ${extra} more.`,
        };
    }
    const effectiveMin = Math.min(limits.min, ownedCount);
    if (selectedCount < effectiveMin) {
        return {
            valid: false,
            reason: `Not enough modifiers selected: this mission requires at least ${effectiveMin}. Select ${effectiveMin - selectedCount} more.`,
        };
    }
    return { valid: true };
}

/** Pure: state with its stored selection replaced. */
export function withSelectedDarknessUpgrades(
    state: DarknessUpgradesState,
    selectedNodeIds: readonly string[],
): DarknessUpgradesState {
    return { ...state, selectedNodeIds: [...selectedNodeIds] };
}

/**
 * Pure: keeps only the selected owned upgrades, trimmed to `maximum` (tree order) so a stale or
 * hand-edited selection can never exceed the mission cap. Other state is untouched.
 */
export function filterDarknessUpgradesBySelection(
    state: DarknessUpgradesState | undefined,
    maximum: number = Infinity,
): DarknessUpgradesState | undefined {
    if (!state) return state;
    const selected = getSelectedDarknessUpgradeNodeIds(state).slice(0, Math.max(0, maximum));
    const keep = new Set(selected);
    const owned = getOwnedDarknessUpgradeNodeIds(state);
    const blocked = owned.filter((id) => !keep.has(id));
    if (blocked.length === 0) return state;
    const id = DARKNESS_UPGRADES_TREE_ID;
    const omit = <T,>(map: Record<string, T> | undefined) =>
        Object.fromEntries(Object.entries(map ?? {}).filter(([k]) => !blocked.includes(k)));
    return {
        ...state,
        researchTrees: {
            ...state.researchTrees,
            [id]: (state.researchTrees[id] ?? []).filter((n) => !blocked.includes(n)),
        },
        researchNodeLevels: { ...state.researchNodeLevels, [id]: omit(state.researchNodeLevels[id]) },
        researchNodeSources: { ...state.researchNodeSources, [id]: omit(state.researchNodeSources[id]) },
    };
}
