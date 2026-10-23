import React, { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getAbility } from '../../../../abilities/AbilityRegistry';
import type { AbilityStatic } from '../../../../abilities/Ability';
import type { CampaignCharacter } from '../../../../character_defs/CampaignCharacter';
import { PREP_ABILITY_SLOT_COUNT } from '../../../../storylines/questPrepLoadout';
import { TestIds } from '../../../../../../testing/testIds';
import { ABILITY_SLOT_PREP_HEIGHT_PX, ABILITY_SLOT_WIDTH_PX } from '../../../components/AbilitySlot';
import { AbilitySlotPreview } from '../../../components/AbilitySlotPreview';
import {
    PREP_SLOT_INDEX_ATTR,
    prepDropTargetAt,
    usePointerDragGesture,
    usePrepAbilityDrag,
} from './PrepAbilityDrag';

interface PrepAbilitySlotBarProps {
    character: CampaignCharacter;
    selectedPrimaryIds: readonly string[];
    slotCount?: number;
    onRemove: (abilityId: string) => void;
    /** When true, occupied slots cannot be cleared (mission under/at ability cap). */
    readOnly?: boolean;
    /**
     * Drag-to-reorder: move the card at `fromIndex` into gap `insertIndex` (0 = before the first
     * card, n = after the last). Allowed even when `readOnly`; omit to disable dragging.
     */
    onReorder?: (fromIndex: number, insertIndex: number) => void;
}

interface SlotDrag {
    fromIndex: number;
    /** Gap the card would drop into, or null while it would land where it started. */
    insertIndex: number | null;
    x: number;
    y: number;
    /** Pointer offset inside the picked-up card so it doesn't jump to the cursor. */
    offsetX: number;
    offsetY: number;
}

/**
 * Bottom row: prep primary slots; click occupied to remove (+ attached leave with it).
 * Press and drag an occupied card to pick it up; a bar between two cards marks the drop point.
 * Drop it on the center ability picker to unequip it. While a picker card is dragged over a slot,
 * that slot gets a yellow border (dropping swaps the two abilities).
 */
export function PrepAbilitySlotBar({
    character,
    selectedPrimaryIds,
    slotCount = PREP_ABILITY_SLOT_COUNT,
    onRemove,
    readOnly = false,
    onReorder,
}: PrepAbilitySlotBarProps) {
    const tooltipContext = useMemo(
        () => ({
            researchTrees: character.researchTrees,
            researchNodeLevels: character.researchNodeLevels,
        }),
        [character.researchTrees, character.researchNodeLevels],
    );

    const slots = useMemo((): Array<AbilityStatic | null> => {
        const out: Array<AbilityStatic | null> = [];
        for (let i = 0; i < slotCount; i++) {
            const primaryId = selectedPrimaryIds[i];
            out.push(primaryId ? getAbility(primaryId) ?? null : null);
        }
        return out;
    }, [selectedPrimaryIds, slotCount]);

    const firstEmpty = slots.findIndex((ability) => !ability);
    const occupiedCount = firstEmpty === -1 ? slots.length : firstEmpty;
    // A card can be dragged to reorder (needs 2+) or, when the loadout isn't locked, up to the picker.
    const canDrag = !!onReorder && (occupiedCount > 1 || !readOnly);

    const slotRefs = useRef<Array<HTMLDivElement | null>>([]);
    const [drag, setDrag] = useState<SlotDrag | null>(null);
    const { begin, onClickCapture } = usePointerDragGesture();
    const { hoverSlotIndex, setPickerDropActive } = usePrepAbilityDrag();

    /** Gap under the pointer (how many occupied cards' centres lie left of it); null if a no-op. */
    const insertIndexAt = useCallback(
        (clientX: number, fromIndex: number): number | null => {
            let gap = 0;
            for (let i = 0; i < occupiedCount; i++) {
                const rect = slotRefs.current[i]?.getBoundingClientRect();
                if (rect && clientX > rect.left + rect.width / 2) gap = i + 1;
            }
            return gap === fromIndex || gap === fromIndex + 1 ? null : gap;
        },
        [occupiedCount],
    );

    /** Over the picker (and allowed to unequip): drop removes the card instead of reordering. */
    const overPickerAt = (clientX: number, clientY: number) =>
        !readOnly && prepDropTargetAt(clientX, clientY).overPicker;

    const handlePointerDown = (index: number, ability: AbilityStatic) => (e: React.PointerEvent<HTMLDivElement>) => {
        if (!canDrag || !onReorder) return;
        begin(e, {
            onMove: (ev, point) => {
                const overPicker = overPickerAt(ev.clientX, ev.clientY);
                setPickerDropActive(overPicker);
                setDrag({
                    fromIndex: index,
                    insertIndex: overPicker ? null : insertIndexAt(ev.clientX, index),
                    ...point,
                });
            },
            onDrop: (ev) => {
                if (overPickerAt(ev.clientX, ev.clientY)) {
                    onRemove(ability.id);
                    return;
                }
                const insertIndex = insertIndexAt(ev.clientX, index);
                if (insertIndex !== null) onReorder(index, insertIndex);
            },
            onEnd: () => {
                setDrag(null);
                setPickerDropActive(false);
            },
        });
    };

    const draggedAbility = drag ? slots[drag.fromIndex] : null;

    return (
        <div
            data-testid={TestIds.questPrepAbilitySlotBar}
            className="flex w-full min-h-0 items-center justify-center"
        >
            <div className="max-w-full overflow-x-auto overflow-y-hidden">
                <div
                    className={`mx-auto flex w-max items-start gap-2 ${drag ? 'select-none' : ''}`}
                    onClickCapture={onClickCapture}
                >
                    {slots.map((ability, index) => (
                        <div
                            key={`prep-slot-${index}`}
                            ref={(el) => {
                                slotRefs.current[index] = el;
                            }}
                            className={[
                                'relative shrink-0 rounded-lg',
                                hoverSlotIndex === index ? 'ring-2 ring-yellow-300' : '',
                                ability && canDrag ? 'cursor-grab' : '',
                                drag?.fromIndex === index ? 'opacity-30' : '',
                            ].filter(Boolean).join(' ')}
                            {...{ [PREP_SLOT_INDEX_ATTR]: index }}
                            onPointerDown={ability ? handlePointerDown(index, ability) : undefined}
                            onDragStart={(e) => e.preventDefault()}
                        >
                            {drag?.insertIndex === index && <SlotDropMarker side="left" />}
                            {drag?.insertIndex === occupiedCount && index === occupiedCount - 1 && (
                                <SlotDropMarker side="right" />
                            )}
                            {ability ? (
                                <AbilitySlotPreview
                                    ability={ability}
                                    tooltipContext={tooltipContext}
                                    onSelect={
                                        readOnly
                                            ? undefined
                                            : () => onRemove(ability.id)
                                    }
                                />
                            ) : (
                                <div
                                    className="rounded-lg border border-dashed border-border-custom bg-surface/40 flex items-center justify-center shrink-0"
                                    style={{
                                        width: ABILITY_SLOT_WIDTH_PX,
                                        height: ABILITY_SLOT_PREP_HEIGHT_PX,
                                    }}
                                    aria-label={`Empty ability slot ${index + 1}`}
                                >
                                    <span className="text-[10px] text-muted">{index + 1}</span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
            {drag && draggedAbility && createPortal(
                <div
                    className="pointer-events-none fixed z-[1000] opacity-90 drop-shadow-2xl"
                    style={{ left: drag.x - drag.offsetX, top: drag.y - drag.offsetY }}
                >
                    <AbilitySlotPreview ability={draggedAbility} tooltipContext={tooltipContext} />
                </div>,
                document.body,
            )}
        </div>
    );
}

/** Bright bar centred in the gap beside a slot, marking where a dragged card will land. */
function SlotDropMarker({ side }: { side: 'left' | 'right' }) {
    return (
        <div
            aria-hidden
            className={`pointer-events-none absolute inset-y-0 z-10 w-1 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.8)] ${
                side === 'left' ? '-left-[6px]' : '-right-[6px]'
            }`}
        />
    );
}
