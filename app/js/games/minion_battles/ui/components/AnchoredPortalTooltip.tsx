/**
 * Renders tooltip content in a document portal, fixed above the top-center of an anchor element.
 * Escapes overflow-hidden ancestors (e.g. the battle action bar).
 */

import React, { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/** Default gap between anchor top edge and tooltip bottom edge. */
export const PORTAL_TOOLTIP_GAP_PX = 8;

export const PORTAL_TOOLTIP_Z_INDEX = 200;

export interface AnchoredPortalTooltipProps {
    anchorRef: React.RefObject<HTMLElement | null>;
    open: boolean;
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
    gapPx?: number;
}

export function AnchoredPortalTooltip({
    anchorRef,
    open,
    children,
    className = '',
    style,
    gapPx = PORTAL_TOOLTIP_GAP_PX,
}: AnchoredPortalTooltipProps) {
    const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

    useLayoutEffect(() => {
        if (!open) {
            setAnchor(null);
            return;
        }
        const sync = () => {
            const el = anchorRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            setAnchor({
                x: rect.left + rect.width / 2,
                y: rect.top - gapPx,
            });
        };
        sync();
        window.addEventListener('resize', sync);
        window.addEventListener('scroll', sync, true);
        return () => {
            window.removeEventListener('resize', sync);
            window.removeEventListener('scroll', sync, true);
        };
    }, [open, anchorRef, gapPx]);

    if (!open || !anchor) return null;

    return createPortal(
        <div
            role="tooltip"
            className={`pointer-events-none fixed -translate-x-1/2 -translate-y-full ${className}`}
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
