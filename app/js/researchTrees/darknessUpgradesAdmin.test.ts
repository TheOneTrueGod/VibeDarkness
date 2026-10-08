import { describe, expect, it } from 'vitest';
import {
    canInteractWithDarknessUpgradeTree,
    DARKNESS_UPGRADES_TREE_ID,
    grantDarknessUpgradeNode,
    mergeDarknessUpgradesIntoResearchView,
    revokeDarknessUpgradeNode,
} from './darknessUpgrades';
import { computeDarknessUpgradeBonuses } from './darknessUpgrades';
import { DARKNESS_UPGRADE_NODE_EMPOWERED_SPIRITS as NODE } from './trees/darkness_upgrades';
import { ResearchSource } from './types';
import { EMPTY_DARKNESS_UPGRADES } from '../types';

describe('darknessUpgrades admin helpers', () => {
    it('grant adds the node and an Admin source without mutating input', () => {
        const next = grantDarknessUpgradeNode(EMPTY_DARKNESS_UPGRADES, NODE);
        expect(next.researchTrees[DARKNESS_UPGRADES_TREE_ID]).toEqual([NODE]);
        expect(next.researchNodeSources[DARKNESS_UPGRADES_TREE_ID][NODE]).toEqual([ResearchSource.Admin]);
        expect(EMPTY_DARKNESS_UPGRADES.researchTrees).toEqual({});
        expect(computeDarknessUpgradeBonuses(next).enemy_unit_slime_max_health_bonus?.add).toBe(12);
    });

    it('grant is a no-op at max level', () => {
        const once = grantDarknessUpgradeNode(EMPTY_DARKNESS_UPGRADES, NODE);
        const twice = grantDarknessUpgradeNode(once, NODE);
        expect(twice).toEqual(once);
    });

    it('revoke removes the node and cleans empty entries', () => {
        const owned = grantDarknessUpgradeNode(EMPTY_DARKNESS_UPGRADES, NODE);
        const next = revokeDarknessUpgradeNode(owned, NODE);
        expect(next.researchTrees[DARKNESS_UPGRADES_TREE_ID] ?? []).toEqual([]);
        expect(next.researchNodeSources[DARKNESS_UPGRADES_TREE_ID]).toBeUndefined();
        expect(next.researchNodeLevels[DARKNESS_UPGRADES_TREE_ID]).toBeUndefined();
        expect(computeDarknessUpgradeBonuses(next)).toEqual({});
    });

    it('only admins can interact with the tree', () => {
        expect(canInteractWithDarknessUpgradeTree(true)).toBe(true);
        expect(canInteractWithDarknessUpgradeTree(false)).toBe(false);
    });

    it('merge overlays darkness data onto the character view, ignoring any character-owned darkness data', () => {
        const owned = grantDarknessUpgradeNode(EMPTY_DARKNESS_UPGRADES, NODE);
        const view = mergeDarknessUpgradesIntoResearchView(
            { light: ['a'], [DARKNESS_UPGRADES_TREE_ID]: ['bogus'] },
            {},
            {},
            owned,
        );
        expect(view.researchTrees.light).toEqual(['a']);
        expect(view.researchTrees[DARKNESS_UPGRADES_TREE_ID]).toEqual([NODE]);
        expect(view.researchSources[DARKNESS_UPGRADES_TREE_ID][NODE]).toEqual([ResearchSource.Admin]);

        const empty = mergeDarknessUpgradesIntoResearchView({ [DARKNESS_UPGRADES_TREE_ID]: ['bogus'] }, {}, {}, undefined);
        expect(empty.researchTrees[DARKNESS_UPGRADES_TREE_ID]).toEqual([]);
    });
});
