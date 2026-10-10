import { describe, expect, it } from 'vitest';
import { grantDarknessUpgradeNode, revokeDarknessUpgradeNode } from './darknessUpgrades';
import { DARKNESS_UPGRADES_TREE_ID } from './trees/darkness_upgrades';
import { getResearchTree } from './list';
import {
    filterDarknessUpgradesBySelection,
    getMissionDarknessUpgradeLimits,
    getOwnedDarknessUpgradeNodeIds,
    getSelectedDarknessUpgradeNodeIds,
    shouldShowDarknessModifiersButton,
    validateDarknessUpgradeSelection,
    withSelectedDarknessUpgrades,
} from './darknessUpgradeSelection';

const nodeIds = (getResearchTree(DARKNESS_UPGRADES_TREE_ID)?.nodes ?? []).map((n) => n.id);
const [nodeA] = nodeIds;

describe('darknessUpgradeSelection', () => {
    it('defaults limits to no minimum and no cap', () => {
        expect(getMissionDarknessUpgradeLimits(undefined)).toEqual({ min: 0, max: Infinity });
        expect(getMissionDarknessUpgradeLimits({ minimumDarknessUpgrades: 2, maximumDarknessUpgrades: 0 })).toEqual({
            min: 2,
            max: 0,
        });
    });

    it('shows the button only with owned upgrades and a max above 0', () => {
        expect(shouldShowDarknessModifiersButton(0, { min: 0, max: 3 })).toBe(false);
        expect(shouldShowDarknessModifiersButton(2, { min: 0, max: 0 })).toBe(false);
        expect(shouldShowDarknessModifiersButton(2, { min: 0, max: 3 })).toBe(true);
        expect(shouldShowDarknessModifiersButton(2, { min: 0, max: Infinity })).toBe(true);
    });

    it('rejects too many and too few selections, with a reason', () => {
        const limits = { min: 2, max: 3 };
        expect(validateDarknessUpgradeSelection(4, 5, limits)).toMatchObject({ valid: false });
        expect(validateDarknessUpgradeSelection(1, 5, limits)).toMatchObject({ valid: false });
        expect(validateDarknessUpgradeSelection(2, 5, limits)).toEqual({ valid: true });
        expect(validateDarknessUpgradeSelection(3, 5, limits)).toEqual({ valid: true });
    });

    it('waives the minimum down to the number owned', () => {
        expect(validateDarknessUpgradeSelection(1, 1, { min: 2, max: 3 })).toEqual({ valid: true });
        expect(validateDarknessUpgradeSelection(0, 1, { min: 2, max: 3 })).toMatchObject({ valid: false });
    });

    it('treats an absent stored selection as every owned upgrade', () => {
        const state = grantDarknessUpgradeNode(undefined, nodeA);
        expect(getOwnedDarknessUpgradeNodeIds(state)).toEqual([nodeA]);
        expect(getSelectedDarknessUpgradeNodeIds(state)).toEqual([nodeA]);
        expect(getSelectedDarknessUpgradeNodeIds(withSelectedDarknessUpgrades(state, []))).toEqual([]);
    });

    it('filters deselected upgrades out of the applied state', () => {
        const owned = grantDarknessUpgradeNode(undefined, nodeA);
        const none = filterDarknessUpgradesBySelection(withSelectedDarknessUpgrades(owned, []));
        expect(getOwnedDarknessUpgradeNodeIds(none)).toEqual([]);
        expect(filterDarknessUpgradesBySelection(owned)).toBe(owned);
    });

    it('trims the applied set to the mission maximum', () => {
        const owned = grantDarknessUpgradeNode(undefined, nodeA);
        expect(getOwnedDarknessUpgradeNodeIds(filterDarknessUpgradesBySelection(owned, 0))).toEqual([]);
    });

    it('keeps the stored selection through grant and drops revoked nodes from it', () => {
        const owned = withSelectedDarknessUpgrades(grantDarknessUpgradeNode(undefined, nodeA), [nodeA]);
        expect(grantDarknessUpgradeNode(owned, nodeA).selectedNodeIds).toEqual([nodeA]);
        expect(revokeDarknessUpgradeNode(owned, nodeA).selectedNodeIds).toEqual([]);
    });
});
