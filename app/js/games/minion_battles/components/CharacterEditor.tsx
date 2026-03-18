/**
 * Character Editor - edit portrait and equipment for a campaign character.
 * Portrait (30% height) with prev/next arrows; name top right.
 * Bottom 2/3: tabs (Equipment). Doll with core/weapon/utility slots; inventory grid; drag to equip.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { getPortraitIds, getPortrait } from '../character_defs/portraits';
import {
    getItemDef,
    getEquippedForSlot,
    setEquipmentInSlot,
    getSlotLayoutFromEquipment,
    DEFAULT_PLAYER_INVENTORY,
    ITEM_ICON_URLS,
    type EquipmentSlotType,
} from '../character_defs/items';
import type { CampaignCharacter } from '../character_defs/CampaignCharacter';
import type { LobbyClient } from '../../../LobbyClient';
import CharacterPortrait from './CharacterPortrait';

interface CharacterEditorProps {
    character: CampaignCharacter;
    lobbyClient: LobbyClient;
    onSaved?: (updated: { equipment: string[]; name: string; portraitId: string }) => void;
    onClose?: () => void;
    /** Whether equipment editing is enabled. Defaults to false. */
    editMode?: boolean;
    /** Optional inventory to display and drag from; defaults to the standard player inventory. */
    inventoryItems?: string[];
    /** Whether to render the inventory sidebar. Defaults to true. */
    showInventoryPanel?: boolean;
}

type EditorTab = 'equipment';

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
    lobbyClient,
    onSaved,
    onClose,
    editMode = false,
    inventoryItems,
    showInventoryPanel = true,
}: CharacterEditorProps) {
    const portraitIds = useMemo(() => getPortraitIds(), []);
    const totalPortraits = portraitIds.length;

    const [portraitIndex, setPortraitIndex] = useState(() => {
        const i = portraitIds.indexOf(character.portraitId);
        return i >= 0 ? i : 0;
    });
    const [name, setName] = useState(character.name);
    const [equipment, setEquipment] = useState<string[]>(() => [...character.equipment]);
    const [activeTab, setActiveTab] = useState<EditorTab>('equipment');
    const [saving, setSaving] = useState(false);
    const [dragItemId, setDragItemId] = useState<string | null>(null);
    const [dragSlot, setDragSlot] = useState<EquipmentSlotType | null>(null);

    const selectedPortraitId = portraitIds[portraitIndex] ?? portraitIds[0];
    const portrait = getPortrait(selectedPortraitId);

    const saveEquipment = useCallback(
        async (newEquipment: string[]) => {
            setSaving(true);
            try {
                const updated = await lobbyClient.updateCharacter(character.id, { equipment: newEquipment });
                setEquipment(updated.equipment ?? newEquipment);
                onSaved?.({ equipment: updated.equipment ?? newEquipment, name, portraitId: selectedPortraitId });
            } catch (e) {
                console.error('Failed to save equipment:', e);
            } finally {
                setSaving(false);
            }
        },
        [character.id, lobbyClient, name, onSaved, selectedPortraitId]
    );

    const savePortrait = useCallback(
        async (portraitId: string) => {
            setSaving(true);
            try {
                await lobbyClient.updateCharacter(character.id, { portraitId });
                onSaved?.({ equipment, name, portraitId });
            } catch (e) {
                console.error('Failed to save portrait:', e);
            } finally {
                setSaving(false);
            }
        },
        [character.id, equipment, lobbyClient, name, onSaved]
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
        if (inventoryItems) {
            return inventoryItems;
        }
        return DEFAULT_PLAYER_INVENTORY.filter((id) => !equipment.includes(id));
    }, [equipment, inventoryItems]);

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

    return (
        <div className="flex flex-col h-full w-full bg-surface rounded-lg border border-border-custom overflow-hidden">
            {/* Top ~30%: portrait left, name right */}
            <div className="flex shrink-0 border-b border-border-custom" style={{ height: '30%', minHeight: 140 }}>
                <div className="flex items-center justify-center p-4 shrink-0 bg-background/50">
                    <div className="flex flex-col items-center gap-2">
                        <CharacterPortrait
                            picture={portrait?.picture ?? ''}
                            size="medium"
                            className="border border-border-custom"
                        />
                        <div className="flex gap-2">
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
                </div>
                <div className="flex-1 flex items-start justify-end pt-4 pr-4">
                    <span className="text-lg font-semibold text-white truncate max-w-[200px]" title={name}>
                        {name || 'Adventurer'}
                    </span>
                </div>
            </div>

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
            </div>

            {/* Tab content */}
            <div className="flex-1 min-h-0 flex overflow-hidden">
                {activeTab === 'equipment' && (
                    <>
                        <div className="flex-1 flex items-center justify-center p-4 min-w-0">
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
                        </div>
                        {showInventoryPanel && (
                            <div className="w-[280px] shrink-0 border-l border-border-custom p-3 overflow-auto">
                                {editMode ? (
                                    <>
                                        <p className="text-xs text-muted mb-2">Inventory — drag onto doll to equip</p>
                                        <div className="grid grid-cols-3 gap-2">
                                            {visibleInventoryItems.map((id) => {
                                                const def = getItemDef(id);
                                                const iconUrl = ITEM_ICON_URLS[id];
                                                if (!def) return null;
                                                return (
                                                    <div
                                                        key={id}
                                                        draggable
                                                        onDragStart={(e) => handleDragStartItem(e, id)}
                                                        onDragEnd={handleDragEnd}
                                                        className="flex flex-col items-center justify-center p-2 rounded border border-border-custom bg-surface-light cursor-grab active:cursor-grabbing hover:border-primary transition-colors"
                                                    >
                                                        {iconUrl ? (
                                                            <img src={iconUrl} alt="" className="w-10 h-10 object-contain" />
                                                        ) : (
                                                            <div className="w-10 h-10 flex items-center justify-center text-muted text-xs" />
                                                        )}
                                                        <span className="text-[10px] text-gray-300 truncate w-full text-center mt-1">
                                                            {def.name}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        {saving && (
                                            <p className="text-xs text-muted mt-2">Saving…</p>
                                        )}
                                    </>
                                ) : (
                                    <p className="text-xs text-muted">
                                        Equipment editing is disabled for your account.
                                    </p>
                                )}
                            </div>
                        )}
                    </>
                )}
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

            {slotDescriptors.map((desc, i) => {
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
