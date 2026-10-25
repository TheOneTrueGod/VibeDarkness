import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import type { MinionBattlesApi } from '../../../api/minionBattlesApi';
import type { CharacterUpdates } from '../../../api/types';
import type { AccountState, CampaignState, DarknessUpgradesState } from '../../../../../types';
import { RESEARCH_TREES } from '../../../../../researchTrees/list';
import {
    canAdminGrantResearchNode,
    canResearchNode,
    applyResearchEffects,
    sortNodesDeterministic,
    prereqClosure,
} from '../../../../../researchTrees/evaluator';
import { getNodeMaxLevels } from '../../../../../researchTrees/passiveBonuses';
import { stripResearchBySource } from '../../../../../researchTrees/researchSources';
import {
    canInteractWithDarknessUpgradeTree,
    DARKNESS_UPGRADES_TREE_ID,
    grantDarknessUpgradeNode,
    isDarknessUpgradeTree,
    mergeDarknessUpgradesIntoResearchView,
    revokeDarknessUpgradeNode,
} from '../../../../../researchTrees/darknessUpgrades';
import { ResearchSource, type ResearchNodeSources } from '../../../../../researchTrees/types';
import {
    RESET_ADMIN_RESEARCH_CONFIRM,
    RESET_PURCHASED_RESEARCH_CONFIRM,
    RESEARCH_CLICK_ADMIN,
    RESEARCH_CLICK_PURCHASE,
    canResearchOptionsForClick,
    researchSourceForClick,
} from '../researchNodeGrid';

export function undoReplaceEquippedItemsForRemovedNodes(
    equipment: string[],
    removedNodeIdsByTree: Record<string, string[]>,
): string[] {
    let nextEquipment = [...equipment];
    for (const [treeId, nodeIds] of Object.entries(removedNodeIdsByTree)) {
        const tree = RESEARCH_TREES.find((t) => t.id === treeId);
        if (!tree) continue;
        const researchedSet = new Set(nodeIds);
        const researchedNodes = tree.nodes.filter((n) => researchedSet.has(n.id));
        const ordered = sortNodesDeterministic(researchedNodes);
        for (const node of [...ordered].reverse()) {
            for (const eff of node.effects) {
                if (eff.type !== 'replaceEquippedItem') continue;
                if (nextEquipment.includes(eff.toItemId)) {
                    nextEquipment = nextEquipment.filter((id) => id !== eff.toItemId);
                    if (!nextEquipment.includes(eff.fromItemId)) nextEquipment.push(eff.fromItemId);
                }
            }
        }
    }
    return nextEquipment;
}

export interface UseResearchActionsArgs {
    character: CampaignCharacter;
    api: MinionBattlesApi;
    account: AccountState | null | undefined;
    campaign: CampaignState | null | undefined;
    resolvedCampaign: CampaignState | null | undefined;
    permissionAccount: AccountState | null;
    isAdmin: boolean;
    equipment: string[];
    researchTrees: Record<string, string[]>;
    researchNodeLevels: Record<string, Record<string, number>>;
    researchSources: ResearchNodeSources;
    activeResearchTrees: Record<string, string[]>;
    activeResearchNodeLevels: Record<string, Record<string, number>>;
    viewResearch: ReturnType<typeof mergeDarknessUpgradesIntoResearchView>;
    darknessUpgrades: DarknessUpgradesState;
    name: string;
    selectedPortraitId: string;
    onSaved?: (updated: { equipment: string[]; name: string; portraitId: string }) => void;
    buildEquipmentUpdate: (newEquipment: string[]) => CharacterUpdates;
    setSaving: Dispatch<SetStateAction<boolean>>;
    setDarknessUpgrades: Dispatch<SetStateAction<DarknessUpgradesState>>;
    setLocalCampaign: Dispatch<SetStateAction<CampaignState | null>>;
    setResearchTrees: Dispatch<SetStateAction<Record<string, string[]>>>;
    setResearchNodeLevels: Dispatch<SetStateAction<Record<string, Record<string, number>>>>;
    setResearchSources: Dispatch<SetStateAction<ResearchNodeSources>>;
    setEquipment: Dispatch<SetStateAction<string[]>>;
}

/** Research reset / purchase handlers for the Character Editor's Upgrades tab. */
export function useResearchActions({
    character,
    api,
    account,
    campaign,
    resolvedCampaign,
    permissionAccount,
    isAdmin,
    equipment,
    researchTrees,
    researchNodeLevels,
    researchSources,
    activeResearchTrees,
    activeResearchNodeLevels,
    viewResearch,
    darknessUpgrades,
    name,
    selectedPortraitId,
    onSaved,
    buildEquipmentUpdate,
    setSaving,
    setDarknessUpgrades,
    setLocalCampaign,
    setResearchTrees,
    setResearchNodeLevels,
    setResearchSources,
    setEquipment,
}: UseResearchActionsArgs) {
    const handleResetResearch = useCallback(
        async (treeIdsInput: string[]) => {
            let treeIds = treeIdsInput;
            if (permissionAccount?.role !== 'admin') return;
            if (!treeIds.length) return;
            const treeLabels = treeIds
                .map((id) => RESEARCH_TREES.find((t) => t.id === id)?.title ?? id)
                .join(', ');
            const confirmMsg =
                treeIds.length === 1
                    ? `Reset all research in “${treeLabels}”?`
                    : `Reset all research in these trees: ${treeLabels}?`;
            if (!window.confirm(confirmMsg)) return;

            setSaving(true);
            try {
                if (treeIds.some(isDarknessUpgradeTree)) {
                    const cid = resolvedCampaign?.id;
                    if (cid) {
                        let next = darknessUpgrades;
                        for (const nodeId of darknessUpgrades.researchTrees[DARKNESS_UPGRADES_TREE_ID] ?? []) {
                            next = revokeDarknessUpgradeNode(next, nodeId);
                        }
                        const updatedCampaign = await api.updateCampaignDarknessUpgrades(cid, next);
                        setDarknessUpgrades(updatedCampaign.darknessUpgrades ?? next);
                        if (!campaign) setLocalCampaign(updatedCampaign);
                    }
                    treeIds = treeIds.filter((id) => !isDarknessUpgradeTree(id));
                    if (treeIds.length === 0) return;
                }
                const nextResearchTrees: Record<string, string[]> = { ...researchTrees };
                const nextResearchNodeLevels: Record<string, Record<string, number>> = {
                    ...researchNodeLevels,
                };
                const nextResearchSources: ResearchNodeSources = { ...researchSources };
                const removedNodeIdsByTree: Record<string, string[]> = {};

                for (const treeId of treeIds) {
                    const tree = RESEARCH_TREES.find((t) => t.id === treeId);
                    if (!tree) continue;
                    removedNodeIdsByTree[treeId] = [...(researchTrees[treeId] ?? [])];
                    nextResearchTrees[treeId] = [];
                    delete nextResearchNodeLevels[treeId];
                    delete nextResearchSources[treeId];
                }

                const nextEquipment = undoReplaceEquippedItemsForRemovedNodes(equipment, removedNodeIdsByTree);

                const updatedChar = await api.updateCharacter(character.id, {
                    ...buildEquipmentUpdate(nextEquipment),
                    researchTrees: nextResearchTrees,
                    researchNodeLevels: nextResearchNodeLevels,
                    researchSources: nextResearchSources,
                });

                setResearchTrees(updatedChar.researchTrees ?? nextResearchTrees);
                setResearchNodeLevels(updatedChar.researchNodeLevels ?? nextResearchNodeLevels);
                setResearchSources(updatedChar.researchSources ?? nextResearchSources);
                setEquipment(updatedChar.equipment ?? nextEquipment);
                onSaved?.({ equipment: updatedChar.equipment ?? nextEquipment, name, portraitId: selectedPortraitId });
            } catch (e) {
                console.error('Failed to reset research:', e);
            } finally {
                setSaving(false);
            }
        },
        [character.id, buildEquipmentUpdate, equipment, api, name, permissionAccount?.role, researchTrees, researchNodeLevels, researchSources, selectedPortraitId, onSaved, resolvedCampaign?.id, campaign, darknessUpgrades]
    );

    const handleResetResearchBySource = useCallback(
        async (source: ResearchSource) => {
            if (source === ResearchSource.QuestReward) return;
            if (source === ResearchSource.Admin && permissionAccount?.role !== 'admin') return;
            const confirmMsg =
                source === ResearchSource.Purchased
                    ? RESET_PURCHASED_RESEARCH_CONFIRM
                    : RESET_ADMIN_RESEARCH_CONFIRM;
            if (!window.confirm(confirmMsg)) return;

            setSaving(true);
            try {
                const stripped = stripResearchBySource(
                    researchTrees,
                    researchNodeLevels,
                    researchSources,
                    source,
                );
                const nextEquipment = undoReplaceEquippedItemsForRemovedNodes(
                    equipment,
                    stripped.removedNodeIdsByTree,
                );
                const updatedChar = await api.updateCharacter(character.id, {
                    equipment: nextEquipment,
                    researchTrees: stripped.researchTrees,
                    researchNodeLevels: stripped.researchNodeLevels,
                    researchSources: stripped.researchSources,
                });
                setResearchTrees(updatedChar.researchTrees ?? stripped.researchTrees);
                setResearchNodeLevels(updatedChar.researchNodeLevels ?? stripped.researchNodeLevels);
                setResearchSources(updatedChar.researchSources ?? stripped.researchSources);
                setEquipment(updatedChar.equipment ?? nextEquipment);
                onSaved?.({ equipment: updatedChar.equipment ?? nextEquipment, name, portraitId: selectedPortraitId });
            } catch (e) {
                console.error('Failed to reset research by source:', e);
            } finally {
                setSaving(false);
            }
        },
        [
            api,
            character.id,
            equipment,
            name,
            permissionAccount?.role,
            researchNodeLevels,
            researchSources,
            researchTrees,
            selectedPortraitId,
            onSaved,
        ],
    );

    const handleResearchNode = useCallback(
        async (treeId: string, nodeId: string, asAdmin = false) => {
            if (!resolvedCampaign?.resources) return;
            const tree = RESEARCH_TREES.find((t) => t.id === treeId);
            if (!tree) return;

            // Darkness Upgrades: admin-only, stored on the campaign (not the character), no cost/prereqs.
            if (isDarknessUpgradeTree(treeId)) {
                if (!canInteractWithDarknessUpgradeTree(isAdmin) || !asAdmin) return;
                const cid = resolvedCampaign.id;
                if (!cid) return;
                const adminCtx = {
                    account: (account ?? { id: 0, name: '', role: 'user', fire: 0, water: 0, earth: 0, air: 0 }) as AccountState,
                    character: { ...character, equipment, ...viewResearch } as unknown as CampaignCharacter,
                    campaignResources: resolvedCampaign.resources,
                };
                if (!canAdminGrantResearchNode(tree, nodeId, adminCtx).ok) return;
                const next = grantDarknessUpgradeNode(darknessUpgrades, nodeId);
                setSaving(true);
                try {
                    const updated = await api.updateCampaignDarknessUpgrades(cid, next);
                    setDarknessUpgrades(updated.darknessUpgrades ?? next);
                    if (!campaign) setLocalCampaign(updated);
                } catch (e) {
                    console.error('Failed to grant darkness upgrade:', e);
                } finally {
                    setSaving(false);
                }
                return;
            }

            const ctx = {
                account: (account ?? { id: 0, name: '', role: 'user', fire: 0, water: 0, earth: 0, air: 0 }) as AccountState,
                character: {
                    ...character,
                    equipment,
                    researchTrees: activeResearchTrees,
                    researchNodeLevels: activeResearchNodeLevels,
                    researchSources,
                } as CampaignCharacter,
                campaignResources: resolvedCampaign.resources,
            };

            const action = isAdmin && asAdmin ? RESEARCH_CLICK_ADMIN : RESEARCH_CLICK_PURCHASE;
            const check = action === RESEARCH_CLICK_ADMIN
                ? canAdminGrantResearchNode(tree, nodeId, ctx)
                : canResearchNode(tree, nodeId, ctx, canResearchOptionsForClick(action));
            if (!check.ok) return;

            const targetNode = tree.nodes.find((n) => n.id === nodeId);
            const maxLevels = targetNode ? getNodeMaxLevels(targetNode) : 1;
            // Active view: the virtual root counts as owned, so it is never researched/persisted.
            const already = new Set(activeResearchTrees[treeId] ?? []);
            // Player first unlock may auto-research prereqs. Admin Shift+click grants only this node.
            const isLevelUp = already.has(nodeId);
            const toDo = action === RESEARCH_CLICK_ADMIN || isLevelUp
                ? [nodeId]
                : prereqClosure(tree, nodeId).filter((id) => !already.has(id));
            const source = researchSourceForClick(action);

            setSaving(true);
            try {
                for (const nid of toDo) {
                    const nodeDef = tree.nodes.find((n) => n.id === nid);
                    const updated = await api.researchCharacterNode(character.id, {
                        treeId,
                        nodeId: nid,
                        maxLevels: nodeDef ? getNodeMaxLevels(nodeDef) : maxLevels,
                        source,
                    });
                    setResearchTrees(updated.researchTrees ?? {});
                    setResearchNodeLevels(updated.researchNodeLevels ?? {});
                    setResearchSources(updated.researchSources ?? {});
                }
                const latest = await api.getCharacter(character.id);
                const latestTrees = latest.researchTrees ?? {};
                const latestLevels = latest.researchNodeLevels ?? {};
                const latestSources = latest.researchSources ?? {};
                setResearchTrees(latestTrees);
                setResearchNodeLevels(latestLevels);
                setResearchSources(latestSources);
                const ctx2 = {
                    account: ctx.account,
                    character: {
                        ...character,
                        equipment,
                        researchTrees: latestTrees,
                        researchNodeLevels: latestLevels,
                        researchSources: latestSources,
                    } as CampaignCharacter,
                    campaignResources: resolvedCampaign.resources,
                };
                const applied = applyResearchEffects(tree, ctx2);
                const newEquipment = applied.equipment;
                if (JSON.stringify(newEquipment) !== JSON.stringify(equipment)) {
                    const updatedChar = await api.updateCharacter(character.id, buildEquipmentUpdate(newEquipment));
                    setEquipment(updatedChar.equipment ?? newEquipment);
                    onSaved?.({ equipment: updatedChar.equipment ?? newEquipment, name, portraitId: selectedPortraitId });
                }
            } catch (e) {
                console.error('Failed to research node:', e);
            } finally {
                setSaving(false);
            }
        },
        [
            account,
            character,
            equipment,
            api,
            isAdmin,
            activeResearchTrees,
            activeResearchNodeLevels,
            researchSources,
            resolvedCampaign?.resources,
            resolvedCampaign?.id,
            campaign,
            darknessUpgrades,
            viewResearch,
            selectedPortraitId,
            name,
            onSaved,
            buildEquipmentUpdate,
        ],
    );

    return { handleResetResearch, handleResetResearchBySource, handleResearchNode };
}
