import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import { getCoreFromEquipment } from '../../../character_defs/items';
import { RESEARCH_TREES } from '../../../../../researchTrees/list';
import { buildAccessibleAbilityIds } from '../../../storylines/questPrepLoadout';
import {
    isPlayerVisibleResearchTree,
    sortResearchTreesByPlayerAbilities,
} from '../../../../../researchTrees/treeAbilities';
import { treeHasAnyResearch } from '../../../../../researchTrees/evaluator';
import { canInteractWithDarknessUpgradeTree, isDarknessUpgradeTree } from '../../../../../researchTrees/darknessUpgrades';
import type { ResearchNodeSources } from '../../../../../researchTrees/types';
import type { AccountState, CampaignResources, CampaignState } from '../../../../../types';
import { getShowAllResearchTrees, subscribeShowAllResearchTrees } from '../../../../../debugFlags';

export interface UseResearchTreeViewArgs {
    account: AccountState | null | undefined;
    character: CampaignCharacter;
    equipment: string[];
    researchTrees: Record<string, string[]>;
    activeResearchTrees: Record<string, string[]>;
    activeResearchNodeLevels: Record<string, Record<string, number>>;
    researchSources: ResearchNodeSources;
    resolvedCampaign: CampaignState | null | undefined;
    isAdmin: boolean;
    permissionAccount: AccountState | null;
    adminUseGridView: boolean;
    selectedTreeId: string | null;
    setSelectedTreeId: (id: string | null) => void;
}

/** Which research trees the Upgrades tab lists (eligibility, admin / debug show-all, dimming) and admin selection upkeep. */
export function useResearchTreeView({
    account,
    character,
    equipment,
    researchTrees,
    activeResearchTrees,
    activeResearchNodeLevels,
    researchSources,
    resolvedCampaign,
    isAdmin,
    permissionAccount,
    adminUseGridView,
    selectedTreeId,
    setSelectedTreeId,
}: UseResearchTreeViewArgs) {
    const showAllResearchTreesDebug = useSyncExternalStore(
        subscribeShowAllResearchTrees,
        getShowAllResearchTrees,
        getShowAllResearchTrees,
    );

    /** Trees the character is allowed to see (gating), used for normal list and for dimming in debug “show all”. */
    const eligibleResearchTrees = useMemo(() => {
        const ctx = {
            account: (account ?? { id: 0, name: '', role: 'user', fire: 0, water: 0, earth: 0, air: 0 }) as AccountState,
            character: {
                ...character,
                equipment,
                researchTrees: activeResearchTrees,
                researchNodeLevels: activeResearchNodeLevels,
                researchSources,
            } as CampaignCharacter,
            campaignResources: (resolvedCampaign?.resources ?? {}) as CampaignResources,
        };
        return RESEARCH_TREES.filter((t) => {
            const any = treeHasAnyResearch(ctx.character, t.id);
            if (any) return true;
            return t.accessRequirements.every((req) => {
                if (req.type === 'accountKnowledge') return !!ctx.account.knowledge?.[req.key];
                if (req.type === 'campaignResourceMin') return (ctx.campaignResources[req.resource] ?? 0) >= req.min;
                if (req.type === 'characterHasEquippedItem') return ctx.character.equipment.includes(req.itemId);
                if (req.type === 'characterHasCore') return getCoreFromEquipment(ctx.character.equipment) !== null;
                if (req.type === 'characterHasTrait') return ctx.character.traits.includes(req.trait);
                if (req.type === 'notResearched') {
                    const set = new Set(ctx.character.researchTrees?.[req.treeId] ?? []);
                    return !set.has(req.nodeId);
                }
                return false;
            });
        });
    }, [account, character, equipment, activeResearchTrees, activeResearchNodeLevels, researchSources, resolvedCampaign?.resources]);

    const playerAbilityIds = useMemo(
        () => new Set(buildAccessibleAbilityIds(equipment, researchTrees)),
        [equipment, researchTrees],
    );

    const playerVisibleResearchTrees = useMemo(
        () =>
            eligibleResearchTrees.filter((tree) =>
                isPlayerVisibleResearchTree(tree, activeResearchTrees, playerAbilityIds, equipment),
            ),
        [eligibleResearchTrees, playerAbilityIds, activeResearchTrees, equipment],
    );

    const displayResearchTrees = useMemo(() => {
        const showAll = isAdmin || showAllResearchTreesDebug;
        const base = showAll ? RESEARCH_TREES : playerVisibleResearchTrees;
        // Darkness Upgrades is admin-only: never listed for non-admins (even with the debug "show all" flag).
        const allowed = base.filter(
            (t) => !isDarknessUpgradeTree(t.id) || canInteractWithDarknessUpgradeTree(isAdmin),
        );
        return sortResearchTreesByPlayerAbilities(allowed, playerAbilityIds);
    }, [isAdmin, playerAbilityIds, playerVisibleResearchTrees, showAllResearchTreesDebug]);

    const dimmedResearchTreeIds = useMemo(() => {
        const showAll = isAdmin || showAllResearchTreesDebug;
        if (!showAll) return new Set<string>();
        const visibleIds = new Set(playerVisibleResearchTrees.map((t) => t.id));
        return new Set(
            RESEARCH_TREES.filter((t) => !visibleIds.has(t.id) && !isDarknessUpgradeTree(t.id)).map((t) => t.id),
        );
    }, [isAdmin, playerVisibleResearchTrees, showAllResearchTreesDebug]);

    useEffect(() => {
        // In grid view null means "All trees" — don't force a selection.
        if (permissionAccount?.role !== 'admin' || adminUseGridView) return;
        const firstId = displayResearchTrees[0]?.id ?? null;
        const isSelectedStillAvailable =
            selectedTreeId != null && displayResearchTrees.some((t) => t.id === selectedTreeId);
        if (!isSelectedStillAvailable) {
            setSelectedTreeId(firstId);
        }
    }, [displayResearchTrees, selectedTreeId, permissionAccount?.role, adminUseGridView]);

    return { displayResearchTrees, dimmedResearchTreeIds };
}
