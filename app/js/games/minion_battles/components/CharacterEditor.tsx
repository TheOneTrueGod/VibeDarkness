/**
 * Character Editor - edit portrait and equipment for a campaign character.
 * Portrait (30% height) with prev/next arrows; name top right.
 * Bottom 2/3: tabs (Equipment). Doll with hands/core slots; inventory grid; drag to equip.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { getPortraitIds, getPortrait } from '../character_defs/portraits';
import {
    getItemDef,
    getEquippedForSlot,
    setEquipmentInSlot,
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
}

type EditorTab = 'equipment';

const SLOT_ORDER: EquipmentSlotType[] = ['core', 'hands'];

export default function CharacterEditor({
    character,
    lobbyClient,
    onSaved,
    onClose,
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

    const inventoryItems = useMemo(() => {
        return DEFAULT_PLAYER_INVENTORY.filter((id) => !equipment.includes(id));
    }, [equipment]);

    const handleEquipToSlot = useCallback(
        (slot: EquipmentSlotType, itemId: string) => {
            const def = getItemDef(itemId);
            if (!def?.slots.includes(slot)) return;
            const newEquipment = setEquipmentInSlot(equipment, slot, itemId);
            setEquipment(newEquipment);
            saveEquipment(newEquipment);
        },
        [equipment, saveEquipment]
    );

    const handleDragStartItem = useCallback((e: React.DragEvent, itemId: string) => {
        setDragItemId(itemId);
        e.dataTransfer.setData('text/plain', itemId);
        e.dataTransfer.effectAllowed = 'copy';
    }, []);

    const handleDragStartSlot = useCallback(
        (e: React.DragEvent, slot: EquipmentSlotType) => {
            const itemId = getEquippedForSlot(equipment, slot);
            if (itemId) {
                setDragSlot(slot);
                e.dataTransfer.setData('text/plain', `slot:${slot}:${itemId}`);
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
        (e: React.DragEvent, slot: EquipmentSlotType) => {
            e.preventDefault();
            const raw = e.dataTransfer.getData('text/plain');
            if (raw.startsWith('slot:')) {
                const [, , itemId] = raw.split(':');
                if (itemId) handleEquipToSlot(slot, itemId);
            } else if (raw) {
                handleEquipToSlot(slot, raw);
            }
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
                                onDropOnSlot={handleDropOnSlot}
                                onDragOver={handleDragOver}
                                onDragStartSlot={handleDragStartSlot}
                                onDragEnd={handleDragEnd}
                                dragItemId={dragItemId}
                                dragSlot={dragSlot}
                            />
                        </div>
                        <div className="w-[280px] shrink-0 border-l border-border-custom p-3 overflow-auto">
                            <p className="text-xs text-muted mb-2">Inventory — drag onto doll to equip</p>
                            <div className="grid grid-cols-3 gap-2">
                                {inventoryItems.map((id) => {
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
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

interface EquipmentDollProps {
    equipment: string[];
    onDropOnSlot: (e: React.DragEvent, slot: EquipmentSlotType) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragStartSlot: (e: React.DragEvent, slot: EquipmentSlotType) => void;
    onDragEnd: () => void;
    dragItemId: string | null;
    dragSlot: EquipmentSlotType | null;
}

function EquipmentDoll({
    equipment,
    onDropOnSlot,
    onDragOver,
    onDragStartSlot,
    onDragEnd,
}: EquipmentDollProps) {
    const containerSize = 200;

    const slotPositions: Record<EquipmentSlotType, { left: string; top: string }> = {
        core: { left: '10%', top: '5%' },
        hands: { left: '62%', top: '42%' },
    };

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

            {SLOT_ORDER.map((slot) => {
                const itemId = getEquippedForSlot(equipment, slot);
                const def = itemId ? getItemDef(itemId) : null;
                const iconUrl = itemId ? ITEM_ICON_URLS[itemId] : null;
                const pos = slotPositions[slot];
                return (
                    <div
                        key={slot}
                        className="absolute w-12 h-12 flex items-center justify-center rounded border-2 border-dashed border-border-custom bg-surface/80 cursor-pointer hover:border-primary transition-colors"
                        style={{ left: pos.left, top: pos.top }}
                        onDrop={(e) => onDropOnSlot(e, slot)}
                        onDragOver={onDragOver}
                        onDragStart={(e) => itemId && onDragStartSlot(e, slot)}
                        draggable={!!itemId}
                        onDragEnd={onDragEnd}
                        title={def?.name ?? slot}
                    >
                        {iconUrl ? (
                            <img src={iconUrl} alt={def?.name ?? slot} className="w-8 h-8 object-contain pointer-events-none" />
                        ) : (
                            <span className="text-xs text-muted">{slot}</span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
