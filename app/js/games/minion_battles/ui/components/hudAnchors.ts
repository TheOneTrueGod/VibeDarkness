import { useCallback } from 'react';

/**
 * Registry of DOM elements that screen-space (DOM overlay) HUD effects can fly to.
 *
 * Unlike `registerHudFlightTarget` (canvas-clipped Pixi HUD), anchors here are real DOM elements, so a
 * `position: fixed` overlay portaled to `document.body` can travel to them from anywhere on screen.
 */
export type HudAnchorId = 'objectives';

const anchors = new Map<HudAnchorId, HTMLElement>();

export function registerHudAnchor(id: HudAnchorId, el: HTMLElement): void {
    anchors.set(id, el);
}

/** Unregister an anchor. When `el` is given, only removes it if that element is still the registered one. */
export function unregisterHudAnchor(id: HudAnchorId, el?: HTMLElement): void {
    if (el !== undefined && anchors.get(id) !== el) {
        return;
    }
    anchors.delete(id);
}

export function getHudAnchorRect(id: HudAnchorId): DOMRect | null {
    const el = anchors.get(id);
    return el ? el.getBoundingClientRect() : null;
}

/** Ref-callback hook: attach the returned callback to an element's `ref` to register it as the anchor. */
export function useHudAnchorRef(id: HudAnchorId): (el: HTMLElement | null) => void {
    return useCallback(
        (el: HTMLElement | null) => {
            if (el) {
                registerHudAnchor(id, el);
            } else {
                unregisterHudAnchor(id);
            }
        },
        [id],
    );
}
