import { describe, it, expect } from 'vitest';
import {
    mergeDarknessUpgradeRewards,
    getActiveDarknessUpgradeRewardEntries,
    resolveBattleDarknessUpgradeBonuses,
    resolveBattleDarknessUpgrades,
    getDarknessUpgradeRewardEntriesForNodeIds,
} from './darknessUpgradeRewards';
import { grantDarknessUpgradeNode } from './darknessUpgrades';
import { DARKNESS_UPGRADE_NODE_EMPOWERED_SPIRITS, DARKNESS_UPGRADE_REWARD_RESOURCE_KEYS } from './trees/darkness_upgrades';
import type { CampaignResourceKey } from '../types';

const owned = grantDarknessUpgradeNode(undefined, 'empowered_spirits');
const keys: CampaignResourceKey[] = DARKNESS_UPGRADE_REWARD_RESOURCE_KEYS;

describe('mergeDarknessUpgradeRewards', () => {
    it('Empowered Spirits yields +2 for every resource key', () => {
        const entries = getActiveDarknessUpgradeRewardEntries(owned);
        expect(entries).toHaveLength(1);
        for (const k of keys) expect(entries[0].rewards[k]).toBe(2);
    });

    it('adds rewards on victory and returns line items', () => {
        const entries = getActiveDarknessUpgradeRewardEntries(owned);
        const { resourceDelta, lineItems } = mergeDarknessUpgradeRewards({ [keys[0]]: 3 }, entries, true);
        expect(resourceDelta?.[keys[0]]).toBe(5);
        for (const k of keys.slice(1)) expect(resourceDelta?.[k]).toBe(2);
        expect(lineItems).toHaveLength(1);
        expect(lineItems[0].nodeId).toBe('empowered_spirits');
        expect(lineItems[0].title).toBe('Empowered Spirits');
        expect(lineItems[0].delta[keys[0]]).toBe(2);
    });

    it('handles an undefined base delta', () => {
        const entries = getActiveDarknessUpgradeRewardEntries(owned);
        const { resourceDelta } = mergeDarknessUpgradeRewards(undefined, entries, true);
        expect(resourceDelta?.[keys[0]]).toBe(2);
    });

    it('returns input unchanged with no line items on defeat', () => {
        const base = { [keys[0]]: 1 };
        const entries = getActiveDarknessUpgradeRewardEntries(owned);
        const out = mergeDarknessUpgradeRewards(base, entries, false);
        expect(out.resourceDelta).toBe(base);
        expect(out.lineItems).toEqual([]);
    });

    it('does not mutate inputs', () => {
        const base = { [keys[0]]: 1 };
        const entries = getActiveDarknessUpgradeRewardEntries(owned);
        const snapshot = JSON.parse(JSON.stringify(entries));
        mergeDarknessUpgradeRewards(base, entries, true);
        expect(base).toEqual({ [keys[0]]: 1 });
        expect(entries).toEqual(snapshot);
    });

    it('is empty when no upgrades are active', () => {
        expect(getActiveDarknessUpgradeRewardEntries(undefined)).toEqual([]);
        const base = { [keys[0]]: 1 };
        const out = mergeDarknessUpgradeRewards(base, [], true);
        expect(out.resourceDelta).toBe(base);
        expect(out.lineItems).toEqual([]);
    });
});

describe('all-players bonus rewards from active node ids', () => {
    const ids = [DARKNESS_UPGRADE_NODE_EMPOWERED_SPIRITS];
    const apply = (nodeIds: string[] | undefined, victory: boolean) =>
        mergeDarknessUpgradeRewards({ vigor: 1 }, getDarknessUpgradeRewardEntriesForNodeIds(nodeIds), victory);

    it('a non-host receives the same reward as the host from the same active ids', () => {
        const host = apply(ids, true);
        const nonHost = apply([...ids], true);
        expect(nonHost).toEqual(host);
        expect(nonHost.resourceDelta?.vigor).toBe(3);
        expect(nonHost.lineItems).toHaveLength(1);
    });
    it('empty or missing ids give no reward', () => {
        expect(apply([], true).lineItems).toEqual([]);
        expect(apply(undefined, true).resourceDelta).toEqual({ vigor: 1 });
        expect(apply(['unknown_node'], true).lineItems).toEqual([]);
    });
    it('defeat gives no reward', () => {
        expect(apply(ids, false)).toEqual({ resourceDelta: { vigor: 1 }, lineItems: [] });
    });
});

describe('resolveBattleDarknessUpgrades', () => {
    const players = { h: { isHost: true }, g: { isHost: false } };
    it('host returns bonuses and active node ids; non-host returns undefined', () => {
        const host = resolveBattleDarknessUpgrades({ isHost: true, playerId: 'h', players, localDarknessUpgrades: owned });
        expect(host?.activeNodeIds).toEqual([DARKNESS_UPGRADE_NODE_EMPOWERED_SPIRITS]);
        expect(
            resolveBattleDarknessUpgrades({ isHost: false, playerId: 'g', players, localDarknessUpgrades: owned }),
        ).toBeUndefined();
    });
});

describe('resolveBattleDarknessUpgradeBonuses', () => {
    const players = { h: { isHost: true }, g: { isHost: false } };
    it('host gets its own bag', () => {
        const bag = resolveBattleDarknessUpgradeBonuses({
            isHost: true,
            playerId: 'h',
            players,
            localDarknessUpgrades: owned,
        });
        expect(bag?.enemy_unit_slime_extra_projectiles?.add).toBe(2);
    });
    it('non-host returns undefined (uses host snapshot), even if it owns the upgrade', () => {
        expect(
            resolveBattleDarknessUpgradeBonuses({
                isHost: false,
                playerId: 'g',
                players,
                localDarknessUpgrades: owned,
            }),
        ).toBeUndefined();
    });
    it('host without upgrades gets empty bag', () => {
        expect(
            resolveBattleDarknessUpgradeBonuses({
                isHost: true,
                playerId: 'h',
                players,
                localDarknessUpgrades: undefined,
            }),
        ).toEqual({});
    });
});
