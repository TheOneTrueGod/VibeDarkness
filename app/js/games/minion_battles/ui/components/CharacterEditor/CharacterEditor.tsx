/**
 * Character Editor - edit portrait and equipment for a campaign character.
 * Portrait with prev/next on the same row as the name; tabs (Equipment / Upgrades).
 * Equipment sidebar: paper doll or horizontal equipped-items list; inventory grid; drag to equip.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getPortraitIds, getPortrait } from '../../../character_defs/portraits';
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
import { ResearchTreeList, ResearchTreeContent } from '../ResearchTreePanel';
import type { AccountState, CampaignState } from '../../../../../types';
import { getCoreFromEquipment } from '../../../character_defs/items';
import { RESEARCH_TREES } from '../../../../../researchTrees/list';
import {
    canResearchNode,
    applyResearchEffects,
    sortNodesDeterministic,
    prereqClosure,
    treeHasAnyResearch,
} from '../../../../../researchTrees/evaluator';
import ResourcePill from '../../../../../components/ResourcePill';

interface CharacterEditorProps {
    character: CampaignCharacter;
    api: MinionBattlesApi;
    onSaved?: (updated: { equipment: string[]; name: string; portraitId: string }) => void;
    onClose?: () => void;
    /** Whether equipment editing is enabled. Defaults to false. */
    editMode?: boolean;
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
}

type EditorTab = 'equipment' | 'research';

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
    inventoryItems,
    showInventoryPanel = true,
    account,
    viewerAccount,
    campaign,
    equippedItemsDisplay = 'paperDoll',
}: CharacterEditorProps) {
    const portraitIds = useMemo(() => getPortraitIds(), []);
    const totalPortraits = portraitIds.length;

    const [portraitIndex, setPortraitIndex] = useState(() => {
        const i = portraitIds.indexOf(character.portraitId);
        return i >= 0 ? i : 0;
    });
    const name = character.name;
    const [equipment, setEquipment] = useState<string[]>(() => [...character.equipment]);
    const [activeTab, setActiveTab] = useState<EditorTab>('equipment');
    const [saving, setSaving] = useState(false);
    const [dragItemId, setDragItemId] = useState<string | null>(null);
    const [dragSlot, setDragSlot] = useState<EquipmentSlotType | null>(null);
    const [researchTrees, setResearchTrees] = useState<Record<string, string[]>>(() => character.researchTrees ?? {});
    const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
    const [localCampaign, setLocalCampaign] = useState<CampaignState | null>(null);
    const [grantResourceKey, setGrantResourceKey] = useState<'food' | 'metal' | 'population' | 'crystals'>('food');
    const [grantResourceAmount, setGrantResourceAmount] = useState<string>('1');

    const selectedPortraitId = portraitIds[portraitIndex] ?? portraitIds[0];
    const portrait = getPortrait(selectedPortraitId);

    const resolvedCampaign = campaign ?? localCampaign;
    const permissionAccount = viewerAccount ?? account ?? null;

    useEffect(() => {
        setEquipment([...character.equipment]);
        setResearchTrees(character.researchTrees ?? {});
    }, [character.equipment, character.researchTrees]);

    // Sync selected research tree when available trees change
    const availableTrees = useMemo(() => {
        const res = resolvedCampaign?.resources;
        if (!res) return [];
        const ctx = {
            account: (account ?? { id: 0, name: '', role: 'user', fire: 0, water: 0, earth: 0, air: 0 }) as AccountState,
            character: { ...character, equipment, researchTrees } as CampaignCharacter,
            campaignResources: res,
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
    }, [account, character, equipment, researchTrees, resolvedCampaign?.resources]);

    useEffect(() => {
        const firstId = availableTrees[0]?.id ?? null;
        const isSelectedStillAvailable = selectedTreeId != null && availableTrees.some((t) => t.id === selectedTreeId);
        if (!isSelectedStillAvailable) {
            setSelectedTreeId(firstId);
        }
    }, [availableTrees, selectedTreeId]);

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
        const base = isAdminViewer ? ALL_PLAYER_ITEMS : inventoryItems ?? [];
        return base.filter((id) => !equipment.includes(id));
    }, [permissionAccount?.role, equipment, inventoryItems]);

    const researchEnabled = useMemo(() => {
        const isAdmin = permissionAccount?.role === 'admin';
        const hasResearchKnowledge = !!account?.knowledge?.Research;
        return isAdmin || hasResearchKnowledge;
    }, [account?.knowledge?.Research, permissionAccount?.role]);

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
            if (!window.confirm('Reset research for the currently visible research trees?')) return;

            setSaving(true);
            try {
                const nextResearchTrees: Record<string, string[]> = { ...researchTrees };
                let nextEquipment = [...equipment];

                for (const treeId of treeIds) {
                    const tree = RESEARCH_TREES.find((t) => t.id === treeId);
                    if (!tree) continue;

                    const researchedForTree = researchTrees[treeId] ?? [];
                    const researchedSet = new Set(researchedForTree);
                    nextResearchTrees[treeId] = [];

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
                });

                setResearchTrees(updatedChar.researchTrees ?? nextResearchTrees);
                setEquipment(updatedChar.equipment ?? nextEquipment);
                onSaved?.({ equipment: updatedChar.equipment ?? nextEquipment, name, portraitId: selectedPortraitId });
            } catch (e) {
                console.error('Failed to reset research:', e);
            } finally {
                setSaving(false);
            }
        },
        [character.id, equipment, api, name, permissionAccount?.role, researchTrees, selectedPortraitId, onSaved]
    );

    const handleResearchNode = useCallback(
        async (treeId: string, nodeId: string) => {
            if (!resolvedCampaign?.resources) return;
            const tree = RESEARCH_TREES.find((t) => t.id === treeId);
            if (!tree) return;

            const ctx = {
                account: (account ?? { id: 0, name: '', role: 'user', fire: 0, water: 0, earth: 0, air: 0 }) as AccountState,
                character: { ...character, equipment, researchTrees } as CampaignCharacter,
                campaignResources: resolvedCampaign.resources,
            };

            const check = canResearchNode(tree, nodeId, ctx);
            if (!check.ok) return;

            // Auto-research prerequisites client-side by posting each missing node (server will dedupe).
            const closure = prereqClosure(tree, nodeId);
            const already = new Set(researchTrees[treeId] ?? []);
            const toDo = closure.filter((id) => !already.has(id));

            setSaving(true);
            try {
                for (const nid of toDo) {
                    const updated = await api.researchCharacterNode(character.id, { treeId, nodeId: nid });
                    setResearchTrees(updated.researchTrees ?? {});
                }
                const latestTrees = (await api.getCharacter(character.id)).researchTrees ?? {};
                const ctx2 = {
                    account: ctx.account,
                    character: { ...character, equipment, researchTrees: latestTrees } as CampaignCharacter,
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
        [account, character, equipment, api, researchTrees, resolvedCampaign?.resources, selectedPortraitId, name, onSaved],
    );

    const handleEquipToSlot = useCallback(
        (slot: EquipmentSlotType, itemId: string, slotIndex?: number) => {
            if (!editMode) return;
            const def = getItemDef(itemId);
            if (!def?.slots.includes(slot)) return;
            const newEquipment = setEquipmentInSlot(equipment, slot, itemId, slotIndex);
            setEquipment(newEquipment);
            saveEquipment(newEquipment);
        },
        [editMode, equipment, saveEquipment]
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

    const firstTreeId = availableTrees[0]?.id ?? null;
    const selectedTree = availableTrees.find((t) => t.id === (selectedTreeId ?? firstTreeId));

    return (
        <div className="flex flex-col h-full w-full bg-surface rounded-lg border border-border-custom overflow-hidden">
            {/* Tabs */}
            <div className="flex gap-1 px-2 pt-2 border-b border-border-custom shrink-0">
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
                {researchEnabled && (
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
            </div>

            {/* Content: left (portrait + sidebar) | right (main) */}
            <div className="flex-1 min-h-0 flex overflow-hidden">
                {/* Left column: portrait + panel-specific sidebar */}
                <div className="flex flex-col shrink-0 border-r border-border-custom bg-background/50">
                    {/* Character portrait — 16px (p-4) inset; name row; rule; portrait */}
                    <div className="flex flex-col shrink-0 max-w-full box-border border-b border-border-custom p-4">
                        <div className="flex items-center justify-between gap-2 min-w-0 border-b border-border-custom pb-4">
                            <span
                                className="text-lg font-semibold text-white truncate text-left min-w-0 flex-1"
                                title={name}
                            >
                                {name || 'Adventurer'}
                            </span>
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
                        </div>
                        <div className="flex justify-center pt-4">
                            <CharacterPortrait
                                picture={portrait?.picture ?? ''}
                                size="medium"
                                className="border border-border-custom"
                            />
                        </div>
                    </div>

                    {/* Panel-specific sidebar */}
                    <div className="flex-1 min-h-0 overflow-auto p-3">
                        {activeTab === 'equipment' &&
                            (equippedItemsDisplay === 'list' ? (
                                <EquippedItemsList
                                    equipment={equipment}
                                    slotDescriptors={getSlotDescriptors(equipment)}
                                    onDropOnSlot={handleDropOnSlot}
                                    onDragOver={handleDragOver}
                                    onDragStartSlot={handleDragStartSlot}
                                    onDragEnd={handleDragEnd}
                                    editMode={editMode}
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
                                    editMode={editMode}
                                />
                            ))}
                        {activeTab === 'research' && researchEnabled && (
                            <ResearchTreeList
                                availableTrees={availableTrees}
                                selectedTreeId={selectedTreeId}
                                onSelectTree={(id) => setSelectedTreeId(id)}
                                researchTrees={researchTrees}
                            />
                        )}
                    </div>
                </div>

                {/* Right column: panel main container */}
                <div className="flex-1 min-w-0 overflow-auto p-4">
                    {activeTab === 'equipment' && showInventoryPanel && (
                        <InventoryPanel
                            visibleInventoryItems={visibleInventoryItems}
                            editMode={editMode}
                            saving={saving}
                            onDragStartItem={handleDragStartItem}
                            onDragEnd={handleDragEnd}
                        />
                    )}

                    {activeTab === 'research' && researchEnabled && (
                        <>
                            {resolvedCampaign?.resources ? (
                                <>
                                    {permissionAccount?.role === 'admin' && (
                                        <div className="mb-4 rounded-lg border border-border-custom bg-surface-light p-3">
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

                                    {availableTrees.length === 0 ? (
                                        <p className="text-sm text-muted">No research trees available.</p>
                                    ) : selectedTree ? (
                                        <ResearchTreeContent
                                            tree={selectedTree}
                                            account={account ?? null}
                                            character={character}
                                            equipment={equipment}
                                            researchTrees={researchTrees}
                                            campaignResources={resolvedCampaign.resources}
                                            saving={saving}
                                            canResetResearch={permissionAccount?.role === 'admin'}
                                            firstTreeId={firstTreeId}
                                            onResearchNode={(treeId, nodeId) => void handleResearchNode(treeId, nodeId)}
                                            onResetResearch={(_treeIds) => void handleResetResearch(availableTrees.map((t) => t.id))}
                                        />
                                    ) : null}
                                </>
                            ) : (
                                <p className="text-sm text-muted">Campaign resources not loaded.</p>
                            )}
                        </>
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
