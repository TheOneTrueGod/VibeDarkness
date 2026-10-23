import { describe, expect, it } from 'vitest';
import {
    collectDarknessUpgradeBonusRewards,
    computeDarknessUpgradeBonuses,
    DARKNESS_UPGRADES_TREE_ID,
    isDarknessUpgradeTree,
} from './darknessUpgrades';
import { computePassiveBonuses } from './passiveBonuses';
import { DARKNESS_UPGRADE_NODE_EMPOWERED_SPIRITS, DARKNESS_UPGRADE_REWARD_RESOURCE_KEYS } from './trees/darkness_upgrades';
import { EMPTY_DARKNESS_UPGRADES } from '../types';

const OWNED = {
    researchTrees: { [DARKNESS_UPGRADES_TREE_ID]: [DARKNESS_UPGRADE_NODE_EMPOWERED_SPIRITS] },
    researchNodeLevels: {},
};

describe('darknessUpgrades', () => {
    it('identifies the tree', () => {
        expect(isDarknessUpgradeTree('darkness_upgrades')).toBe(true);
        expect(isDarknessUpgradeTree('light')).toBe(false);
    });

    it('computeDarknessUpgradeBonuses returns slime bonuses when owned, {} otherwise', () => {
        const bonuses = computeDarknessUpgradeBonuses(OWNED);
        expect(bonuses.enemy_unit_slime_max_health_bonus?.add).toBe(12);
        expect(bonuses.enemy_unit_slime_extra_projectiles?.add).toBe(2);
        expect(computeDarknessUpgradeBonuses(EMPTY_DARKNESS_UPGRADES)).toEqual({});
        expect(computeDarknessUpgradeBonuses(undefined)).toEqual({});
    });

    it('character computePassiveBonuses ignores the darkness tree even if present in character storage', () => {
        expect(computePassiveBonuses({})).toEqual({});
        expect(computePassiveBonuses(OWNED.researchTrees, OWNED.researchNodeLevels)).toEqual({});
    });

    it('collectDarknessUpgradeBonusRewards gives 2 of each resource when owned, {} otherwise', () => {
        const rewards = collectDarknessUpgradeBonusRewards(OWNED);
        expect(DARKNESS_UPGRADE_REWARD_RESOURCE_KEYS.length).toBeGreaterThan(0);
        for (const key of DARKNESS_UPGRADE_REWARD_RESOURCE_KEYS) expect(rewards[key]).toBe(2);
        expect(rewards.hunger).toBeUndefined();
        expect(collectDarknessUpgradeBonusRewards(EMPTY_DARKNESS_UPGRADES)).toEqual({});
    });
});
