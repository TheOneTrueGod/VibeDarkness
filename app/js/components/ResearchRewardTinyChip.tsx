/**
 * Compact research reward pill (mission history strip): book icon + title.
 * Hover opens a floating full ResearchNodeCard; flavor tooltip works on that card.
 */
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Book } from 'lucide-react';
import type { ResearchNodeDef } from '../researchTrees/types';
import ResearchNodeCard from './ResearchNodeCard';

/** Shared styling with item pills and ResourcePill (room for descenders; avoid fixed height + leading-none). */
export const MISSION_REWARD_CHIP_CLASSNAME =
    'inline-flex min-h-[32px] shrink-0 items-center gap-1.5 rounded-lg border border-border-custom bg-surface-light px-2.5 py-1.5 text-[13px] font-semibold leading-snug text-white';

const PREVIEW_HIDE_MS = 180;

export default function ResearchRewardTinyChip({ node }: { node: ResearchNodeDef }) {
    const anchorRef = useRef<HTMLSpanElement>(null);
    const [open, setOpen] = useState(false);
    const [previewStyle, setPreviewStyle] = useState<{ left: number; top: number } | null>(null);
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
            setPreviewStyle(null);
        }, PREVIEW_HIDE_MS);
    }, [clearHideTimer]);

    const openPreview = useCallback(() => {
        clearHideTimer();
        setOpen(true);
    }, [clearHideTimer]);

    useLayoutEffect(() => {
        if (!open || !anchorRef.current) return;
        const el = anchorRef.current;
        const update = () => {
            const rect = el.getBoundingClientRect();
            const cardW = 180;
            const cardH = 100;
            const margin = 8;
            let left = rect.left + rect.width / 2 - cardW / 2;
            left = Math.max(margin, Math.min(window.innerWidth - cardW - margin, left));
            let top = rect.bottom + margin;
            if (top + cardH > window.innerHeight - margin && rect.top > cardH + margin) {
                top = rect.top - margin - cardH;
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
    }, [open]);

    const portal =
        open &&
        previewStyle &&
        typeof document !== 'undefined' &&
        createPortal(
            <div
                className="pointer-events-auto fixed z-[9998]"
                style={{ left: previewStyle.left, top: previewStyle.top }}
                onMouseEnter={clearHideTimer}
                onMouseLeave={scheduleClose}
            >
                <ResearchNodeCard
                    node={node}
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

    return (
        <>
            <span
                ref={anchorRef}
                className={`${MISSION_REWARD_CHIP_CLASSNAME} max-w-[min(100%,14rem)] cursor-default`}
                onMouseEnter={openPreview}
                onMouseLeave={scheduleClose}
                title={node.title}
            >
                <Book className="h-4 w-4 shrink-0 self-center text-zinc-400" strokeWidth={2} aria-hidden />
                <span className="min-w-0 flex-1 truncate leading-snug">{node.title}</span>
            </span>
            {portal}
        </>
    );
}
