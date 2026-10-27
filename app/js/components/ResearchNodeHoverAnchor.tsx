/**
 * Shared hover preview for a research node: the floating compact ResearchNodeCard
 * that {@link ResearchRewardTinyChip} opens. Story choice buttons that grant a node
 * use the same preview, with the button as the anchor instead of a pill.
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ResearchNodeDef, ResearchTreeDef } from '../researchTrees/types';
import {
    RESEARCH_NODE_COMPACT_HEIGHT_PX,
    RESEARCH_NODE_COMPACT_WIDTH_PX,
} from '../games/minion_battles/ui/components/researchNodeCardLayout';
import ResearchNodeCard from './ResearchNodeCard';

/** Delay before the preview closes, so the pointer can move onto the card (flavor tooltip). */
export const RESEARCH_NODE_PREVIEW_HIDE_MS = 180;

const PREVIEW_MARGIN_PX = 8;

export function useResearchNodePreviewHover() {
    const [open, setOpen] = useState(false);
    const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearHideTimer = useCallback(() => {
        if (hideTimerRef.current != null) {
            window.clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
        }
    }, []);

    const scheduleClose = useCallback(() => {
        clearHideTimer();
        hideTimerRef.current = window.setTimeout(() => {
            setOpen(false);
        }, RESEARCH_NODE_PREVIEW_HIDE_MS);
    }, [clearHideTimer]);

    const openPreview = useCallback(() => {
        clearHideTimer();
        setOpen(true);
    }, [clearHideTimer]);

    useEffect(() => () => clearHideTimer(), [clearHideTimer]);

    return { open, clearHideTimer, scheduleClose, openPreview };
}

export function ResearchNodePreviewPortal({
    open,
    anchorRef,
    node,
    tree,
    onMouseEnter,
    onMouseLeave,
}: {
    open: boolean;
    anchorRef: { readonly current: HTMLElement | null };
    node: ResearchNodeDef;
    tree?: ResearchTreeDef;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
}) {
    const [previewStyle, setPreviewStyle] = useState<{ left: number; top: number } | null>(null);

    useLayoutEffect(() => {
        if (!open || !anchorRef.current) {
            setPreviewStyle(null);
            return;
        }
        const el = anchorRef.current;
        const update = () => {
            const rect = el.getBoundingClientRect();
            const cardW = RESEARCH_NODE_COMPACT_WIDTH_PX;
            const cardH = RESEARCH_NODE_COMPACT_HEIGHT_PX;
            let left = rect.left + rect.width / 2 - cardW / 2;
            left = Math.max(PREVIEW_MARGIN_PX, Math.min(window.innerWidth - cardW - PREVIEW_MARGIN_PX, left));
            let top = rect.bottom + PREVIEW_MARGIN_PX;
            if (top + cardH > window.innerHeight - PREVIEW_MARGIN_PX && rect.top > cardH + PREVIEW_MARGIN_PX) {
                top = rect.top - PREVIEW_MARGIN_PX - cardH;
            }
            setPreviewStyle({ left, top });
        };
        update();
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    }, [open, anchorRef]);

    if (!open || !previewStyle || typeof document === 'undefined') return null;

    return createPortal(
        <div
            className="pointer-events-auto fixed z-[9998]"
            style={{ left: previewStyle.left, top: previewStyle.top }}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            <ResearchNodeCard
                node={node}
                tree={tree}
                variant="display"
                tone="muted"
                layout="compact"
                showCost={false}
                showRequirements={false}
                state="researched"
            />
        </div>,
        document.body,
    );
}

/** Fills its parent and opens the research-node preview while the pointer is over it. */
export default function ResearchNodeHoverAnchor({
    node,
    tree,
    children,
}: {
    node: ResearchNodeDef;
    tree?: ResearchTreeDef;
    children: React.ReactNode;
}) {
    const anchorRef = useRef<HTMLDivElement>(null);
    const hover = useResearchNodePreviewHover();

    return (
        <div
            data-className="ResearchNodeHoverAnchor"
            ref={anchorRef}
            className="flex h-full min-h-0 w-full min-w-0"
            onMouseEnter={hover.openPreview}
            onMouseLeave={hover.scheduleClose}
        >
            {children}
            <ResearchNodePreviewPortal
                open={hover.open}
                anchorRef={anchorRef}
                node={node}
                tree={tree}
                onMouseEnter={hover.clearHideTimer}
                onMouseLeave={hover.scheduleClose}
            />
        </div>
    );
}
