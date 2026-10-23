import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { getAbility } from '../../../../abilities/AbilityRegistry';
import type { AbilityStatic } from '../../../../abilities/Ability';
import type { CampaignCharacter } from '../../../../character_defs/CampaignCharacter';
import { getAttachedAbilityIds } from '../../../../storylines/questPrepLoadout';
import { TestIds } from '../../../../../../testing/testIds';
import { AbilitySlotPreview } from '../../../components/AbilitySlotPreview';
import {
    PREP_PICKER_ATTR,
    prepDropTargetAt,
    usePointerDragGesture,
    usePrepAbilityDrag,
    type DragPoint,
} from './PrepAbilityDrag';

interface PrepAbilityPickerProps {
    character: CampaignCharacter;
    selectableIds: readonly string[];
    selectedPrimaryIds: readonly string[];
    slotsFull: boolean;
    onAdd: (abilityId: string) => void;
    /** Drop on a bottom-bar slot: swap that slot's ability for this one (or fill an empty slot). */
    onPlace: (slotIndex: number, abilityId: string) => void;
}

/**
 * Center pane: abilities the character can bring. Click to fill an open slot, or drag onto a slot
 * in the bottom bar to swap it in. Equipped abilities are disabled; dragging a bottom-bar card
 * back here unequips it (the pane lights up as a drop target).
 */
export function PrepAbilityPicker({
    character,
    selectableIds,
    selectedPrimaryIds,
    slotsFull,
    onAdd,
    onPlace,
}: PrepAbilityPickerProps) {
    const abilities = useMemo(
        () => selectableIds.map((id) => getAbility(id)).filter((a): a is AbilityStatic => a != null),
        [selectableIds],
    );
    const tooltipContext = useMemo(
        () => ({
            researchTrees: character.researchTrees,
            researchNodeLevels: character.researchNodeLevels,
        }),
        [character.researchTrees, character.researchNodeLevels],
    );

    const { begin, onClickCapture } = usePointerDragGesture();
    const { setHoverSlotIndex, pickerDropActive } = usePrepAbilityDrag();
    const [drag, setDrag] = useState<{ ability: AbilityStatic; point: DragPoint } | null>(null);

    const startDrag = (ability: AbilityStatic) => (e: React.PointerEvent<HTMLDivElement>) => {
        begin(e, {
            onMove: (ev, point) => {
                setDrag({ ability, point });
                setHoverSlotIndex(prepDropTargetAt(ev.clientX, ev.clientY).slotIndex);
            },
            onDrop: (ev) => {
                const { slotIndex } = prepDropTargetAt(ev.clientX, ev.clientY);
                if (slotIndex !== null) onPlace(slotIndex, ability.id);
            },
            onEnd: () => {
                setDrag(null);
                setHoverSlotIndex(null);
            },
        });
    };

    return (
        <div
            data-testid={TestIds.questPrepAbilityPicker}
            {...{ [PREP_PICKER_ATTR]: '' }}
            className={`flex min-h-0 flex-1 flex-col gap-2 overflow-hidden rounded-lg px-1 transition-shadow ${
                pickerDropActive ? 'ring-2 ring-yellow-300' : ''
            }`}
        >
            <div className="min-h-0 flex-1 overflow-y-auto">
                {abilities.length === 0 ? (
                    <p className="text-muted text-sm italic text-center mt-6">No abilities available</p>
                ) : (
                    <div
                        className={`flex flex-wrap justify-center gap-3 content-start py-2 ${drag ? 'select-none' : ''}`}
                        onClickCapture={onClickCapture}
                    >
                        {abilities.map((ability) => {
                            const equipped = selectedPrimaryIds.includes(ability.id);
                            const attached = getAttachedAbilityIds(ability.id);
                            return (
                                <div
                                    key={ability.id}
                                    className={[
                                        'flex flex-col items-center gap-1',
                                        equipped ? '' : 'cursor-grab',
                                        drag?.ability.id === ability.id ? 'opacity-30' : '',
                                    ].filter(Boolean).join(' ')}
                                    onPointerDown={equipped ? undefined : startDrag(ability)}
                                    onDragStart={(e) => e.preventDefault()}
                                    title={!equipped && slotsFull ? 'Drag onto an equipped ability to swap' : undefined}
                                >
                                    <AbilitySlotPreview
                                        ability={ability}
                                        tooltipContext={tooltipContext}
                                        onSelect={() => {
                                            if (!equipped && !slotsFull) onAdd(ability.id);
                                        }}
                                        disabled={equipped}
                                        disabledTitle={equipped ? 'Already equipped' : null}
                                        isSelected={equipped}
                                    />
                                    {attached.length > 0 && (
                                        <span className="text-[10px] text-amber-200/70 max-w-[100px] text-center leading-tight">
                                            +{attached.length} attached
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            {drag && createPortal(
                <div
                    className="pointer-events-none fixed z-[1000] opacity-90 drop-shadow-2xl"
                    style={{ left: drag.point.x - drag.point.offsetX, top: drag.point.y - drag.point.offsetY }}
                >
                    <AbilitySlotPreview ability={drag.ability} tooltipContext={tooltipContext} />
                </div>,
                document.body,
            )}
        </div>
    );
}
