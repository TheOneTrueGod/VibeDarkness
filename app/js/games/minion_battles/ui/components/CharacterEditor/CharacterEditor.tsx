/**
 * Character Editor - edit portrait and equipment for a campaign character.
 * Portrait with prev/next on the same row as the name; tabs (Equipment / Upgrades).
 * Equipment sidebar: paper doll or horizontal equipped-items list; inventory grid; drag to equip.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { getPortraitIdsForPlayer, getPortrait } from '../../../character_defs/portraits';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import type { MinionBattlesApi } from '../../../api/minionBattlesApi';
import type { CharacterUpdates } from '../../../api/types';
import CharacterPortrait from '../CharacterPortrait';
import InventoryPanel from './InventoryPanel';
import { ResearchTreeList } from '../ResearchTreePanel';
import type { AccountState, CampaignResourceKey, CampaignState } from '../../../../../types';
import { TestIds } from '../../../../../testing/testIds';
import {
    buildEquipmentUpdate as buildQuestAwareEquipmentUpdate,
    getInventoryItemIds,
    filterEquipmentMenuItemIds,
    getVisibleSlotDescriptors,
    isEquipmentLockedByQuest,
    type VisibleEquipmentSlot,
} from '../../../character_defs/items/equipmentSlots';
import {
    getActiveResearchNodeLevels,
    getActiveResearchTrees,
} from '../../../../../researchTrees/activeResearch';
import {
    mergeDarknessUpgradesIntoResearchView,
} from '../../../../../researchTrees/darknessUpgrades';
import { EMPTY_DARKNESS_UPGRADES, type DarknessUpgradesState } from '../../../../../types';
import { type ResearchNodeSources } from '../../../../../researchTrees/types';
import {
    getCharacterHungerDelta,
    getCharacterMaxHunger,
    hungerFromDelta,
} from '../../../character_defs/characterHunger';
import { CHARACTER_EDITOR_PORTRAIT_SIZE_PX, CharacterHungerBar } from './CharacterHungerBar';
import { RESET_CAMPAIGN_RESOURCES_CONFIRM } from '../../../../../campaignResources';
import MissionMapTab from './MissionMapTab';
import CharacterNameSection, { MAX_CHARACTER_NAME_LENGTH } from './CharacterNameSection';
import CharacterResearchPanel from './CharacterResearchPanel';
import EquipmentDoll from './EquipmentDoll';
import EquippedItemsList from './EquippedItemsList';
import { useResearchActions } from './useResearchActions';
import { useCharacterQuestActions } from './useCharacterQuestActions';
import { useResearchTreeView } from './useResearchTreeView';
import { useEquipmentDragDrop } from './useEquipmentDragDrop';
import { useChapterSkip } from './useChapterSkip';
import CharacterEditorTabBar from './CharacterEditorTabBar';
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

/** Slot descriptor for the doll: type and optional index for weapon/utility. */
export type SlotDescriptor = VisibleEquipmentSlot;

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
    const [grantResourceKey, setGrantResourceKey] = useState<CampaignResourceKey>('vigor');
    const [grantResourceAmount, setGrantResourceAmount] = useState<string>('1');

    const selectedPortraitId = portraitIds[portraitIndex] ?? portraitIds[0];
    const portrait = getPortrait(selectedPortraitId);
    const displayName = name || (portrait?.name ?? 'Adventurer');

    const resolvedCampaign = campaign ?? localCampaign;
    const permissionAccount = viewerAccount ?? account ?? null;
    const isAdmin = permissionAccount?.role === 'admin';
    /** Admin-only: shows the campaign-resource grant and knowledge panels on the Upgrades tab. */
    const [adminPanelsOpen, setAdminPanelsOpen] = useState(false);

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
    const equipmentLockedByQuest = isEquipmentLockedByQuest(character, isAdmin);
    const effectiveEditMode = editMode && !equipmentLockedByQuest;
    const effectiveShowInventory = showInventoryPanel;
    // Knowledge-gated slots: Utility 1 is hidden and the core slot locked until the character's
    // account has learned them.
    const unlockedSlots = useMemo(
        () => getVisibleSlotDescriptors(equipment, account?.knowledge),
        [equipment, account?.knowledge],
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

    const { displayResearchTrees, dimmedResearchTreeIds } = useResearchTreeView({
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
    });

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
        (newEquipment: string[]): CharacterUpdates =>
            buildQuestAwareEquipmentUpdate(character.activeQuestRun, newEquipment),
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
        const base = getInventoryItemIds(resolvedCampaign, permissionAccount?.role === 'admin');
        // Items for slot types the account can't customize (e.g. cores) stay out of the menu.
        return filterEquipmentMenuItemIds(base, account?.knowledge).filter((id) => !equipment.includes(id));
    }, [permissionAccount?.role, equipment, resolvedCampaign, account?.knowledge]);


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

    const { handleResetResearch, handleResetResearchBySource, handleResearchNode } = useResearchActions({
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
    });

    const {
        dragItemId,
        dragSlot,
        handleDragStartItem,
        handleDragStartSlot,
        handleDragOver,
        handleDropOnSlot,
        handleDragEnd,
    } = useEquipmentDragDrop({ equipment, effectiveEditMode, setEquipment, saveEquipment });

    const useGridView = !isAdmin || adminUseGridView;

    const {
        handleMarkVictory,
        handleMarkQuestVictory,
        handleCampaignChange,
        handleMapStartQuest,
        handleAbandonQuest,
        handleResetQuest,
    } = useCharacterQuestActions({ character, api, isAdmin, onSaved, onStartQuest });


    const { setSkipChapter, chapterSkipModal } = useChapterSkip({ character, account, api, isAdmin, resolvedCampaign, onSaved });

    const firstTreeId = displayResearchTrees[0]?.id ?? null;
    const selectedTree = displayResearchTrees.find((t) => t.id === (selectedTreeId ?? firstTreeId));
    const selectedTreeDimmed = selectedTree ? dimmedResearchTreeIds.has(selectedTree.id) : false;

    // Upgrades needs the owner's System: Upgrades knowledge (admins viewing always see it).
    const showUpgradesTab = shouldShowUpgradesTab(isAdmin, researchTrees, account?.knowledge);
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
        <CharacterNameSection
            canEditName={canEditName}
            isEditingName={isEditingName}
            displayName={displayName}
            nameDraft={nameDraft}
            saving={saving}
            placeholder={portrait?.name ?? 'Adventurer'}
            onStartEdit={() => {
                setNameDraft(name);
                setIsEditingName(true);
            }}
            onNameDraftChange={(value) => setNameDraft(sanitizeCharacterName(value))}
            onSave={() => void saveName()}
            onCancel={cancelNameEdit}
        />
    );

    const maxHunger = useMemo(
        () => getCharacterMaxHunger(researchTrees, researchNodeLevels),
        [researchTrees, researchNodeLevels],
    );
    const hunger = useMemo(
        () => hungerFromDelta(maxHunger, getCharacterHungerDelta(character), character.startingHungerFraction),
        [maxHunger, character],
    );
    const hungerSection = <CharacterHungerBar hunger={hunger} maxHunger={maxHunger} />;

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
                    slotDescriptors={unlockedSlots}
                    onDropOnSlot={handleDropOnSlot}
                    onDragOver={handleDragOver}
                    onDragStartSlot={handleDragStartSlot}
                    onDragEnd={handleDragEnd}
                    editMode={effectiveEditMode}
                />
            ) : (
                <EquipmentDoll
                    equipment={equipment}
                    slotDescriptors={unlockedSlots}
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
        <CharacterResearchPanel
            isAdmin={isAdmin}
            adminPanelsOpen={adminPanelsOpen}
            adminKnowledgePanel={adminKnowledgePanel}
            resolvedCampaign={resolvedCampaign}
            useGridView={useGridView}
            displayResearchTrees={displayResearchTrees}
            selectedTree={selectedTree}
            selectedTreeDimmed={selectedTreeDimmed}
            selectedTreeId={selectedTreeId}
            account={account}
            character={character}
            equipment={equipment}
            viewResearch={viewResearch}
            saving={saving}
            grantResourceKey={grantResourceKey}
            onGrantResourceKeyChange={setGrantResourceKey}
            grantResourceAmount={grantResourceAmount}
            onGrantResourceAmountChange={setGrantResourceAmount}
            onGrantResource={handleGrantResource}
            onResetResources={handleResetResources}
            onResearchNode={handleResearchNode}
            onResetResearch={handleResetResearch}
            onResetResearchBySource={handleResetResearchBySource}
        />
    );

    const mapProps = {
        character,
        isAdmin,
        onStartMission: onStartMission ?? (() => {}),
        onStartQuest: onStartQuest ? handleMapStartQuest : undefined,
        onAbandonQuest: onStartQuest ? handleAbandonQuest : undefined,
        onResetQuest: isAdmin ? handleResetQuest : undefined,
        onMarkVictory: isAdmin ? handleMarkVictory : undefined,
        onMarkQuestVictory: isAdmin ? handleMarkQuestVictory : undefined,
        onCampaignChange: isAdmin ? handleCampaignChange : undefined,
        onSkipChapter: isAdmin ? setSkipChapter : undefined,
    };

    const bonusesProps = {
        researchTrees,
        researchNodeLevels,
    };

    const adminPanelsToggle = isAdmin ? (
        <button
            type="button"
            aria-expanded={adminPanelsOpen}
            onClick={() => setAdminPanelsOpen((open) => !open)}
            title={adminPanelsOpen ? 'Hide admin panels' : 'Show admin panels'}
            className={`ml-auto flex items-center gap-1 self-center rounded border px-2 py-1 text-xs font-semibold transition-colors ${
                adminPanelsOpen
                    ? 'border-red-500/60 bg-red-900/40 text-red-200'
                    : 'border-border-custom text-muted hover:text-white'
            }`}
        >
            <ChevronRight
                className={`h-3.5 w-3.5 transition-transform ${adminPanelsOpen ? 'rotate-90' : ''}`}
                aria-hidden
            />
            Admin
        </button>
    ) : null;

    if (useRoutedInnerTabs) {
        return (
            <CharactersTabLayerOne
                tab={innerTab}
                onSelectTab={setRoutedInnerTab}
                visibleTabs={visibleInnerTabs}
                nameSection={nameSection}
                hungerSection={hungerSection}
                showPortraitArrows={!isEditingName && innerTabShowsPortrait(innerTab)}
                onPrevPortrait={goPrevPortrait}
                onNextPortrait={goNextPortrait}
                onChangeCharacters={onChangeCharacters}
                tabBarActions={adminPanelsToggle}
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
            <CharacterEditorTabBar
                activeTab={activeTab}
                onSelectTab={setActiveTab}
                hideMissionMap={hideMissionMap}
                isAdmin={isAdmin}
                showUpgradesTab={showUpgradesTab}
                showStatBonusesTab={showStatBonusesTab}
                actions={adminPanelsToggle}
            />

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
                        <div className="mt-3 flex justify-center">{hungerSection}</div>
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