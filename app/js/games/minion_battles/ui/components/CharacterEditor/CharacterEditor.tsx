/**
 * Character Editor - edit portrait and equipment for a campaign character.
 * Portrait with prev/next on the same row as the name; tabs (Equipment / Upgrades).
 * Equipment sidebar: paper doll or horizontal equipped-items list; inventory grid; drag to equip.
 */
import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Check, Pencil, X } from 'lucide-react';
import { getPortraitIdsForPlayer, getPortrait } from '../../../character_defs/portraits';
import {
    getItemDef,
    getEquippedForSlot,
    setEquipmentInSlot,
    getSlotLayoutFromEquipment,
    ALL_PLAYER_ITEMS,
    ITEM_ICON_URLS,
    type EquipmentSlotType,
} from '../../../character_defs/items';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import type { MinionBattlesApi } from '../../../api/minionBattlesApi';
import type { CharacterUpdates } from '../../../api/types';
import { getUnlockedItemIds } from '../../../character_defs/items/unlockedItems';
import CharacterPortrait from '../CharacterPortrait';
import InventoryPanel from './InventoryPanel';
import { ResearchTreeList, ResearchTreeContent, ResearchedNodesGrid } from '../ResearchTreePanel';
import type { AccountState, CampaignResourceKey, CampaignResources, CampaignState } from '../../../../../types';
import { TestIds } from '../../../../../testing/testIds';
import { getCoreFromEquipment } from '../../../character_defs/items';
import { RESEARCH_TREES } from '../../../../../researchTrees/list';
import {
    getActiveResearchNodeLevels,
    getActiveResearchTrees,
    isResearchTreeActive,
} from '../../../../../researchTrees/activeResearch';
import { buildAccessibleAbilityIds } from '../../../storylines/questPrepLoadout';
import {
    isPlayerVisibleResearchTree,
    sortResearchTreesByPlayerAbilities,
} from '../../../../../researchTrees/treeAbilities';
import {
    canAdminGrantResearchNode,
    canResearchNode,
    applyResearchEffects,
    sortNodesDeterministic,
    prereqClosure,
    treeHasAnyResearch,
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
import { EMPTY_DARKNESS_UPGRADES, type DarknessUpgradesState } from '../../../../../types';
import { ResearchSource, type ResearchNodeSources } from '../../../../../researchTrees/types';
import {
    RESET_ADMIN_RESEARCH_CONFIRM,
    RESET_PURCHASED_RESEARCH_CONFIRM,
    RESEARCH_CLICK_ADMIN,
    RESEARCH_CLICK_PURCHASE,
    canResearchOptionsForClick,
    researchSourceForClick,
} from '../researchNodeGrid';
import ResourcePill, { RESOURCE_ORDER } from '../../../../../components/ResourcePill';
import {
    getCharacterEndurance,
    getCharacterExhaustion,
    getRemainingEndurance,
} from '../../../character_defs/characterEndurance';
import { CHARACTER_EDITOR_PORTRAIT_SIZE_PX, CharacterEnduranceBar } from './CharacterEnduranceBar';
import {
    RESET_CAMPAIGN_RESOURCES_CONFIRM,
    RESET_CAMPAIGN_RESOURCES_LABEL,
} from '../../../../../campaignResources';
import { getShowAllResearchTrees, subscribeShowAllResearchTrees } from '../../../../../debugFlags';
import MissionMapTab from './MissionMapTab';
import ChapterSkipWizard from './ChapterSkipWizard';
import {
    stripChapterResearchRewards,
    type ChapterSkipCharacterState,
    type ChapterSkipContext,
    type ChapterSkipPlan,
} from '../../../storylines/chapterSkip';
import type { CampaignChapterDef } from '../../../storylines/types';
import StatBonusesTab from './StatBonusesTab';
import { PortraitCycleButtons } from './PortraitCycleButtons';
import { characterHasResearch, shouldShowUpgradesTab } from '../../../../../components/CampaignHomeScreen/CharactersTab/Upgrades/Upgrades';
import { characterHasStatBonuses } from '../../../../../components/CampaignHomeScreen/CharactersTab/StatBonuses/StatBonuses';
import { CharactersTabLayerOne } from '../../../../../components/CampaignHomeScreen/CharactersTab/CharactersTabLayerOne';
import { CharactersTabLayerTwo } from '../../../../../components/CampaignHomeScreen/CharactersTab/CharactersTabLayerTwo';
import { useCharacterInnerTab } from '../../../../../components/CampaignHomeScreen/CharactersTab/useCharacterInnerTab';
import {
    editorTabFromInner,
    innerTabFromEditor,
    innerTabShowsPortrait,
    type CharacterEditorTab,
} from '../../../../../components/CampaignHomeScreen/CharactersTab/characterInnerTabMap';
import type { CharacterInnerTabId } from '../../../../../components/ability-tests/campaignTabPaths';
import {
    CHANGE_CHARACTERS_LABEL,
    CHARACTER_EDITOR_LEFT_WIDTH_CLASS,
} from '../characters/CharacterListPullout';
import type { StartQuestOptions } from '../../../storylines/questLobby';
import { abandonQuestRun } from '../../../storylines/questRun';
import { getQuestDef, isQuestDisabled } from '../../../storylines/index';

function undoReplaceEquippedItemsForRemovedNodes(
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

interface CharacterEditorProps {
    character: CampaignCharacter;
    api: MinionBattlesApi;
    onSaved?: (updated: { equipment: string[]; name: string; portraitId: string }) => void;
    onClose?: () => void;
    /** Whether equipment editing is enabled. Defaults to false. */
    editMode?: boolean;
    /**
     * Whether the player can rename the character (pencil / inline edit).
     * Independent of {@link editMode} (equipment drag-drop). Defaults to true so lobby
     * “Edit character” can rename while inventory stays view-only when `editMode` is false.
     */
    allowNameEdit?: boolean;
    /** Whether to render the inventory sidebar. Defaults to true. */
    showInventoryPanel?: boolean;
    /** Target account (used for research knowledge gating, optional). */
    account?: AccountState | null;
    /** Viewer account (used for admin-gated UI). If omitted, falls back to `account`. */
    viewerAccount?: AccountState | null;
    /** Current campaign state (used for research resource checks). */
    campaign?: CampaignState | null;
    /** How equipped items appear in the Equipment tab sidebar. */
    equippedItemsDisplay?: 'paperDoll' | 'list';
    /** Account ID of the local player; used to restrict which portraits they can cycle to. */
    localPlayerId?: number;
    /** Called when the player clicks a mission on the Mission Map. */
    onStartMission?: (missionId: string) => void;
    /** Start / continue a QuestRun lobby (Quest Prep happens in character_select). */
    onStartQuest?: (questDefId: string, options?: StartQuestOptions) => void;
    /** When true, hides the Mission Map tab (e.g. when opened from inside a lobby). */
    hideMissionMap?: boolean;
    /** Admin-only content rendered pinned to the bottom of the Equipment tab (e.g. item grant UI). */
    adminEquipmentPanel?: React.ReactNode;
    /** Admin-only content rendered next to the grant-campaign-resources block in the Upgrades tab. */
    adminKnowledgePanel?: React.ReactNode;
    /** Opens the campaign-home character-list pull-out (Mission Map / Upgrades / Stat Bonuses). */
    onChangeCharacters?: () => void;
    /**
     * Campaign-home layout: LayerOne/LayerTwo chrome and URL-owned inner tabs
     * (`/players/:id/characters/:charId/:tab`). Lobby keeps local tab state.
     */
    useRoutedInnerTabs?: boolean;
}

type EditorTab = CharacterEditorTab;
const MAX_CHARACTER_NAME_LENGTH = 15;

/** Slot descriptor for the doll: type and optional index for weapon/utility. */
export interface SlotDescriptor {
    type: EquipmentSlotType;
    index?: number;
    label: string;
}

function getSlotDescriptors(equipment: string[]): SlotDescriptor[] {
    const layout = getSlotLayoutFromEquipment(equipment);
    const out: SlotDescriptor[] = [{ type: 'core', label: 'core' }];
    for (let i = 0; i < layout.weaponSlots; i++) {
        out.push({ type: 'weapon', index: i, label: layout.weaponSlots > 1 ? `weapon ${i + 1}` : 'weapon' });
    }
    for (let i = 0; i < layout.utilitySlots; i++) {
        out.push({ type: 'utility', index: i, label: layout.utilitySlots > 1 ? `utility ${i + 1}` : 'utility' });
    }
    return out;
}

export default function CharacterEditor({
    character,
    api,
    onSaved,
    onClose: _onClose,
    editMode = false,
    allowNameEdit = true,
    showInventoryPanel = true,
    account,
    viewerAccount,
    campaign,
    equippedItemsDisplay = 'paperDoll',
    localPlayerId,
    onStartMission,
    onStartQuest,
    hideMissionMap = false,
    adminEquipmentPanel,
    adminKnowledgePanel,
    onChangeCharacters,
    useRoutedInnerTabs = false,
}: CharacterEditorProps) {
    const canEditName = editMode || allowNameEdit;

    const sanitizeCharacterName = useCallback((value: string): string => {
        return value.replace(/[^a-zA-Z0-9]/g, '').slice(0, MAX_CHARACTER_NAME_LENGTH);
    }, []);

    const portraitIds = useMemo(() => getPortraitIdsForPlayer(localPlayerId), [localPlayerId]);
    const totalPortraits = portraitIds.length;

    const [portraitIndex, setPortraitIndex] = useState(() => {
        const i = portraitIds.indexOf(character.portraitId);
        return i >= 0 ? i : 0;
    });
    const [name, setName] = useState(character.name);
    const [nameDraft, setNameDraft] = useState(character.name);
    const [isEditingName, setIsEditingName] = useState(false);
    const [equipment, setEquipment] = useState<string[]>(() => [...character.equipment]);
    const [localTab, setLocalTab] = useState<EditorTab>(() => {
        if (!hideMissionMap) return 'missionMap';
        if (characterHasResearch(character.researchTrees)) return 'research';
        if (characterHasStatBonuses(character.researchTrees, character.researchNodeLevels)) return 'statBonuses';
        return 'equipment';
    });
    const { tab: routedInnerTab, setTab: setRoutedInnerTab } = useCharacterInnerTab();
    const activeTab: EditorTab = useRoutedInnerTabs ? editorTabFromInner(routedInnerTab) : localTab;
    const innerTab: CharacterInnerTabId = useRoutedInnerTabs ? routedInnerTab : innerTabFromEditor(localTab);

    const setActiveTab = useCallback((next: EditorTab) => {
        if (useRoutedInnerTabs) setRoutedInnerTab(innerTabFromEditor(next));
        else setLocalTab(next);
    }, [useRoutedInnerTabs, setRoutedInnerTab]);
    const [saving, setSaving] = useState(false);
    const [dragItemId, setDragItemId] = useState<string | null>(null);
    const [dragSlot, setDragSlot] = useState<EquipmentSlotType | null>(null);
    const [researchTrees, setResearchTrees] = useState<Record<string, string[]>>(() => character.researchTrees ?? {});
    const [researchNodeLevels, setResearchNodeLevels] = useState<Record<string, Record<string, number>>>(
        () => character.researchNodeLevels ?? {},
    );
    const [researchSources, setResearchSources] = useState<ResearchNodeSources>(
        () => character.researchSources ?? {},
    );
    const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
    const [adminUseGridView, setAdminUseGridView] = useState(true);
    const [localCampaign, setLocalCampaign] = useState<CampaignState | null>(null);
    const [grantResourceKey, setGrantResourceKey] = useState<CampaignResourceKey>('food');
    const [grantResourceAmount, setGrantResourceAmount] = useState<string>('1');

    const selectedPortraitId = portraitIds[portraitIndex] ?? portraitIds[0];
    const portrait = getPortrait(selectedPortraitId);
    const displayName = name || (portrait?.name ?? 'Adventurer');

    const resolvedCampaign = campaign ?? localCampaign;
    const permissionAccount = viewerAccount ?? account ?? null;
    const isAdmin = permissionAccount?.role === 'admin';

    // Darkness Upgrades live on the campaign (player level), not on the character.
    const [darknessUpgrades, setDarknessUpgrades] = useState<DarknessUpgradesState>(
        () => resolvedCampaign?.darknessUpgrades ?? EMPTY_DARKNESS_UPGRADES,
    );
    useEffect(() => {
        setDarknessUpgrades(resolvedCampaign?.darknessUpgrades ?? EMPTY_DARKNESS_UPGRADES);
    }, [resolvedCampaign?.darknessUpgrades]);

    /**
     * Research maps used by the Upgrades UI: the character's own research with the Darkness Upgrades
     * tree replaced by the campaign's `darknessUpgrades` (so ownership/eligibility for that tree is
     * evaluated against the player-level data). Never used for character persistence or bonuses.
     */
    // Active research: stored research minus inactive weapon trees, plus virtual roots. Never persisted.
    const activeResearchTrees = useMemo(
        () => getActiveResearchTrees(researchTrees, equipment),
        [researchTrees, equipment],
    );
    const activeResearchNodeLevels = useMemo(
        () => getActiveResearchNodeLevels(researchNodeLevels, equipment),
        [researchNodeLevels, equipment],
    );
    const viewResearch = useMemo(
        () =>
            mergeDarknessUpgradesIntoResearchView(
                activeResearchTrees,
                activeResearchNodeLevels,
                researchSources,
                darknessUpgrades,
            ),
        [activeResearchTrees, activeResearchNodeLevels, researchSources, darknessUpgrades],
    );
    // Equipment is frozen for the whole quest: non-admins get read-only slots while a run is active.
    const equipmentLockedByQuest = !isAdmin && !!character.activeQuestRun;
    const effectiveEditMode = editMode && !equipmentLockedByQuest;
    const effectiveShowInventory = showInventoryPanel;

    const showAllResearchTreesDebug = useSyncExternalStore(
        subscribeShowAllResearchTrees,
        getShowAllResearchTrees,
        getShowAllResearchTrees,
    );

    useEffect(() => {
        setEquipment([...character.equipment]);
        setResearchTrees(character.researchTrees ?? {});
        setResearchNodeLevels(character.researchNodeLevels ?? {});
        setResearchSources(character.researchSources ?? {});
    }, [character.equipment, character.researchTrees, character.researchNodeLevels, character.researchSources]);

    useEffect(() => {
        setName(character.name);
        setNameDraft(character.name);
        setIsEditingName(false);
    }, [character.name, character.id]);

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
            // Weapon trees are hidden while their weapon is not equipped, even if they hold research.
            if (!isResearchTreeActive(t, equipment)) return false;
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
                isPlayerVisibleResearchTree(tree, activeResearchTrees, playerAbilityIds),
            ),
        [eligibleResearchTrees, playerAbilityIds, activeResearchTrees],
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

    useEffect(() => {
        if (campaign) {
            setLocalCampaign(null);
            return;
        }
        if (activeTab !== 'research' && activeTab !== 'equipment') {
            return;
        }
        const isInstanceId = (id: string) => /^[a-f0-9]{16}$/.test(id);
        const fallbackAccountCampaignId = account?.campaignIds?.[0] ?? null;
        const cid = isInstanceId(character.campaignId) ? character.campaignId : fallbackAccountCampaignId;
        if (!cid) {
            setLocalCampaign(null);
            return;
        }
        let cancelled = false;
        api
            .getCampaign(cid)
            .then((c) => {
                if (!cancelled) setLocalCampaign(c);
            })
            .catch(() => {
                if (!cancelled) setLocalCampaign(null);
            });
        return () => {
            cancelled = true;
        };
    }, [account?.campaignIds, activeTab, campaign, character.campaignId, api]);

    /**
     * Character update payload for an equipment change. During an active quest the same equipment is
     * also written to the quest snapshot (`activeQuestRun.questCharacter.equipment`), which battles read.
     */
    const buildEquipmentUpdate = useCallback(
        (newEquipment: string[]): CharacterUpdates => {
            const run = character.activeQuestRun;
            if (!run) return { equipment: newEquipment };
            return {
                equipment: newEquipment,
                activeQuestRun: { ...run, questCharacter: { ...run.questCharacter, equipment: newEquipment } },
            };
        },
        [character.activeQuestRun],
    );

    const saveEquipment = useCallback(
        async (newEquipment: string[]) => {
            setSaving(true);
            try {
                const updated = await api.updateCharacter(character.id, buildEquipmentUpdate(newEquipment));
                setEquipment(updated.equipment ?? newEquipment);
                onSaved?.({ equipment: updated.equipment ?? newEquipment, name, portraitId: selectedPortraitId });
            } catch (e) {
                console.error('Failed to save equipment:', e);
            } finally {
                setSaving(false);
            }
        },
        [character.id, api, name, onSaved, selectedPortraitId, buildEquipmentUpdate]
    );

    const savePortrait = useCallback(
        async (portraitId: string) => {
            setSaving(true);
            try {
                await api.updateCharacter(character.id, { portraitId });
                onSaved?.({ equipment, name, portraitId });
            } catch (e) {
                console.error('Failed to save portrait:', e);
            } finally {
                setSaving(false);
            }
        },
        [character.id, equipment, api, name, onSaved]
    );

    const saveName = useCallback(async () => {
        const trimmedName = sanitizeCharacterName(nameDraft).trim();
        if (!trimmedName || trimmedName === name) {
            setNameDraft(name);
            setIsEditingName(false);
            return;
        }

        setSaving(true);
        try {
            await api.updateCharacter(character.id, { name: trimmedName });
            setName(trimmedName);
            setNameDraft(trimmedName);
            onSaved?.({ equipment, name: trimmedName, portraitId: selectedPortraitId });
            setIsEditingName(false);
        } catch (e) {
            console.error('Failed to save name:', e);
            setNameDraft(name);
            setIsEditingName(false);
        } finally {
            setSaving(false);
        }
    }, [api, character.id, equipment, name, nameDraft, onSaved, sanitizeCharacterName, selectedPortraitId]);

    const cancelNameEdit = useCallback(() => {
        setNameDraft(name);
        setIsEditingName(false);
    }, [name]);

    const goPrevPortrait = useCallback(() => {
        const next = portraitIndex === 0 ? totalPortraits - 1 : portraitIndex - 1;
        setPortraitIndex(next);
        const pid = portraitIds[next];
        if (pid && pid !== character.portraitId) savePortrait(pid);
    }, [character.portraitId, portraitIds, portraitIndex, savePortrait, totalPortraits]);

    const goNextPortrait = useCallback(() => {
        const next = portraitIndex === totalPortraits - 1 ? 0 : portraitIndex + 1;
        setPortraitIndex(next);
        const pid = portraitIds[next];
        if (pid && pid !== character.portraitId) savePortrait(pid);
    }, [character.portraitId, portraitIds, portraitIndex, savePortrait, totalPortraits]);

    const visibleInventoryItems = useMemo(() => {
        const isAdminViewer = permissionAccount?.role === 'admin';
        const base = isAdminViewer ? ALL_PLAYER_ITEMS : getUnlockedItemIds(resolvedCampaign);
        return base.filter((id) => !equipment.includes(id));
    }, [permissionAccount?.role, equipment, resolvedCampaign]);


    const handleGrantResource = useCallback(async () => {
        if (permissionAccount?.role !== 'admin') return;
        const cid = resolvedCampaign?.id ?? null;
        if (!cid) return;
        const delta = Number(grantResourceAmount);
        if (!Number.isFinite(delta) || delta === 0) return;
        setSaving(true);
        try {
            const updated = await api.grantCampaignResource(cid, grantResourceKey, Math.trunc(delta));
            setLocalCampaign(updated);
        } catch (e) {
            console.error('Failed to grant campaign resource:', e);
        } finally {
            setSaving(false);
        }
    }, [grantResourceAmount, grantResourceKey, api, permissionAccount?.role, resolvedCampaign?.id]);

    const handleResetResources = useCallback(async () => {
        if (permissionAccount?.role !== 'admin') return;
        const cid = resolvedCampaign?.id ?? null;
        if (!cid) return;
        if (!window.confirm(RESET_CAMPAIGN_RESOURCES_CONFIRM)) return;
        setSaving(true);
        try {
            const updated = await api.resetCampaignResources(cid);
            setLocalCampaign(updated);
        } catch (e) {
            console.error('Failed to reset campaign resources:', e);
        } finally {
            setSaving(false);
        }
    }, [api, permissionAccount?.role, resolvedCampaign?.id]);

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

    const handleEquipToSlot = useCallback(
        (slot: EquipmentSlotType, itemId: string, slotIndex?: number) => {
            if (!effectiveEditMode) return;
            const def = getItemDef(itemId);
            if (!def?.slots.includes(slot)) return;
            const newEquipment = setEquipmentInSlot(equipment, slot, itemId, slotIndex);
            setEquipment(newEquipment);
            saveEquipment(newEquipment);
        },
        [effectiveEditMode, equipment, saveEquipment]
    );

    const handleDragStartItem = useCallback((e: React.DragEvent, itemId: string) => {
        setDragItemId(itemId);
        e.dataTransfer.setData('text/plain', itemId);
        e.dataTransfer.effectAllowed = 'copy';
    }, []);

    const handleDragStartSlot = useCallback(
        (e: React.DragEvent, slot: EquipmentSlotType, slotIndex?: number) => {
            const itemId = getEquippedForSlot(equipment, slot, slotIndex);
            if (itemId) {
                setDragSlot(slot);
                const key = slotIndex !== undefined ? `${slot}:${slotIndex}` : slot;
                e.dataTransfer.setData('text/plain', `slot:${key}:${itemId}`);
                e.dataTransfer.effectAllowed = 'move';
            }
        },
        [equipment]
    );

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    }, []);

    const handleDropOnSlot = useCallback(
        (e: React.DragEvent, slot: EquipmentSlotType, slotIndex?: number) => {
            e.preventDefault();
            const raw = e.dataTransfer.getData('text/plain');
            const itemId = raw.startsWith('slot:') ? raw.split(':').slice(-1)[0] : raw;
            if (itemId) handleEquipToSlot(slot, itemId, slotIndex);
            setDragItemId(null);
            setDragSlot(null);
        },
        [handleEquipToSlot]
    );

    const handleDragEnd = useCallback(() => {
        setDragItemId(null);
        setDragSlot(null);
    }, []);

    const useGridView = !isAdmin || adminUseGridView;

    const handleMarkVictory = useCallback(async (missionId: string) => {
        if (!isAdmin) return;
        const campaignId = character.campaignId;
        const existingMap: Record<string, import('../../../../../types').MissionResult[]> = character.missionResults ?? {};
        const existingList = existingMap[campaignId] ?? [];
        if (existingList.find((r) => r.missionId === missionId && r.result !== 'defeat')) return;
        const newEntry = { missionId, result: 'victory' as const, timestamp: Date.now(), adminGranted: true };
        const updatedList = [...existingList.filter((r) => r.missionId !== missionId), newEntry];
        try {
            await api.updateCharacter(character.id, { missionResults: { ...existingMap, [campaignId]: updatedList } });
            onSaved?.({ equipment: character.equipment, name: character.name, portraitId: character.portraitId });
        } catch (e) {
            console.warn('Failed to mark victory:', e);
        }
    }, [isAdmin, character, api, onSaved]);

    const handleCampaignChange = useCallback(async (newCampaignId: string) => {
        if (!isAdmin || newCampaignId === character.campaignId) return;
        try {
            await api.updateCharacter(character.id, { campaignId: newCampaignId });
            onSaved?.({ equipment: character.equipment, name: character.name, portraitId: character.portraitId });
        } catch (e) {
            console.warn('Failed to update campaign:', e);
        }
    }, [isAdmin, character.id, character.campaignId, character.equipment, character.name, character.portraitId, api, onSaved]);

    /** Start / continue opens a quest lobby immediately (Quest Prep is in character_select). */
    const handleMapStartQuest = useCallback(
        (questDefId: string, options?: StartQuestOptions) => {
            if (!onStartQuest) return;
            if (!isAdmin && isQuestDisabled(getQuestDef(questDefId))) return;
            onStartQuest(questDefId, options);
        },
        [onStartQuest, isAdmin],
    );

    /** Clear the singular activeQuestRun after UI confirm. */
    const handleAbandonQuest = useCallback(async () => {
        const run = character.activeQuestRun;
        if (!run) return;
        try {
            void abandonQuestRun(run);
            await api.updateCharacter(character.id, { activeQuestRun: null });
            onSaved?.({
                equipment: character.equipment,
                name: character.name,
                portraitId: character.portraitId,
            });
        } catch (e) {
            console.warn('Failed to abandon quest:', e);
        }
    }, [character, api, onSaved]);

    /** Admin: chapter whose Skip Chapter wizard is open. */
    const [skipChapter, setSkipChapter] = useState<CampaignChapterDef | null>(null);

    /** Wizard start: the character with research from this chapter's earlier results removed ("replace"). */
    const chapterSkipStart = useMemo((): ChapterSkipCharacterState | null => {
        if (!skipChapter) return null;
        return stripChapterResearchRewards(
            {
                equipment: [...character.equipment],
                researchTrees: character.researchTrees ?? {},
                researchNodeLevels: character.researchNodeLevels ?? {},
                researchSources: character.researchSources ?? {},
            },
            character.missionResults?.[character.campaignId] ?? [],
            skipChapter.missionIds,
        );
    }, [skipChapter, character]);

    const ownerAccountId = character.ownerAccountId ?? account?.id;
    const chapterSkipCtx = useMemo(
        (): ChapterSkipContext => ({
            playerId: ownerAccountId != null ? String(ownerAccountId) : '',
            accountKnowledge: account?.knowledge ?? {},
        }),
        [ownerAccountId, account?.knowledge],
    );

    /** Admin: persist a Skip Chapter plan like a real playthrough (character, campaign, account knowledge). */
    const handleApplyChapterSkip = useCallback(async (plan: ChapterSkipPlan) => {
        if (!isAdmin || !skipChapter) return;
        const isInstanceId = (id: string) => /^[a-f0-9]{16}$/.test(id);
        const campaignInstanceId =
            resolvedCampaign?.id
            ?? (isInstanceId(character.campaignId) ? character.campaignId : account?.campaignIds?.[0]);
        if (!campaignInstanceId) throw new Error('No campaign found for this character.');

        const storylineId = character.campaignId;
        const now = Date.now();
        const chapterIds = new Set(skipChapter.missionIds);
        const existingMap = character.missionResults ?? {};
        const keptResults = (existingMap[storylineId] ?? []).filter((r) => !chapterIds.has(r.missionId));
        const newResults = plan.missionResults.map((r, i) => ({ ...r, timestamp: now + i }));

        await api.updateCharacter(character.id, {
            equipment: plan.state.equipment,
            researchTrees: plan.state.researchTrees,
            researchNodeLevels: plan.state.researchNodeLevels,
            researchSources: plan.state.researchSources,
            missionResults: { ...existingMap, [storylineId]: [...keptResults, ...newResults] },
        });
        for (const r of plan.missionResults) {
            await api.recordCampaignMissionResult(campaignInstanceId, {
                missionId: r.missionId,
                result: r.result,
                resourceDelta: r.resourceDelta,
                itemIds: r.itemIds,
                researchRewards: r.researchRewards,
            });
        }
        if (ownerAccountId != null) {
            for (const key of plan.knowledgeKeys) {
                if (!account?.knowledge?.[key]) await api.grantAccountKnowledge(ownerAccountId, key);
            }
        }
        onSaved?.({ equipment: plan.state.equipment, name: character.name, portraitId: character.portraitId });
    }, [isAdmin, skipChapter, resolvedCampaign?.id, character, account?.campaignIds, account?.knowledge, ownerAccountId, api, onSaved]);

    /** Admin: drop a quest's recorded victories and its run so it can be run again. */
    const handleResetQuest = useCallback(async (questDefId: string) => {
        if (!isAdmin) return;
        const campaignId = character.campaignId;
        const all = character.questResults ?? {};
        const nextList = (all[campaignId] ?? []).filter((r) => r.questDefId !== questDefId);
        try {
            // Also drop this quest's run (prep / active / completed) so it can't trigger
            // the "already have an active quest" warning when starting again.
            const clearRun = character.activeQuestRun?.questDefId === questDefId;
            await api.updateCharacter(character.id, {
                questResults: { ...all, [campaignId]: nextList },
                ...(clearRun ? { activeQuestRun: null } : {}),
            });
            onSaved?.({
                equipment: character.equipment,
                name: character.name,
                portraitId: character.portraitId,
            });
        } catch (e) {
            console.warn('Failed to reset quest:', e);
        }
    }, [isAdmin, character, api, onSaved]);

    const firstTreeId = displayResearchTrees[0]?.id ?? null;
    const selectedTree = displayResearchTrees.find((t) => t.id === (selectedTreeId ?? firstTreeId));
    const selectedTreeDimmed = selectedTree ? dimmedResearchTreeIds.has(selectedTree.id) : false;

    const showUpgradesTab = shouldShowUpgradesTab(isAdmin, researchTrees);
    const showStatBonusesTab = characterHasStatBonuses(researchTrees, researchNodeLevels);

    const visibleInnerTabs: CharacterInnerTabId[] = useMemo(() => [
        ...(!hideMissionMap ? (['map'] as const) : []),
        ...(isAdmin ? (['equipment'] as const) : []),
        ...(showUpgradesTab ? (['upgrades'] as const) : []),
        ...(showStatBonusesTab ? (['bonuses'] as const) : []),
    ], [hideMissionMap, isAdmin, showUpgradesTab, showStatBonusesTab]);

    useEffect(() => {
        if (!useRoutedInnerTabs) return;
        if (visibleInnerTabs.includes(routedInnerTab)) return;
        const fallback = visibleInnerTabs[0];
        if (fallback) setRoutedInnerTab(fallback);
    }, [useRoutedInnerTabs, routedInnerTab, visibleInnerTabs, setRoutedInnerTab]);

    useEffect(() => {
        if (useRoutedInnerTabs) return;
        const inner = innerTabFromEditor(localTab);
        if (visibleInnerTabs.includes(inner)) return;
        const fallback = visibleInnerTabs[0];
        if (fallback) setLocalTab(editorTabFromInner(fallback));
    }, [useRoutedInnerTabs, localTab, visibleInnerTabs]);

    const nameSection = (
        <>
            {canEditName && !isEditingName && (
                <button
                    type="button"
                    className="h-6 w-6 rounded border border-border-custom bg-surface-light text-white flex items-center justify-center hover:bg-border-custom cursor-pointer shrink-0"
                    onClick={() => {
                        setNameDraft(name);
                        setIsEditingName(true);
                    }}
                    aria-label="Edit character name"
                    title="Edit character name"
                >
                    <Pencil className="h-3 w-3" aria-hidden />
                </button>
            )}
            {canEditName && isEditingName ? (
                <>
                    <button
                        type="button"
                        className="h-6 w-6 rounded border border-emerald-500/70 bg-emerald-600/20 text-emerald-300 flex items-center justify-center hover:bg-emerald-600/35 cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-default"
                        onClick={() => void saveName()}
                        aria-label="Apply name change"
                        title="Apply name change"
                        disabled={saving}
                    >
                        <Check className="h-3 w-3" aria-hidden />
                    </button>
                    <input
                        type="text"
                        value={nameDraft}
                        onChange={(e) => setNameDraft(sanitizeCharacterName(e.target.value))}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                void saveName();
                            } else if (e.key === 'Escape') {
                                e.preventDefault();
                                cancelNameEdit();
                            }
                        }}
                        className="flex-1 min-w-0 rounded border border-border-custom bg-surface px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder={portrait?.name ?? 'Adventurer'}
                        aria-label="Character name"
                        maxLength={MAX_CHARACTER_NAME_LENGTH}
                        pattern="[A-Za-z0-9]{1,15}"
                        title="Use letters and numbers only (max 15 characters)."
                        spellCheck={false}
                        autoFocus
                    />
                    <button
                        type="button"
                        className="h-6 w-6 rounded border border-red-500/70 bg-red-600/20 text-red-300 flex items-center justify-center hover:bg-red-600/35 cursor-pointer shrink-0"
                        onClick={cancelNameEdit}
                        aria-label="Cancel name change"
                        title="Cancel name change"
                    >
                        <X className="h-3 w-3" aria-hidden />
                    </button>
                </>
            ) : (
                <span
                    className="text-lg font-semibold text-white truncate text-left min-w-0 flex-1"
                    title={displayName}
                >
                    {displayName}
                </span>
            )}
        </>
    );

    const endurance = useMemo(
        () => getCharacterEndurance(researchTrees, researchNodeLevels),
        [researchTrees, researchNodeLevels],
    );
    const exhaustion = useMemo(() => getCharacterExhaustion(character), [character]);
    const remainingEndurance = useMemo(
        () => getRemainingEndurance(endurance, exhaustion),
        [endurance, exhaustion],
    );
    const enduranceSection = (
        <CharacterEnduranceBar remaining={remainingEndurance} endurance={endurance} />
    );

    const portraitBlock = (
        <div className="flex justify-center pt-4">
            <CharacterPortrait
                picture={portrait?.picture ?? ''}
                sizePx={CHARACTER_EDITOR_PORTRAIT_SIZE_PX}
            />
        </div>
    );

    const equipmentLeft = (
        <div className="flex-1 min-h-0 overflow-auto p-3">
            {equipmentLockedByQuest && (
                <p className="mb-2 rounded-md border border-border-custom bg-surface-light px-2 py-1.5 text-xs text-muted">
                    Equipment is locked for the active quest
                </p>
            )}
            {equippedItemsDisplay === 'list' ? (
                <EquippedItemsList
                    equipment={equipment}
                    slotDescriptors={getSlotDescriptors(equipment)}
                    onDropOnSlot={handleDropOnSlot}
                    onDragOver={handleDragOver}
                    onDragStartSlot={handleDragStartSlot}
                    onDragEnd={handleDragEnd}
                    editMode={effectiveEditMode}
                />
            ) : (
                <EquipmentDoll
                    equipment={equipment}
                    slotDescriptors={getSlotDescriptors(equipment)}
                    onDropOnSlot={handleDropOnSlot}
                    onDragOver={handleDragOver}
                    onDragStartSlot={handleDragStartSlot}
                    onDragEnd={handleDragEnd}
                    dragItemId={dragItemId}
                    dragSlot={dragSlot}
                    editMode={effectiveEditMode}
                />
            )}
        </div>
    );

    const researchLeft = (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {isAdmin && (
                <div className="shrink-0 px-3 pt-3 pb-1">
                    <button
                        type="button"
                        onClick={() => setAdminUseGridView((v) => !v)}
                        className="w-full rounded-md border border-border-custom bg-surface-light px-2 py-1.5 text-xs font-medium text-muted hover:text-white transition-colors"
                    >
                        {adminUseGridView ? 'Switch to Tree View' : 'Switch to Grid View'}
                    </button>
                </div>
            )}
            <div className="flex-1 min-h-0 overflow-auto p-3 pt-2">
                <ResearchTreeList
                    availableTrees={displayResearchTrees}
                    dimmedTreeIds={dimmedResearchTreeIds}
                    selectedTreeId={selectedTreeId}
                    onSelectTree={(id) => setSelectedTreeId(id)}
                    researchTrees={viewResearch.researchTrees}
                    canResetResearch={isAdmin && !adminUseGridView}
                    resetSaving={saving}
                    onResetResearchTree={(treeId) => void handleResetResearch([treeId])}
                    showAllOption={useGridView}
                    onSelectAll={() => setSelectedTreeId(null)}
                />
            </div>
        </div>
    );

    const equipmentRight = (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {effectiveShowInventory && (
                <div className="flex-1 min-h-0 overflow-auto p-4">
                    <InventoryPanel
                        visibleInventoryItems={visibleInventoryItems}
                        editMode={effectiveEditMode}
                        saving={saving}
                        onDragStartItem={handleDragStartItem}
                        onDragEnd={handleDragEnd}
                    />
                </div>
            )}
            {adminEquipmentPanel && (
                <div className="shrink-0 border-t border-border-custom p-3">
                    {adminEquipmentPanel}
                </div>
            )}
        </div>
    );

    const researchRight = (
        <div className="flex-1 min-h-0 overflow-auto p-4">
            {isAdmin && (resolvedCampaign?.resources || adminKnowledgePanel) && (
                <div className="mb-4 flex gap-3">
                    {resolvedCampaign?.resources && (
                        <div className="flex-1 rounded-lg border border-border-custom bg-surface-light p-3">
                            <p className="text-xs text-muted mb-2">Admin: grant campaign resource</p>
                            <div className="flex flex-wrap items-center gap-2">
                                <select
                                    className="rounded-md border border-border-custom bg-surface px-2 py-1 text-sm text-white"
                                    value={grantResourceKey}
                                    onChange={(e) => setGrantResourceKey(e.target.value as CampaignResourceKey)}
                                >
                                    {RESOURCE_ORDER.map((resource) => (
                                        <option key={resource} value={resource}>
                                            {resource}
                                        </option>
                                    ))}
                                </select>
                                <input
                                    className="w-24 rounded-md border border-border-custom bg-surface px-2 py-1 text-sm text-white"
                                    value={grantResourceAmount}
                                    onChange={(e) => setGrantResourceAmount(e.target.value)}
                                    inputMode="numeric"
                                    placeholder="amount"
                                />
                                <button
                                    type="button"
                                    onClick={() => void handleGrantResource()}
                                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-secondary hover:bg-primary-hover"
                                >
                                    Give
                                </button>
                                <button
                                    type="button"
                                    data-testid={TestIds.campaignResetResources}
                                    onClick={() => void handleResetResources()}
                                    disabled={saving}
                                    title="Restore counts to the sum of mission rewards"
                                    className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-60"
                                >
                                    {RESET_CAMPAIGN_RESOURCES_LABEL}
                                </button>
                                <span className="text-xs text-muted flex flex-wrap items-center gap-2">
                                    <span>Current:</span>
                                    {RESOURCE_ORDER.map((resource) => (
                                        <ResourcePill
                                            key={resource}
                                            resource={resource}
                                            count={resolvedCampaign.resources[resource] ?? 0}
                                            className="text-xs"
                                        />
                                    ))}
                                </span>
                            </div>
                        </div>
                    )}
                    {adminKnowledgePanel && (
                        <div className="flex-1 rounded-lg border border-border-custom bg-surface-light p-3">
                            {adminKnowledgePanel}
                        </div>
                    )}
                </div>
            )}
            {isAdmin && !useGridView ? (
                resolvedCampaign?.resources ? (
                    displayResearchTrees.length === 0 ? (
                        <p className="text-sm text-muted">No research trees available.</p>
                    ) : selectedTree ? (
                        <ResearchTreeContent
                            tree={selectedTree}
                            dimmed={selectedTreeDimmed}
                            account={account ?? null}
                            character={character}
                            equipment={equipment}
                            researchTrees={viewResearch.researchTrees}
                            researchNodeLevels={viewResearch.researchNodeLevels}
                            researchSources={viewResearch.researchSources}
                            campaignResources={resolvedCampaign.resources}
                            saving={saving}
                            canResetResearch
                            isAdmin={isAdmin}
                            onResearchNode={(treeId, nodeId, asAdmin) => void handleResearchNode(treeId, nodeId, asAdmin)}
                            onResetResearch={(treeIds) => void handleResetResearch(treeIds)}
                            onResetPurchasedResearch={() => void handleResetResearchBySource(ResearchSource.Purchased)}
                            onResetAdminResearch={() => void handleResetResearchBySource(ResearchSource.Admin)}
                        />
                    ) : null
                ) : (
                    <p className="text-sm text-muted">Campaign resources not loaded.</p>
                )
            ) : (
                <ResearchedNodesGrid
                    availableTrees={displayResearchTrees}
                    researchTrees={viewResearch.researchTrees}
                    filterTreeId={selectedTreeId}
                    showUnowned={isAdmin}
                    account={account ?? null}
                    character={character}
                    equipment={equipment}
                    researchNodeLevels={viewResearch.researchNodeLevels}
                    researchSources={viewResearch.researchSources}
                    campaignResources={resolvedCampaign?.resources}
                    onResearchNode={(treeId, nodeId, asAdmin) => void handleResearchNode(treeId, nodeId, asAdmin)}
                    saving={saving}
                    isAdmin={isAdmin}
                    onResetPurchasedResearch={() => void handleResetResearchBySource(ResearchSource.Purchased)}
                    onResetAdminResearch={
                        isAdmin ? () => void handleResetResearchBySource(ResearchSource.Admin) : undefined
                    }
                />
            )}
        </div>
    );

    const mapProps = {
        character,
        isAdmin,
        onStartMission: onStartMission ?? (() => {}),
        onStartQuest: onStartQuest ? handleMapStartQuest : undefined,
        onAbandonQuest: onStartQuest ? handleAbandonQuest : undefined,
        onResetQuest: isAdmin ? handleResetQuest : undefined,
        onMarkVictory: isAdmin ? handleMarkVictory : undefined,
        onCampaignChange: isAdmin ? handleCampaignChange : undefined,
        onSkipChapter: isAdmin ? setSkipChapter : undefined,
    };

    const chapterSkipModal =
        skipChapter && chapterSkipStart
            ? createPortal(
                <ChapterSkipWizard
                    chapter={skipChapter}
                    start={chapterSkipStart}
                    ctx={chapterSkipCtx}
                    onApply={(_picks, plan) => handleApplyChapterSkip(plan)}
                    onClose={() => setSkipChapter(null)}
                />,
                document.body,
            )
            : null;

    const bonusesProps = {
        researchTrees,
        researchNodeLevels,
    };

    if (useRoutedInnerTabs) {
        return (
            <CharactersTabLayerOne
                tab={innerTab}
                onSelectTab={setRoutedInnerTab}
                visibleTabs={visibleInnerTabs}
                nameSection={nameSection}
                enduranceSection={enduranceSection}
                showPortraitArrows={!isEditingName && innerTabShowsPortrait(innerTab)}
                onPrevPortrait={goPrevPortrait}
                onNextPortrait={goNextPortrait}
                onChangeCharacters={onChangeCharacters}
                portrait={innerTabShowsPortrait(innerTab) ? portraitBlock : undefined}
                leftByTab={{
                    equipment: equipmentLeft,
                    upgrades: researchLeft,
                }}
            >
                <CharactersTabLayerTwo
                    tab={innerTab}
                    map={mapProps}
                    bonuses={bonusesProps}
                    upgrades={researchRight}
                    equipment={equipmentRight}
                />
                {chapterSkipModal}
            </CharactersTabLayerOne>
        );
    }

    return (
        <div className="flex flex-col h-full w-full bg-surface overflow-hidden">
            {chapterSkipModal}
            {/* Tabs */}
            <div className="flex gap-1 px-2 pt-2 border-b border-border-custom shrink-0">
                {!hideMissionMap && (
                    <button
                        type="button"
                        data-testid={TestIds.characterEditorMissionMapTab}
                        className={`px-3 py-2 border-b-2 text-sm cursor-pointer ${
                            activeTab === 'missionMap'
                                ? 'border-primary text-primary'
                                : 'border-transparent text-muted hover:text-white'
                        }`}
                        onClick={() => setActiveTab('missionMap')}
                    >
                        Mission Map
                    </button>
                )}
                {isAdmin && (
                    <button
                        type="button"
                        className={`px-3 py-2 border-b-2 text-sm cursor-pointer ${
                            activeTab === 'equipment'
                                ? 'border-primary text-primary'
                                : 'border-transparent text-muted hover:text-white'
                        }`}
                        onClick={() => setActiveTab('equipment')}
                    >
                        Equipment
                    </button>
                )}
                {showUpgradesTab && (
                    <button
                        type="button"
                        className={`px-3 py-2 border-b-2 text-sm cursor-pointer ${
                            activeTab === 'research'
                                ? 'border-primary text-primary'
                                : 'border-transparent text-muted hover:text-white'
                        }`}
                        onClick={() => setActiveTab('research')}
                    >
                        Upgrades
                    </button>
                )}
                {showStatBonusesTab && (
                    <button
                        type="button"
                        className={`px-3 py-2 border-b-2 text-sm cursor-pointer ${
                            activeTab === 'statBonuses'
                                ? 'border-primary text-primary'
                                : 'border-transparent text-muted hover:text-white'
                        }`}
                        onClick={() => setActiveTab('statBonuses')}
                    >
                        Stat Bonuses
                    </button>
                )}
            </div>

            {/* Content: left (portrait + sidebar) | right (main) */}
            <div className="flex-1 min-h-0 flex overflow-hidden">
                {/* Left column: portrait + panel-specific sidebar */}
                <div className={`flex ${CHARACTER_EDITOR_LEFT_WIDTH_CLASS} flex-col shrink-0 border-r border-border-custom bg-background/50`}>
                    <div className="flex flex-col shrink-0 max-w-full box-border border-b border-border-custom p-4">
                        <div className="flex items-center justify-between gap-2 min-w-0 border-b border-border-custom pb-4">
                            <div className="flex min-w-0 flex-1 items-center gap-2">{nameSection}</div>
                            {!isEditingName && activeTab !== 'research' && (
                                <PortraitCycleButtons onPrev={goPrevPortrait} onNext={goNextPortrait} />
                            )}
                        </div>
                        {activeTab !== 'research' && portraitBlock}
                        <div className="mt-3 flex justify-center">{enduranceSection}</div>
                        {onChangeCharacters && (activeTab === 'missionMap' || activeTab === 'research' || activeTab === 'statBonuses') && (
                            <button
                                type="button"
                                data-testid={TestIds.charactersChange}
                                onClick={onChangeCharacters}
                                className="mt-3 w-full rounded-lg border border-border-custom bg-surface-light px-3 py-1.5 text-xs font-medium text-muted hover:text-white hover:border-primary transition-colors cursor-pointer"
                            >
                                {CHANGE_CHARACTERS_LABEL}
                            </button>
                        )}
                    </div>

                    {activeTab === 'missionMap' || activeTab === 'statBonuses' ? null : activeTab === 'equipment' ? (
                        equipmentLeft
                    ) : activeTab === 'research' ? (
                        researchLeft
                    ) : null}
                </div>

                <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
                    {activeTab === 'missionMap' && (
                        <div className="flex-1 min-h-0 overflow-auto p-2 flex flex-col">
                            <div className="flex-1 min-h-0">
                                <MissionMapTab {...mapProps} />
                            </div>
                        </div>
                    )}
                    {activeTab === 'equipment' && equipmentRight}
                    {activeTab === 'research' && showUpgradesTab && researchRight}
                    {activeTab === 'statBonuses' && showStatBonusesTab && (
                        <div className="flex-1 min-h-0 overflow-auto p-4">
                            <StatBonusesTab {...bonusesProps} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

interface EquipmentDollProps {
    equipment: string[];
    slotDescriptors: SlotDescriptor[];
    onDropOnSlot: (e: React.DragEvent, slot: EquipmentSlotType, slotIndex?: number) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragStartSlot: (e: React.DragEvent, slot: EquipmentSlotType, slotIndex?: number) => void;
    onDragEnd: () => void;
    dragItemId: string | null;
    dragSlot: EquipmentSlotType | null;
    editMode: boolean;
}

interface EquippedItemsListProps {
    equipment: string[];
    slotDescriptors: SlotDescriptor[];
    onDropOnSlot: (e: React.DragEvent, slot: EquipmentSlotType, slotIndex?: number) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragStartSlot: (e: React.DragEvent, slot: EquipmentSlotType, slotIndex?: number) => void;
    onDragEnd: () => void;
    editMode: boolean;
}

function EquippedItemsList({
    equipment,
    slotDescriptors,
    onDropOnSlot,
    onDragOver,
    onDragStartSlot,
    onDragEnd,
    editMode,
}: EquippedItemsListProps) {
    return (
        <div className="grid grid-flow-col grid-rows-[4rem_4rem] auto-cols-max gap-2 overflow-x-auto pb-1 -mx-1 px-1 w-full min-w-0">
            {slotDescriptors.map((desc) => {
                const itemId = getEquippedForSlot(equipment, desc.type, desc.index);
                const def = itemId ? getItemDef(itemId) : null;
                const iconUrl = itemId ? ITEM_ICON_URLS[itemId] : null;
                const key = desc.index !== undefined ? `${desc.type}_${desc.index}` : desc.type;
                return (
                    <div
                        key={key}
                        className={`flex shrink-0 w-16 h-16 flex-col items-center justify-center rounded border-2 border-dashed border-border-custom bg-surface/80 p-1 ${
                            editMode ? 'cursor-pointer hover:border-primary' : 'cursor-default'
                        } transition-colors`}
                        onDrop={editMode ? (e) => onDropOnSlot(e, desc.type, desc.index) : undefined}
                        onDragOver={editMode ? onDragOver : undefined}
                        onDragStart={editMode && itemId ? (e) => onDragStartSlot(e, desc.type, desc.index) : undefined}
                        draggable={editMode && !!itemId}
                        onDragEnd={editMode ? onDragEnd : undefined}
                        title={def?.name ?? desc.label}
                    >
                        {iconUrl ? (
                            <img
                                src={iconUrl}
                                alt={def?.name ?? desc.label}
                                className="w-8 h-8 object-contain pointer-events-none"
                            />
                        ) : (
                            <span className="text-[10px] text-muted text-center leading-tight px-0.5">{desc.label}</span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

/** Position hints for slot types; multiple weapon/utility use row. */
const SLOT_POSITIONS: Record<EquipmentSlotType, { left: string; top: string }> = {
    core: { left: '10%', top: '5%' },
    weapon: { left: '62%', top: '42%' },
    utility: { left: '36%', top: '70%' },
};

function EquipmentDoll({
    equipment,
    slotDescriptors,
    onDropOnSlot,
    onDragOver,
    onDragStartSlot,
    onDragEnd,
    editMode,
}: EquipmentDollProps) {
    const containerSize = 200;

    return (
        <div
            className="relative rounded-lg border border-border-custom bg-surface-light flex items-center justify-center"
            style={{ width: containerSize, height: 260 }}
        >
            {/* Stick figure: head, body, arms, legs */}
            <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox="0 0 100 130"
                preserveAspectRatio="xMidYMid meet"
            >
                <circle cx="50" cy="18" r="12" fill="none" stroke="#6b7280" strokeWidth="2" />
                <line x1="50" y1="30" x2="50" y2="55" stroke="#6b7280" strokeWidth="2" />
                <line x1="50" y1="38" x2="25" y2="50" stroke="#6b7280" strokeWidth="2" />
                <line x1="50" y1="38" x2="75" y2="50" stroke="#6b7280" strokeWidth="2" />
                <line x1="50" y1="55" x2="35" y2="95" stroke="#6b7280" strokeWidth="2" />
                <line x1="50" y1="55" x2="65" y2="95" stroke="#6b7280" strokeWidth="2" />
            </svg>

            {slotDescriptors.map((desc, _i) => {
                const itemId = getEquippedForSlot(equipment, desc.type, desc.index);
                const def = itemId ? getItemDef(itemId) : null;
                const iconUrl = itemId ? ITEM_ICON_URLS[itemId] : null;
                const base = SLOT_POSITIONS[desc.type];
                const offset = desc.index !== undefined && desc.index > 0 ? desc.index * 14 : 0;
                const pos = {
                    left: base.left,
                    top: `calc(${base.top} + ${offset}%)`,
                };
                const key = desc.index !== undefined ? `${desc.type}_${desc.index}` : desc.type;
                return (
                    <div
                        key={key}
                        className={`absolute w-12 h-12 flex items-center justify-center rounded border-2 border-dashed border-border-custom bg-surface/80 ${
                            editMode ? 'cursor-pointer hover:border-primary' : 'cursor-default'
                        } transition-colors`}
                        style={{ left: pos.left, top: pos.top }}
                        onDrop={editMode ? (e) => onDropOnSlot(e, desc.type, desc.index) : undefined}
                        onDragOver={editMode ? onDragOver : undefined}
                        onDragStart={editMode && itemId ? (e) => onDragStartSlot(e, desc.type, desc.index) : undefined}
                        draggable={editMode && !!itemId}
                        onDragEnd={editMode ? onDragEnd : undefined}
                        title={def?.name ?? desc.label}
                    >
                        {iconUrl ? (
                            <img src={iconUrl} alt={def?.name ?? desc.label} className="w-8 h-8 object-contain pointer-events-none" />
                        ) : (
                            <span className="text-xs text-muted">{desc.label}</span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
