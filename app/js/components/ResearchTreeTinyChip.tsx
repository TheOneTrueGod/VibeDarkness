/**
 * Compact research-tree unlock chip (mission map tooltip).
 * Shows tree title with a book icon; hover opens a panel listing the tree's
 * root nodes as ResearchNodeCards so players can see exactly what they'd unlock.
 */
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen } from 'lucide-react';
import type { ResearchTreeDef } from '../researchTrees/types';
import ResearchNodeCard from './ResearchNodeCard';
import { MISSION_REWARD_CHIP_CLASSNAME } from './ResearchRewardTinyChip';

const PREVIEW_HIDE_MS = 180;

export default function ResearchTreeTinyChip({ tree }: { tree: ResearchTreeDef }) {
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

    // Root nodes: no prereqs. These are the first things a player can research in the tree.
    const rootNodes = tree.nodes.filter((n) => n.prereqNodeIds.length === 0);

    const CARD_W = 200;
    const MARGIN = 8;

    useLayoutEffect(() => {
        if (!open || !anchorRef.current) return;
        const el = anchorRef.current;
        const update = () => {
            const rect = el.getBoundingClientRect();
            const cardH = rootNodes.length * 90 + 40;
            let left = rect.left + rect.width / 2 - CARD_W / 2;
            left = Math.max(MARGIN, Math.min(window.innerWidth - CARD_W - MARGIN, left));
            let top = rect.bottom + MARGIN;
            if (top + cardH > window.innerHeight - MARGIN && rect.top > cardH + MARGIN) {
                top = rect.top - MARGIN - cardH;
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
    }, [open, rootNodes.length]);

    const portal =
        open &&
        previewStyle &&
        typeof document !== 'undefined' &&
        createPortal(
            <div
                className="pointer-events-auto fixed z-[9998]"
                style={{ left: previewStyle.left, top: previewStyle.top, width: CARD_W }}
                onMouseEnter={clearHideTimer}
                onMouseLeave={scheduleClose}
            >
                <div className="rounded-xl border border-border-custom bg-[#0f172a]/95 shadow-2xl overflow-hidden">
                    <p className="px-3 pt-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                        {tree.title} tree unlocked
                    </p>
                    <div className="flex flex-col gap-1 px-2 pb-2">
                        {rootNodes.map((node) => (
                            <ResearchNodeCard
                                key={node.id}
                                node={node}
                                variant="display"
                                tone="muted"
                                layout="compact"
                                showCost={false}
                                showRequirements={false}
                                state="enabled"
                            />
                        ))}
                        {rootNodes.length === 0 && (
                            <p className="px-1 pb-1 text-xs text-zinc-500 italic">No base nodes found.</p>
                        )}
                    </div>
                </div>
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
                title={`Unlocks ${tree.title} research tree`}
            >
                <BookOpen className="h-4 w-4 shrink-0 self-center text-violet-400" strokeWidth={2} aria-hidden />
                <span className="min-w-0 flex-1 truncate leading-snug">{tree.title}</span>
            </span>
            {portal}
        </>
    );
}
