/**
 * Compact research reward pill (mission history strip): tree icon + title.
 * Hover opens a floating full ResearchNodeCard; flavor tooltip works on that card.
 */
import React, { useRef } from 'react';
import type { ResearchNodeDef, ResearchTreeDef } from '../researchTrees/types';
import { getResearchNodeChromeTree, getResearchTreeContainingNode } from '../researchTrees/list';
import { researchChromeSurfaceStyle, resolveResearchTreeChrome } from '../researchTrees/researchTreeChrome';
import ResearchTreeIcon from './ResearchTreeIcon';
import {
    ResearchNodePreviewPortal,
    useResearchNodePreviewHover,
} from './ResearchNodeHoverAnchor';

/** Shared styling with item pills and ResourcePill (room for descenders; avoid fixed height + leading-none). */
export const MISSION_REWARD_CHIP_CLASSNAME =
    'inline-flex min-h-[32px] shrink-0 items-center gap-1.5 rounded-lg border border-border-custom bg-surface-light px-2.5 py-1.5 text-[13px] font-semibold leading-snug text-white';

export default function ResearchRewardTinyChip({
    node,
    tree,
}: {
    node: ResearchNodeDef;
    tree?: ResearchTreeDef;
}) {
    const owningTree = tree ?? getResearchTreeContainingNode(node.id);
    const treeChrome = resolveResearchTreeChrome(getResearchNodeChromeTree(node, owningTree));
    const anchorRef = useRef<HTMLSpanElement>(null);
    const hover = useResearchNodePreviewHover();

    return (
        <>
            <span
                data-classname="ResearchRewardTinyChip"
                ref={anchorRef}
                className={`${MISSION_REWARD_CHIP_CLASSNAME} max-w-[min(100%,14rem)] cursor-default`}
                style={treeChrome.secondaryColour ? researchChromeSurfaceStyle(treeChrome) : undefined}
                onMouseEnter={hover.openPreview}
                onMouseLeave={hover.scheduleClose}
                title={node.title}
            >
                <ResearchTreeIcon source={treeChrome} className="h-4 w-4 self-center" title={owningTree?.title} />
                <span className="min-w-0 flex-1 truncate leading-snug">{node.title}</span>
            </span>
            <ResearchNodePreviewPortal
                open={hover.open}
                anchorRef={anchorRef}
                node={node}
                tree={owningTree}
                onMouseEnter={hover.clearHideTimer}
                onMouseLeave={hover.scheduleClose}
            />
        </>
    );
}
