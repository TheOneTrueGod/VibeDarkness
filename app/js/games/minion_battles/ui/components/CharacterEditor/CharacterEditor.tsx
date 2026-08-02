/**
 * Character Editor - edit portrait and equipment for a campaign character.
 * Portrait with prev/next on the same row as the name; tabs (Equipment / Upgrades).
 * Equipment sidebar: paper doll or horizontal equipped-items list; inventory grid; drag to equip.
 */
import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
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
import CharacterPortrait from '../CharacterPortrait';
import InventoryPanel from './InventoryPanel';
import { ResearchTreeList, ResearchTreeContent, ResearchedNodesGrid } from '../ResearchTreePanel';
import type { AccountState, CampaignResources, CampaignState } from '../../../../../types';
import { TestIds } from '../../../../../testing/testIds';
import { getCoreFromEquipment } from '../../../character_defs/items';
import { RESEARCH_TREES } from '../../../../../researchTrees/list';
import {
    canResearchNode,
    applyResearchEffects,
    sortNodesDeterministic,
    prereqClosure,
    treeHasAnyResearch,
} from '../../../../../researchTrees/evaluator';
import { getNodeMaxLevels } from '../../../../../researchTrees/passiveBonuses';
import ResourcePill from '../../../../../components/ResourcePill';
import { getShowAllResearchTrees, subscribeShowAllResearchTrees } from '../../../../../debugFlags';
import MissionMapTab from './MissionMapTab';
import StatBonusesTab from './StatBonusesTab';
import { STORYLINES, getQuestDef } from '../../../storylines/index';
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
    /** Optional inventory to display and drag from; defaults to the standard player inventory. */
    inventoryItems?: string[];
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
    /** Start / continue a QuestRun lobby (new starts may go through Quest Prep first). */
    onStartQuest?: (questDefId: string, options?: StartQuestOptions) => void;
    /** When true, hides the Mission Map tab (e.g. when opened from inside a lobby). */
    hideMissionMap?: boolean;
    /** Admin-only content rendered pinned to the bottom of the Equipment tab (e.g. item grant UI). */
    adminEquipmentPanel?: React.ReactNode;
    /** Admin-only content rendered next to the grant-campaign-resources block in the Upgrades tab. */
    adminKnowledgePanel?: React.ReactNode;
}

/** Quest Prep: equip Campaign Character, then confirm to freeze into Quest Character. */
type QuestPrepState = {
    questDefId: string;
    assignedBankId: string | null;
};

type EditorTab = 'missionMap' | 'equipment' | 'research' | 'statBonuses';
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
    inventoryItems,
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
    const [activeTab, setActiveTab] = useState<EditorTab>(() => hideMissionMap ? 'research' : 'missionMap');
    const [saving, setSaving] = useState(false);
    const [dragItemId, setDragItemId] = useState<string | null>(null);
    const [dragSlot, setDragSlot] = useState<EquipmentSlotType | null>(null);
    const [researchTrees, setResearchTrees] = useState<Record<string, string[]>>(() => character.researchTrees ?? {});
    const [researchNodeLevels, setResearchNodeLevels] = useState<Record<string, Record<string, number>>>(
        () => character.researchNodeLevels ?? {},
    );
    const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
    const [adminUseGridView, setAdminUseGridView] = useState(false);
    const [localCampaign, setLocalCampaign] = useState<CampaignState | null>(null);
    const [grantResourceKey, setGrantResourceKey] = useState<'food' | 'metal' | 'population' | 'crystals'>('food');
    const [grantResourceAmount, setGrantResourceAmount] = useState<string>('1');
    const [questPrep, setQuestPrep] = useState<QuestPrepState | null>(null);
    const [questPrepStarting, setQuestPrepStarting] = useState(false);

    const selectedPortraitId = portraitIds[portraitIndex] ?? portraitIds[0];
    const portrait = getPortrait(selectedPortraitId);
    const displayName = name || (portrait?.name ?? 'Adventurer');

    const resolvedCampaign = campaign ?? localCampaign;
    const permissionAccount = viewerAccount ?? account ?? null;
    /** During Quest Prep, reuse Equipment tab in edit (freeze) mode even for non-admins. */
    const inQuestPrep = questPrep != null;
    const effectiveEditMode = editMode || inQuestPrep;
    const effectiveShowInventory = showInventoryPanel || inQuestPrep;
    const questPrepDef = questPrep ? getQuestDef(questPrep.questDefId) : undefined;

    const showAllResearchTreesDebug = useSyncExternalStore(
        subscribeShowAllResearchTrees,
        getShowAllResearchTrees,
        getShowAllResearchTrees,
    );

    useEffect(() => {
        setEquipment([...character.equipment]);
        setResearchTrees(character.researchTrees ?? {});
        setResearchNodeLevels(character.researchNodeLevels ?? {});
    }, [character.equipment, character.researchTrees, character.researchNodeLevels]);

    useEffect(() => {
        setName(character.name);
        setNameDraft(character.name);
        setIsEditingName(false);
    }, [character.name, character.id]);

    /** Trees the character is allowed to see (gating), used for normal list and for dimming in debug “show all”. */
    const eligibleResearchTrees = useMemo(() => {
        const ctx = {
            account: (account ?? { id: 0, name: '', role: 'user', fire: 0, water: 0, earth: 0, air: 0 }) as AccountState,
            character: { ...character, equipment, researchTrees, researchNodeLevels } as CampaignCharacter,
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
    }, [account, character, equipment, researchTrees, researchNodeLevels, resolvedCampaign?.resources]);

    const displayResearchTrees = showAllResearchTreesDebug ? RESEARCH_TREES : eligibleResearchTrees;

    const dimmedResearchTreeIds = useMemo(() => {
        if (!showAllResearchTreesDebug) return new Set<string>();
        const eligibleIds = new Set(eligibleResearchTrees.map((t) => t.id));
        return new Set(RESEARCH_TREES.filter((t) => !eligibleIds.has(t.id)).map((t) => t.id));
    }, [showAllResearchTreesDebug, eligibleResearchTrees]);

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
        if (activeTab !== 'research') {
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

    const saveEquipment = useCallback(
        async (newEquipment: string[]) => {
            setSaving(true);
            try {
                const updated = await api.updateCharacter(character.id, { equipment: newEquipment });
                setEquipment(updated.equipment ?? newEquipment);
                onSaved?.({ equipment: updated.equipment ?? newEquipment, name, portraitId: selectedPortraitId });
            } catch (e) {
                console.error('Failed to save equipment:', e);
            } finally {
                setSaving(false);
            }
        },
        [character.id, api, name, onSaved, selectedPortraitId]
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
        const accountInventory = account?.inventoryItemIds ?? [];
        const base = isAdminViewer
            ? ALL_PLAYER_ITEMS
            : (inventoryItems ?? (inQuestPrep ? accountInventory : []));
        return base.filter((id) => !equipment.includes(id));
    }, [permissionAccount?.role, equipment, inventoryItems, account?.inventoryItemIds, inQuestPrep]);


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

    const handleResetResearch = useCallback(
        async (treeIds: string[]) => {
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
                const nextResearchTrees: Record<string, string[]> = { ...researchTrees };
                const nextResearchNodeLevels: Record<string, Record<string, number>> = {
                    ...researchNodeLevels,
                };
                let nextEquipment = [...equipment];

                for (const treeId of treeIds) {
                    const tree = RESEARCH_TREES.find((t) => t.id === treeId);
                    if (!tree) continue;

                    const researchedForTree = researchTrees[treeId] ?? [];
                    const researchedSet = new Set(researchedForTree);
                    nextResearchTrees[treeId] = [];
                    delete nextResearchNodeLevels[treeId];

                    // Reverse any replaceEquippedItem operations coming from nodes we are un-researching.
                    const researchedNodes = tree.nodes.filter((n) => researchedSet.has(n.id));
                    const ordered = sortNodesDeterministic(researchedNodes);
                    for (const node of [...ordered].reverse()) {
                        for (const eff of node.effects) {
                            if (eff.type !== 'replaceEquippedItem') continue;
                            // Undo "from -> to" by reverting any current "to" back to "from".
                            if (nextEquipment.includes(eff.toItemId)) {
                                nextEquipment = nextEquipment.filter((id) => id !== eff.toItemId);
                                if (!nextEquipment.includes(eff.fromItemId)) nextEquipment.push(eff.fromItemId);
                            }
                        }
                    }
                }

                const updatedChar = await api.updateCharacter(character.id, {
                    equipment: nextEquipment,
                    researchTrees: nextResearchTrees,
                    researchNodeLevels: nextResearchNodeLevels,
                });

                setResearchTrees(updatedChar.researchTrees ?? nextResearchTrees);
                setResearchNodeLevels(updatedChar.researchNodeLevels ?? nextResearchNodeLevels);
                setEquipment(updatedChar.equipment ?? nextEquipment);
                onSaved?.({ equipment: updatedChar.equipment ?? nextEquipment, name, portraitId: selectedPortraitId });
            } catch (e) {
                console.error('Failed to reset research:', e);
            } finally {
                setSaving(false);
            }
        },
        [character.id, equipment, api, name, permissionAccount?.role, researchTrees, researchNodeLevels, selectedPortraitId, onSaved]
    );

    const handleResearchNode = useCallback(
        async (treeId: string, nodeId: string) => {
            if (!resolvedCampaign?.resources) return;
            const tree = RESEARCH_TREES.find((t) => t.id === treeId);
            if (!tree) return;

            const ctx = {
                account: (account ?? { id: 0, name: '', role: 'user', fire: 0, water: 0, earth: 0, air: 0 }) as AccountState,
                character: { ...character, equipment, researchTrees, researchNodeLevels } as CampaignCharacter,
                campaignResources: resolvedCampaign.resources,
            };

            const check = canResearchNode(tree, nodeId, ctx);
            if (!check.ok) return;

            const targetNode = tree.nodes.find((n) => n.id === nodeId);
            const maxLevels = targetNode ? getNodeMaxLevels(targetNode) : 1;
            const already = new Set(researchTrees[treeId] ?? []);
            // Level-ups only post the target node; first unlock may auto-research prereqs.
            const isLevelUp = already.has(nodeId);
            const toDo = isLevelUp
                ? [nodeId]
                : prereqClosure(tree, nodeId).filter((id) => !already.has(id));

            setSaving(true);
            try {
                for (const nid of toDo) {
                    const nodeDef = tree.nodes.find((n) => n.id === nid);
                    const updated = await api.researchCharacterNode(character.id, {
                        treeId,
                        nodeId: nid,
                        maxLevels: nodeDef ? getNodeMaxLevels(nodeDef) : maxLevels,
                    });
                    setResearchTrees(updated.researchTrees ?? {});
                    setResearchNodeLevels(updated.researchNodeLevels ?? {});
                }
                const latest = await api.getCharacter(character.id);
                const latestTrees = latest.researchTrees ?? {};
                const latestLevels = latest.researchNodeLevels ?? {};
                setResearchTrees(latestTrees);
                setResearchNodeLevels(latestLevels);
                const ctx2 = {
                    account: ctx.account,
                    character: {
                        ...character,
                        equipment,
                        researchTrees: latestTrees,
                        researchNodeLevels: latestLevels,
                    } as CampaignCharacter,
                    campaignResources: resolvedCampaign.resources,
                };
                const applied = applyResearchEffects(tree, ctx2);
                const newEquipment = applied.equipment;
                if (JSON.stringify(newEquipment) !== JSON.stringify(equipment)) {
                    const updatedChar = await api.updateCharacter(character.id, { equipment: newEquipment });
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
            researchTrees,
            researchNodeLevels,
            resolvedCampaign?.resources,
            selectedPortraitId,
            name,
            onSaved,
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

    const isAdmin = permissionAccount?.role === 'admin';
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

    /** Continue skips prep; new starts open Equipment tab (freeze loadout → Quest Character). */
    const handleMapStartQuest = useCallback(
        (questDefId: string, options?: StartQuestOptions) => {
            if (!onStartQuest) return;
            if (options?.mode === 'continue') {
                onStartQuest(questDefId, options);
                return;
            }
            setQuestPrep({
                questDefId,
                assignedBankId: options?.assignedBankId ?? null,
            });
            setActiveTab('equipment');
        },
        [onStartQuest],
    );

    const cancelQuestPrep = useCallback(() => {
        setQuestPrep(null);
        setQuestPrepStarting(false);
        if (!hideMissionMap) setActiveTab('missionMap');
    }, [hideMissionMap]);

    const confirmQuestPrep = useCallback(() => {
        if (!questPrep || !onStartQuest) return;
        setQuestPrepStarting(true);
        try {
            onStartQuest(questPrep.questDefId, {
                mode: 'start',
                assignedBankId: questPrep.assignedBankId,
                // Prefer editor state so a just-saved equip is frozen into Quest Character.
                equipment: [...equipment],
            });
            setQuestPrep(null);
        } finally {
            setQuestPrepStarting(false);
        }
    }, [questPrep, onStartQuest, equipment]);

    const firstTreeId = displayResearchTrees[0]?.id ?? null;
    const selectedTree = displayResearchTrees.find((t) => t.id === (selectedTreeId ?? firstTreeId));
    const selectedTreeDimmed = selectedTree ? dimmedResearchTreeIds.has(selectedTree.id) : false;

    return (
        <div className="flex flex-col h-full w-full bg-surface rounded-lg border border-border-custom overflow-hidden">
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
                {(isAdmin || inQuestPrep) && (
                    <button
                        type="button"
                        className={`px-3 py-2 border-b-2 text-sm cursor-pointer ${
                            activeTab === 'equipment'
                                ? 'border-primary text-primary'
                                : 'border-transparent text-muted hover:text-white'
                        }`}
                        onClick={() => setActiveTab('equipment')}
                    >
                        Equipment{inQuestPrep ? ' (Quest Prep)' : ''}
                    </button>
                )}
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
            </div>

            {/* Content: left (portrait + sidebar) | right (main) */}
            <div className="flex-1 min-h-0 flex overflow-hidden">
                {/* Left column: portrait + panel-specific sidebar */}
                <div className="flex w-[232px] flex-col shrink-0 border-r border-border-custom bg-background/50">
                    {/* Character portrait — 16px (p-4) inset; name row; rule; portrait */}
                    <div className="flex flex-col shrink-0 max-w-full box-border border-b border-border-custom p-4">
                        <div className="flex items-center justify-between gap-2 min-w-0 border-b border-border-custom pb-4">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
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
                            </div>
                            {!isEditingName && activeTab !== 'research' && (
                                <div className="flex gap-2 shrink-0">
                                    <button
                                        type="button"
                                        className="w-8 h-8 rounded border border-border-custom bg-surface-light text-white flex items-center justify-center hover:bg-border-custom cursor-pointer text-sm font-bold"
                                        onClick={goPrevPortrait}
                                        aria-label="Previous portrait"
                                    >
                                        ‹
                                    </button>
                                    <button
                                        type="button"
                                        className="w-8 h-8 rounded border border-border-custom bg-surface-light text-white flex items-center justify-center hover:bg-border-custom cursor-pointer text-sm font-bold"
                                        onClick={goNextPortrait}
                                        aria-label="Next portrait"
                                    >
                                        ›
                                    </button>
                                </div>
                            )}
                        </div>
                        {activeTab !== 'research' && (
                            <div className="flex justify-center pt-4">
                                <CharacterPortrait
                                    picture={portrait?.picture ?? ''}
                                    sizePx={200}
                                />
                            </div>
                        )}
                    </div>

                    {/* Panel-specific sidebar */}
                    {activeTab === 'missionMap' || activeTab === 'statBonuses' ? null : activeTab === 'equipment' ? (
                        <div className="flex-1 min-h-0 overflow-auto p-3">
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
                    ) : activeTab === 'research' ? (
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
                                    researchTrees={researchTrees}
                                    canResetResearch={isAdmin && !adminUseGridView}
                                    resetSaving={saving}
                                    onResetResearchTree={(treeId) => void handleResetResearch([treeId])}
                                    showAllOption={useGridView}
                                    onSelectAll={() => setSelectedTreeId(null)}
                                />
                            </div>
                        </div>
                    ) : null}
                </div>

                {/* Right column: panel main container */}
                <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
                    {activeTab === 'missionMap' && (
                        <div className="flex-1 min-h-0 overflow-auto p-4 flex flex-col">
                            {isAdmin && (
                                <div className="shrink-0 flex items-center gap-2 pb-2 border-b border-border-custom mb-2">
                                    <label className="text-xs text-muted shrink-0">Campaign:</label>
                                    <select
                                        value={character.campaignId}
                                        onChange={(e) => void handleCampaignChange(e.target.value)}
                                        className="text-xs bg-surface border border-border-custom rounded px-2 py-1 text-white flex-1"
                                    >
                                        {STORYLINES.map((s) => (
                                            <option key={s.id} value={s.id}>{s.title}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <div className="flex-1 min-h-0">
                                <MissionMapTab
                                    character={character}
                                    isAdmin={isAdmin}
                                    onStartMission={onStartMission ?? (() => {})}
                                    onStartQuest={onStartQuest ? handleMapStartQuest : undefined}
                                    onMarkVictory={isAdmin ? handleMarkVictory : undefined}
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === 'equipment' && (
                        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                            {inQuestPrep && (
                                <div
                                    data-testid={TestIds.questPrepBanner}
                                    className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-b border-amber-700/40 bg-amber-950/35 px-4 py-2.5"
                                >
                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold text-amber-200">
                                            Quest Prep — {questPrepDef?.title ?? questPrep?.questDefId}
                                        </p>
                                        <p className="text-[11px] text-amber-100/70 mt-0.5">
                                            Equip your Campaign Character, then confirm to freeze loadout into the
                                            Quest Character and open the first mission.
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            type="button"
                                            data-testid={TestIds.questPrepCancel}
                                            onClick={cancelQuestPrep}
                                            className="px-3 py-1.5 rounded-lg border border-border-custom bg-surface text-xs text-zinc-300 hover:text-white cursor-pointer"
                                            disabled={questPrepStarting}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            data-testid={TestIds.questPrepConfirm}
                                            onClick={confirmQuestPrep}
                                            className="px-3 py-1.5 rounded-lg bg-primary text-secondary text-xs font-bold hover:opacity-90 active:scale-95 transition-all cursor-pointer disabled:opacity-60"
                                            disabled={questPrepStarting || saving}
                                        >
                                            {questPrepStarting ? 'Starting…' : 'Confirm & start quest'}
                                        </button>
                                    </div>
                                </div>
                            )}
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
                    )}

                    {activeTab === 'research' && (
                        <div className="flex-1 min-h-0 overflow-auto p-4">
                            {!isAdmin ? (
                                <ResearchedNodesGrid
                                    availableTrees={displayResearchTrees}
                                    researchTrees={researchTrees}
                                    filterTreeId={selectedTreeId}
                                />
                            ) : (
                                <>
                                    {(resolvedCampaign?.resources || adminKnowledgePanel) && (
                                        <div className="mb-4 flex gap-3">
                                            {resolvedCampaign?.resources && permissionAccount?.role === 'admin' && (
                                                <div className="flex-1 rounded-lg border border-border-custom bg-surface-light p-3">
                                                    <p className="text-xs text-muted mb-2">Admin: grant campaign resource</p>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <select
                                                            className="rounded-md border border-border-custom bg-surface px-2 py-1 text-sm text-white"
                                                            value={grantResourceKey}
                                                            onChange={(e) => setGrantResourceKey(e.target.value as typeof grantResourceKey)}
                                                        >
                                                            <option value="food">food</option>
                                                            <option value="metal">metal</option>
                                                            <option value="population">population</option>
                                                            <option value="crystals">crystals</option>
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
                                                        <span className="text-xs text-muted flex flex-wrap items-center gap-2">
                                                            <span>Current:</span>
                                                            <ResourcePill resource="food" count={resolvedCampaign.resources.food} className="text-xs" />
                                                            <ResourcePill resource="metal" count={resolvedCampaign.resources.metal} className="text-xs" />
                                                            <ResourcePill resource="population" count={resolvedCampaign.resources.population} className="text-xs" />
                                                            <ResourcePill resource="crystals" count={resolvedCampaign.resources.crystals} className="text-xs" />
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
                                    {resolvedCampaign?.resources ? (
                                        displayResearchTrees.length === 0 ? (
                                            <p className="text-sm text-muted">No research trees available.</p>
                                        ) : !useGridView ? (
                                            selectedTree ? (
                                                <ResearchTreeContent
                                                    tree={selectedTree}
                                                    dimmed={selectedTreeDimmed}
                                                    account={account ?? null}
                                                    character={character}
                                                    equipment={equipment}
                                                    researchTrees={researchTrees}
                                                    researchNodeLevels={researchNodeLevels}
                                                    campaignResources={resolvedCampaign.resources}
                                                    saving={saving}
                                                    canResetResearch
                                                    isAdmin={isAdmin}
                                                    onResearchNode={(treeId, nodeId) => void handleResearchNode(treeId, nodeId)}
                                                    onResetResearch={(treeIds) => void handleResetResearch(treeIds)}
                                                />
                                            ) : null
                                        ) : (
                                            <ResearchedNodesGrid
                                                availableTrees={displayResearchTrees}
                                                researchTrees={researchTrees}
                                                filterTreeId={selectedTreeId}
                                            />
                                        )
                                    ) : (
                                        <p className="text-sm text-muted">Campaign resources not loaded.</p>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {activeTab === 'statBonuses' && (
                        <div className="flex-1 min-h-0 overflow-auto p-4">
                            <StatBonusesTab
                                researchTrees={researchTrees}
                                researchNodeLevels={researchNodeLevels}
                            />
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
