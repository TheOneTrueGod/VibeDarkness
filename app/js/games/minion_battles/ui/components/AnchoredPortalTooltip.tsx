/**
 * Renders tooltip content in a document portal, positioned relative to an anchor element.
 * Escapes overflow-hidden ancestors and auto-flips / clamps so the tip stays in the viewport.
 *
 * Always applies {@link PORTAL_TOOLTIP_SURFACE_CLASS} so tooltips keep a readable background
 * even when callers forget to pass one in `className`.
 */

import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    computeTooltipPosition,
    type PortalTooltipPlacement,
    type TooltipPosition,
} from './portalTooltipPlacement';

/** Default gap between anchor and tooltip. */
export const PORTAL_TOOLTIP_GAP_PX = 8;

/** Inset from viewport edges when flipping / clamping. */
export const PORTAL_TOOLTIP_VIEWPORT_PADDING_PX = 8;

export const PORTAL_TOOLTIP_Z_INDEX = 200;

/**
 * Guaranteed tooltip chrome: opaque background + border + light text.
 * Use for inline (non-portal) tooltips too — do not invent `bg-*` classes ad hoc.
 */
export const PORTAL_TOOLTIP_SURFACE_CLASS =
    'rounded border border-border-custom bg-black text-gray-100 shadow-lg';

export type { PortalTooltipPlacement };

export interface AnchoredPortalTooltipProps {
    anchorRef: React.RefObject<HTMLElement | null>;
    open: boolean;
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
    gapPx?: number;
    /**
     * Preferred side of the anchor. When {@link autoFlip} is true (default), the tip may
     * move to another side if the preferred one would leave the viewport.
     */
    placement?: PortalTooltipPlacement;
    /** When true (default), try alternate sides so the tooltip stays visible. */
    autoFlip?: boolean;
    viewportPaddingPx?: number;
}

export function AnchoredPortalTooltip({
    anchorRef,
    open,
    children,
    className = '',
    style,
    gapPx = PORTAL_TOOLTIP_GAP_PX,
    placement = 'top',
    autoFlip = true,
    viewportPaddingPx = PORTAL_TOOLTIP_VIEWPORT_PADDING_PX,
}: AnchoredPortalTooltipProps) {
    const tipRef = useRef<HTMLDivElement | null>(null);
    const [position, setPosition] = useState<TooltipPosition | null>(null);

    useLayoutEffect(() => {
        if (!open) {
            setPosition(null);
            return;
        }

        const sync = () => {
            const anchorEl = anchorRef.current;
            const tipEl = tipRef.current;
            if (!anchorEl || !tipEl) return;

            const anchorRect = anchorEl.getBoundingClientRect();
            const tipRect = tipEl.getBoundingClientRect();
            const next = computeTooltipPosition({
                anchor: anchorRect,
                size: { width: tipRect.width, height: tipRect.height },
                viewport: { width: window.innerWidth, height: window.innerHeight },
                preferredPlacement: placement,
                gapPx,
                paddingPx: viewportPaddingPx,
                autoFlip,
            });
            setPosition((prev) => {
                if (
                    prev
                    && prev.left === next.left
                    && prev.top === next.top
                    && prev.placement === next.placement
                ) {
                    return prev;
                }
                return next;
            });
        };

        sync();
        window.addEventListener('resize', sync);
        window.addEventListener('scroll', sync, true);
        return () => {
            window.removeEventListener('resize', sync);
            window.removeEventListener('scroll', sync, true);
        };
    }, [open, anchorRef, gapPx, placement, autoFlip, viewportPaddingPx]);

    if (!open) return null;

    return createPortal(
        <div
            ref={tipRef}
            role="tooltip"
            className={`pointer-events-none fixed ${PORTAL_TOOLTIP_SURFACE_CLASS} ${className}`}
            style={{
                left: position?.left ?? -9999,
                top: position?.top ?? -9999,
                visibility: position ? 'visible' : 'hidden',
                zIndex: PORTAL_TOOLTIP_Z_INDEX,
                ...style,
            }}
            data-placement={position?.placement}
        >
            {children}
        </div>,
        document.body,
    );
}
