import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Ability drag-and-drop on the Prepare screen, shared by the center picker and the bottom slot bar:
 * a pointer drag gesture (press, move past a threshold, release) plus the hover state each side
 * shows while the other side drags (a yellow-bordered slot, or the picker as an unequip target).
 */

/** Pointer travel (px) before a press on a card becomes a drag instead of a click. */
const DRAG_THRESHOLD_PX = 5;

/** Marks a bottom-bar slot as a drop target; the value is the slot index. */
export const PREP_SLOT_INDEX_ATTR = 'data-prep-slot-index';
/** Marks the center ability picker as a drop target (drop a slot card here to unequip it). */
export const PREP_PICKER_ATTR = 'data-prep-ability-picker';

/** What lies under the pointer: a slot index and/or the picker. */
export function prepDropTargetAt(clientX: number, clientY: number): { slotIndex: number | null; overPicker: boolean } {
    const el = document.elementFromPoint(clientX, clientY);
    const slotEl = el?.closest(`[${PREP_SLOT_INDEX_ATTR}]`);
    const raw = slotEl?.getAttribute(PREP_SLOT_INDEX_ATTR);
    return {
        slotIndex: raw != null ? Number(raw) : null,
        overPicker: !!el?.closest(`[${PREP_PICKER_ATTR}]`),
    };
}

/** Pointer position plus the offset inside the pressed card, so a ghost doesn't jump to the cursor. */
export interface DragPoint {
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
}

interface DragHandlers {
    /** Called on every move once the press has become a drag. */
    onMove: (ev: PointerEvent, point: DragPoint) => void;
    /** Called when the drag ends with a release (not on Escape / pointer cancel). */
    onDrop: (ev: PointerEvent) => void;
    /** Always called when a drag ends, dropped or cancelled. */
    onEnd: () => void;
}

/**
 * Press-and-drag gesture: `begin` from a card's pointerdown; a press that never travels the
 * threshold stays a click. `onClickCapture` on a parent swallows the click that follows a drag.
 */
export function usePointerDragGesture() {
    const suppressClickRef = useRef(false);
    const cleanupRef = useRef<(() => void) | null>(null);

    useEffect(() => () => cleanupRef.current?.(), []);

    const begin = useCallback((e: React.PointerEvent<HTMLElement>, handlers: DragHandlers) => {
        if (e.button !== 0) return;
        cleanupRef.current?.();
        const startX = e.clientX;
        const startY = e.clientY;
        const rect = e.currentTarget.getBoundingClientRect();
        let dragging = false;

        const onMove = (ev: PointerEvent) => {
            if (!dragging) {
                if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD_PX) return;
                dragging = true;
            }
            ev.preventDefault();
            handlers.onMove(ev, {
                x: ev.clientX,
                y: ev.clientY,
                offsetX: startX - rect.left,
                offsetY: startY - rect.top,
            });
        };
        const finish = (ev: PointerEvent | null) => {
            cleanup();
            if (!dragging) return;
            suppressClickRef.current = true;
            // No click follows when the pointer is released off the card; don't eat the next one.
            window.setTimeout(() => {
                suppressClickRef.current = false;
            }, 0);
            if (ev) handlers.onDrop(ev);
            handlers.onEnd();
        };
        const onUp = (ev: PointerEvent) => finish(ev);
        const onCancel = () => finish(null);
        const onKey = (ev: KeyboardEvent) => {
            if (ev.key === 'Escape') finish(null);
        };
        const cleanup = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onCancel);
            window.removeEventListener('keydown', onKey);
            cleanupRef.current = null;
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onCancel);
        window.addEventListener('keydown', onKey);
        cleanupRef.current = cleanup;
    }, []);

    const onClickCapture = useCallback((e: React.MouseEvent) => {
        if (!suppressClickRef.current) return;
        suppressClickRef.current = false;
        e.stopPropagation();
        e.preventDefault();
    }, []);

    return { begin, onClickCapture };
}

interface PrepAbilityDragValue {
    /** Slot a picker card is being dragged over (gets a yellow border), or null. */
    hoverSlotIndex: number | null;
    setHoverSlotIndex: (index: number | null) => void;
    /** A slot card is being dragged over the picker (dropping there unequips it). */
    pickerDropActive: boolean;
    setPickerDropActive: (active: boolean) => void;
}

const PrepAbilityDragContext = createContext<PrepAbilityDragValue | null>(null);

export function PrepAbilityDragProvider({ children }: { children: React.ReactNode }) {
    const [hoverSlotIndex, setHoverSlotIndex] = useState<number | null>(null);
    const [pickerDropActive, setPickerDropActive] = useState(false);
    const value = useMemo(
        () => ({ hoverSlotIndex, setHoverSlotIndex, pickerDropActive, setPickerDropActive }),
        [hoverSlotIndex, pickerDropActive],
    );
    return <PrepAbilityDragContext.Provider value={value}>{children}</PrepAbilityDragContext.Provider>;
}

/** Shared drag hover state; inert outside a provider so the slot bar still works standalone. */
export function usePrepAbilityDrag(): PrepAbilityDragValue {
    return useContext(PrepAbilityDragContext) ?? NO_DRAG;
}

const NO_DRAG: PrepAbilityDragValue = {
    hoverSlotIndex: null,
    setHoverSlotIndex: () => {},
    pickerDropActive: false,
    setPickerDropActive: () => {},
};
