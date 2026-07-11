/**
 * Renders tooltip content in a document portal, positioned relative to an anchor element.
 * Escapes overflow-hidden ancestors (e.g. the battle action bar).
 *
 * Always applies {@link PORTAL_TOOLTIP_SURFACE_CLASS} so tooltips keep a readable background
 * even when callers forget to pass one in `className`.
 */

import React, { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/** Default gap between anchor and tooltip. */
export const PORTAL_TOOLTIP_GAP_PX = 8;

export const PORTAL_TOOLTIP_Z_INDEX = 200;

/**
 * Guaranteed tooltip chrome: opaque background + border + light text.
 * Use for inline (non-portal) tooltips too — do not invent `bg-*` classes ad hoc.
 */
export const PORTAL_TOOLTIP_SURFACE_CLASS =
    'rounded border border-border-custom bg-black text-gray-100 shadow-lg';

export type PortalTooltipPlacement = 'top' | 'right';

export interface AnchoredPortalTooltipProps {
    anchorRef: React.RefObject<HTMLElement | null>;
    open: boolean;
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
    gapPx?: number;
    /** `top` — above anchor center (default). `right` — to the right, vertically centered. */
    placement?: PortalTooltipPlacement;
}

export function AnchoredPortalTooltip({
    anchorRef,
    open,
    children,
    className = '',
    style,
    gapPx = PORTAL_TOOLTIP_GAP_PX,
    placement = 'top',
}: AnchoredPortalTooltipProps) {
    const [anchor, setAnchor] = useState<{ x: number; y: number; placement: PortalTooltipPlacement } | null>(null);

    useLayoutEffect(() => {
        if (!open) {
            setAnchor(null);
            return;
        }
        const sync = () => {
            const el = anchorRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            if (placement === 'right') {
                setAnchor({
                    x: rect.right + gapPx,
                    y: rect.top + rect.height / 2,
                    placement: 'right',
                });
            } else {
                setAnchor({
                    x: rect.left + rect.width / 2,
                    y: rect.top - gapPx,
                    placement: 'top',
                });
            }
        };
        sync();
        window.addEventListener('resize', sync);
        window.addEventListener('scroll', sync, true);
        return () => {
            window.removeEventListener('resize', sync);
            window.removeEventListener('scroll', sync, true);
        };
    }, [open, anchorRef, gapPx, placement]);

    if (!open || !anchor) return null;

    const positionClass =
        anchor.placement === 'right'
            ? '-translate-y-1/2'
            : '-translate-x-1/2 -translate-y-full';

    return createPortal(
        <div
            role="tooltip"
            className={`pointer-events-none fixed ${positionClass} ${PORTAL_TOOLTIP_SURFACE_CLASS} ${className}`}
            style={{
                left: anchor.x,
                top: anchor.y,
                zIndex: PORTAL_TOOLTIP_Z_INDEX,
                ...style,
            }}
        >
            {children}
        </div>,
        document.body,
    );
}
