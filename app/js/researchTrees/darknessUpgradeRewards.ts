import type { CampaignResourceKey, DarknessUpgradesState } from '../types';
import type { PassiveBonuses } from './types';
import { getNodeLevel, getNodeMaxLevels } from './passiveBonuses';
import { getResearchTree } from './list';
import { DARKNESS_UPGRADES_TREE_ID } from './trees/darkness_upgrades';
import { resolveActiveDarknessUpgrades } from './darknessUpgrades';

type ResourceDelta = Partial<Record<CampaignResourceKey, number>>;

/** One owned Darkness Upgrade's mission bonus reward (already scaled by level). */
export interface DarknessUpgradeRewardEntry {
    nodeId: string;
    title: string;
    rewards: ResourceDelta;
}

/** Display line item for a Darkness Upgrade's contribution to the victory total. */
export interface DarknessUpgradeRewardLineItem {
    nodeId: string;
    title: string;
    delta: ResourceDelta;
}

/** Per-node bonus rewards for the given Darkness Upgrades state. Empty when none owned. */
export function getActiveDarknessUpgradeRewardEntries(
    state: Pick<DarknessUpgradesState, 'researchTrees' | 'researchNodeLevels'> | null | undefined,
): DarknessUpgradeRewardEntry[] {
    const tree = getResearchTree(DARKNESS_UPGRADES_TREE_ID);
    if (!state || !tree) return [];
    const out: DarknessUpgradeRewardEntry[] = [];
    for (const node of tree.nodes) {
        if (!node.bonusRewards) continue;
        const level = getNodeLevel(tree.id, node.id, state.researchTrees, state.researchNodeLevels);
        if (level <= 0) continue;
        const maxLevels = getNodeMaxLevels(node);
        const rewards: ResourceDelta = {};
        for (const [key, amount] of Object.entries(node.bonusRewards) as Array<[CampaignResourceKey, number]>) {
            const scaled = Math.floor((amount * level) / maxLevels);
            if (scaled !== 0) rewards[key] = scaled;
        }
        if (Object.keys(rewards).length > 0) out.push({ nodeId: node.id, title: node.title, rewards });
    }
    return out;
}

/**
 * Reward entries for the host's active upgrade node ids (as carried in engine state), so every human
 * player - not just the host - receives the same bonus. Nodes are treated as owned at their default level.
 */
export function getDarknessUpgradeRewardEntriesForNodeIds(
    nodeIds: readonly string[] | null | undefined,
): DarknessUpgradeRewardEntry[] {
    if (!nodeIds || nodeIds.length === 0) return [];
    return getActiveDarknessUpgradeRewardEntries({
        researchTrees: { [DARKNESS_UPGRADES_TREE_ID]: [...nodeIds] },
        researchNodeLevels: {},
    });
}

/**
 * Folds active upgrade bonus rewards into the mission resource delta. Victory only; pure (never mutates inputs).
 * Defeat or no active upgrades returns the input delta unchanged with no line items.
 */
export function mergeDarknessUpgradeRewards(
    resourceDelta: ResourceDelta | undefined,
    activeUpgradeRewards: readonly DarknessUpgradeRewardEntry[],
    victory: boolean,
): { resourceDelta: ResourceDelta | undefined; lineItems: DarknessUpgradeRewardLineItem[] } {
    if (!victory || activeUpgradeRewards.length === 0) return { resourceDelta, lineItems: [] };
    const merged: ResourceDelta = { ...(resourceDelta ?? {}) };
    const lineItems: DarknessUpgradeRewardLineItem[] = [];
    for (const entry of activeUpgradeRewards) {
        const delta: ResourceDelta = {};
        for (const [key, amount] of Object.entries(entry.rewards) as Array<[CampaignResourceKey, number]>) {
            if (!amount) continue;
            delta[key] = amount;
            merged[key] = (merged[key] ?? 0) + amount;
        }
        if (Object.keys(delta).length > 0) lineItems.push({ nodeId: entry.nodeId, title: entry.title, delta });
    }
    if (lineItems.length === 0) return { resourceDelta, lineItems };
    return { resourceDelta: merged, lineItems };
}

/** Short text for a victory-modal line, e.g. "+2 each resource" or "+2 wood, +1 stone". */
export function describeDarknessUpgradeDelta(delta: ResourceDelta): string {
    const entries = Object.entries(delta).filter(([, v]) => v != null && v !== 0) as Array<[string, number]>;
    if (entries.length === 0) return '';
    if (entries.length > 1 && entries.every(([, v]) => v === entries[0][1])) {
        return `${entries[0][1] > 0 ? '+' : ''}${entries[0][1]} each resource`;
    }
    return entries.map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${k}`).join(', ');
}

/**
 * Bag to pass to `runBattleBootstrap` / `BattleSession.load` for this client.
 * Host: resolves from its own campaign `darknessUpgrades` (via the host-only resolver).
 * Non-host: `undefined` so the load falls back to the bag stored in the host's initial snapshot.
 */
export function resolveBattleDarknessUpgradeBonuses(params: {
    isHost: boolean;
    playerId: string;
    players: Record<string, { isHost?: boolean }>;
    localDarknessUpgrades: DarknessUpgradesState | undefined;
}): PassiveBonuses | undefined {
    return resolveBattleDarknessUpgrades(params)?.bonuses;
}

/** Like `resolveBattleDarknessUpgradeBonuses` but also returns the active node ids (host only; else undefined). */
export function resolveBattleDarknessUpgrades(params: {
    isHost: boolean;
    playerId: string;
    players: Record<string, { isHost?: boolean }>;
    localDarknessUpgrades: DarknessUpgradesState | undefined;
}): { bonuses: PassiveBonuses; activeNodeIds: string[] } | undefined {
    if (!params.isHost) return undefined;
    // The local client is the host; make sure the resolver sees it as such even if the roster lags.
    const players = { ...params.players, [params.playerId]: { ...params.players[params.playerId], isHost: true } };
    return resolveActiveDarknessUpgrades({
        players,
        darknessUpgradesByPlayer: { [params.playerId]: params.localDarknessUpgrades },
    });
}
