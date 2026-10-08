import type { CampaignResourceKey, DarknessUpgradesState } from '../types';
import { getNodeLevel, getNodeMaxLevels, computePassiveBonuses } from './passiveBonuses';
import { getResearchTree } from './list';
import { DARKNESS_UPGRADES_TREE_ID } from './trees/darkness_upgrades';
import { getNodeResearchSources } from './researchSources';
import { ResearchSource, type PassiveBonuses, type ResearchNodeLevels, type ResearchNodeSources } from './types';

export { DARKNESS_UPGRADES_TREE_ID };

export function isDarknessUpgradeTree(treeId: string): boolean {
    return treeId === DARKNESS_UPGRADES_TREE_ID;
}

/** Only admins may see or interact with the Darkness Upgrades tree. */
export function canInteractWithDarknessUpgradeTree(isAdmin: boolean): boolean {
    return isAdmin === true;
}

function emptyState(): DarknessUpgradesState {
    return { researchTrees: {}, researchNodeLevels: {}, researchNodeSources: {} };
}

/** Grant one level of a darkness upgrade node (pure; never mutates input). Source defaults to Admin. */
export function grantDarknessUpgradeNode(
    state: DarknessUpgradesState | undefined,
    nodeId: string,
    source: ResearchSource = ResearchSource.Admin,
): DarknessUpgradesState {
    const base = state ?? emptyState();
    const tree = getResearchTree(DARKNESS_UPGRADES_TREE_ID);
    const node = tree?.nodes.find((n) => n.id === nodeId);
    if (!node) return base;
    const level = getNodeLevel(DARKNESS_UPGRADES_TREE_ID, nodeId, base.researchTrees, base.researchNodeLevels);
    const maxLevels = getNodeMaxLevels(node);
    if (level >= maxLevels) return base;

    const owned = base.researchTrees[DARKNESS_UPGRADES_TREE_ID] ?? [];
    const nextOwned = owned.includes(nodeId) ? [...owned] : [...owned, nodeId];
    const nextLevel = level + 1;
    const prevSources = getNodeResearchSources(
        DARKNESS_UPGRADES_TREE_ID,
        nodeId,
        base.researchTrees,
        base.researchNodeLevels,
        base.researchNodeSources,
    );
    const researchNodeLevels: ResearchNodeLevels = {
        ...base.researchNodeLevels,
        [DARKNESS_UPGRADES_TREE_ID]: {
            ...(base.researchNodeLevels[DARKNESS_UPGRADES_TREE_ID] ?? {}),
            ...(maxLevels > 1 ? { [nodeId]: nextLevel } : {}),
        },
    };
    if (Object.keys(researchNodeLevels[DARKNESS_UPGRADES_TREE_ID]).length === 0) {
        delete researchNodeLevels[DARKNESS_UPGRADES_TREE_ID];
    }
    return {
        researchTrees: { ...base.researchTrees, [DARKNESS_UPGRADES_TREE_ID]: nextOwned },
        researchNodeLevels,
        researchNodeSources: {
            ...base.researchNodeSources,
            [DARKNESS_UPGRADES_TREE_ID]: {
                ...(base.researchNodeSources[DARKNESS_UPGRADES_TREE_ID] ?? {}),
                [nodeId]: [...prevSources, source],
            },
        },
    };
}

/** Fully removes a darkness upgrade node (all levels), cleaning empty entries. Pure. */
export function revokeDarknessUpgradeNode(
    state: DarknessUpgradesState | undefined,
    nodeId: string,
): DarknessUpgradesState {
    const base = state ?? emptyState();
    const researchTrees: Record<string, string[]> = { ...base.researchTrees };
    const researchNodeLevels: ResearchNodeLevels = { ...base.researchNodeLevels };
    const researchNodeSources: ResearchNodeSources = { ...base.researchNodeSources };

    const remaining = (researchTrees[DARKNESS_UPGRADES_TREE_ID] ?? []).filter((id) => id !== nodeId);
    researchTrees[DARKNESS_UPGRADES_TREE_ID] = remaining;

    for (const map of [researchNodeLevels, researchNodeSources] as Array<Record<string, Record<string, unknown>>>) {
        const treeMap = map[DARKNESS_UPGRADES_TREE_ID];
        if (!treeMap) continue;
        const { [nodeId]: _removed, ...rest } = treeMap;
        if (Object.keys(rest).length === 0) delete map[DARKNESS_UPGRADES_TREE_ID];
        else map[DARKNESS_UPGRADES_TREE_ID] = rest;
    }
    return { researchTrees, researchNodeLevels, researchNodeSources };
}

/**
 * Research-UI view of ownership: the character's own research with the Darkness Upgrades tree's
 * entries replaced by the player's `darknessUpgrades` (character-owned darkness data is ignored).
 * Used only for display/eligibility; never persisted.
 */
export function mergeDarknessUpgradesIntoResearchView(
    researchTrees: Record<string, string[]>,
    researchNodeLevels: ResearchNodeLevels | undefined,
    researchSources: ResearchNodeSources | undefined,
    darknessUpgrades: DarknessUpgradesState | undefined,
): { researchTrees: Record<string, string[]>; researchNodeLevels: ResearchNodeLevels; researchSources: ResearchNodeSources } {
    const id = DARKNESS_UPGRADES_TREE_ID;
    const levels: ResearchNodeLevels = { ...(researchNodeLevels ?? {}) };
    const sources: ResearchNodeSources = { ...(researchSources ?? {}) };
    delete levels[id];
    delete sources[id];
    if (darknessUpgrades?.researchNodeLevels?.[id]) levels[id] = darknessUpgrades.researchNodeLevels[id];
    if (darknessUpgrades?.researchNodeSources?.[id]) sources[id] = darknessUpgrades.researchNodeSources[id];
    return {
        researchTrees: { ...researchTrees, [id]: [...(darknessUpgrades?.researchTrees?.[id] ?? [])] },
        researchNodeLevels: levels,
        researchSources: sources,
    };
}

/** Aggregate passive bonuses from the player's owned darkness upgrades only. */
export function computeDarknessUpgradeBonuses(
    state: Pick<DarknessUpgradesState, 'researchTrees' | 'researchNodeLevels'> | undefined,
): PassiveBonuses {
    if (!state) return {};
    return computePassiveBonuses(state.researchTrees, state.researchNodeLevels, isDarknessUpgradeTree);
}

/** Sum `bonusRewards` of owned darkness upgrade nodes (scaled by level / max levels, floored). */
export function collectDarknessUpgradeBonusRewards(
    state: Pick<DarknessUpgradesState, 'researchTrees' | 'researchNodeLevels'> | undefined,
): Partial<Record<CampaignResourceKey, number>> {
    const out: Partial<Record<CampaignResourceKey, number>> = {};
    const tree = getResearchTree(DARKNESS_UPGRADES_TREE_ID);
    if (!state || !tree) return out;
    for (const node of tree.nodes) {
        if (!node.bonusRewards) continue;
        const level = getNodeLevel(tree.id, node.id, state.researchTrees, state.researchNodeLevels);
        if (level <= 0) continue;
        const maxLevels = getNodeMaxLevels(node);
        for (const [key, amount] of Object.entries(node.bonusRewards) as Array<[CampaignResourceKey, number]>) {
            const scaled = Math.floor((amount * level) / maxLevels);
            if (scaled === 0) continue;
            out[key] = (out[key] ?? 0) + scaled;
        }
    }
    return out;
}

/** Lobby slice needed to decide whose Darkness Upgrades apply to a battle. */
export interface DarknessUpgradesLobby {
    players: Record<string, { isHost?: boolean }>;
    /** Per-player `darknessUpgrades` (campaign-owner data), keyed by player id. */
    darknessUpgradesByPlayer: Record<string, DarknessUpgradesState | undefined>;
}

export interface ResolvedDarknessUpgrades {
    /** Aggregated passive bonuses to install on the engine (`engine.darknessUpgradeBonuses`). */
    bonuses: PassiveBonuses;
    /** Owned (level > 0) upgrade node ids of the host, for reward display / Step 8. */
    activeNodeIds: string[];
    /** The host's raw state (null when no host or no data). */
    state: DarknessUpgradesState | null;
    hostPlayerId: string | null;
}

/**
 * Resolves which Darkness Upgrades are active for a battle.
 * Only the host's upgrades count (host = the player with `PlayerState.isHost`) -
 * change here to alter policy.
 */
export function resolveActiveDarknessUpgrades(lobby: DarknessUpgradesLobby): ResolvedDarknessUpgrades {
    const hostPlayerId = Object.entries(lobby.players).find(([, p]) => p?.isHost === true)?.[0] ?? null;
    const state = (hostPlayerId != null ? lobby.darknessUpgradesByPlayer[hostPlayerId] : undefined) ?? null;
    const tree = getResearchTree(DARKNESS_UPGRADES_TREE_ID);
    const activeNodeIds = !state || !tree
        ? []
        : tree.nodes
              .filter((n) => getNodeLevel(tree.id, n.id, state.researchTrees, state.researchNodeLevels) > 0)
              .map((n) => n.id);
    return { bonuses: computeDarknessUpgradeBonuses(state ?? undefined), activeNodeIds, state, hostPlayerId };
}
