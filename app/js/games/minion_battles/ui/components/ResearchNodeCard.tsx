import React, { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ResearchNodeDef } from '../../../../researchTrees/types';
import ResourcePill, { campaignResourceGains } from '../../../../components/ResourcePill';
import ResearchAbilityPreview from './ResearchAbilityPreview';

export interface ResearchRequirementBadge {
    id: string;
    label: string;
    type: 'knowledge' | 'item';
    satisfied: boolean;
    title?: string;
}

export interface ResearchNodeCardProps {
    node: ResearchNodeDef;
    /** `display` renders a non-interactive card (no button). Overrides legacy `interactive` when set. */
    variant?: 'interactive' | 'display';
    /** Prefer `variant="display"`. When omitted, treated as interactive unless explicitly `false`. */
    interactive?: boolean;
    state?: 'researched' | 'enabled' | 'blocked' | 'default';
    /** Muted zinc styling (e.g. post-mission / reward reveal). Default keeps existing greens/surface. */
    tone?: 'default' | 'muted';
    /** Compact = tight grid card; comfortable = wider card with more description lines. */
    layout?: 'compact' | 'comfortable';
    showCost?: boolean;
    showRequirements?: boolean;
    /** Show the node's tier in the bottom-right corner (intended for the research tree graph view only). */
    showTier?: boolean;
    onClick?: () => void;
    selectionReason?: string | null;
    requirementBadges?: ResearchRequirementBadge[];
    className?: string;
}

function resolveVariant(
    variant: ResearchNodeCardProps['variant'],
    interactive: boolean | undefined,
): 'interactive' | 'display' {
    if (variant != null) return variant;
    if (interactive === false) return 'display';
    return 'interactive';
}

function parseHighlightedSegments(text: string): Array<{ text: string; highlighted: boolean }> {
    const segments: Array<{ text: string; highlighted: boolean }> = [];
    const re = /\{([^}]*)\}/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
        if (match.index > lastIndex) {
            segments.push({ text: text.slice(lastIndex, match.index), highlighted: false });
        }
        segments.push({ text: match[1], highlighted: true });
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
        segments.push({ text: text.slice(lastIndex), highlighted: false });
    }
    return segments;
}

export default function ResearchNodeCard({
    node,
    state = 'default',
    variant,
    interactive,
    tone = 'default',
    layout = 'compact',
    showCost = true,
    showRequirements = true,
    showTier = false,
    onClick,
    selectionReason = null,
    requirementBadges = [],
    className = '',
}: ResearchNodeCardProps) {
    const mode = resolveVariant(variant, interactive);
    const isInteractive = mode === 'interactive';
    const costGains = campaignResourceGains(node.cost);
    const hasReqBadges = showRequirements && requirementBadges.length > 0;
    const hasTooltipContent = Boolean(node.flavorText || selectionReason || node.modifiesAbility);

    const anchorRef = useRef<HTMLDivElement>(null);
    const [flavorHover, setFlavorHover] = useState(false);
    const [tipPosition, setTipPosition] = useState<{ left: number; top: number; transform: string } | null>(null);

    const updateFlavorTooltipPosition = useCallback(() => {
        const el = anchorRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const margin = 8;
        const approxH = node.modifiesAbility ? 280 : 140;
        const vh = window.innerHeight;
        const vw = window.innerWidth;
        const halfW = node.modifiesAbility ? 160 : 120;

        let top: number;
        let transform: string;
        const preferAbove = rect.bottom + margin + approxH > vh - 12 && rect.top > approxH + margin;
        if (preferAbove) {
            top = rect.top - margin;
            transform = 'translate(-50%, -100%)';
        } else {
            top = rect.bottom + margin;
            transform = 'translateX(-50%)';
        }
        let left = rect.left + rect.width / 2;
        left = Math.max(halfW + 8, Math.min(vw - halfW - 8, left));
        setTipPosition({ left, top, transform });
    }, [node.modifiesAbility]);

    const handleFlavorEnter = useCallback(() => {
        if (!hasTooltipContent) return;
        setFlavorHover(true);
        updateFlavorTooltipPosition();
    }, [hasTooltipContent, updateFlavorTooltipPosition]);

    const handleFlavorLeave = useCallback(() => {
        setFlavorHover(false);
        setTipPosition(null);
    }, []);

    const stateClasses =
        tone === 'muted'
            ? state === 'researched'
                ? 'bg-zinc-700 border-zinc-500 text-zinc-50'
                : state === 'enabled'
                  ? 'bg-zinc-800 border-zinc-400 text-zinc-50 hover:bg-zinc-700'
                  : state === 'blocked'
                    ? 'bg-zinc-900 border-zinc-600 text-zinc-300'
                    : 'bg-zinc-800/90 border-zinc-600 text-zinc-300'
            : state === 'researched'
              ? 'bg-green-900 border-green-700 text-white'
              : state === 'enabled'
                ? 'bg-surface-light border-primary text-white hover:bg-surface'
                : state === 'blocked'
                  ? 'bg-zinc-800 border-zinc-500 text-zinc-100'
                  : 'bg-surface-light border-border-custom text-muted';

    /** Fixed footprint so cards never grow with longer titles/descriptions (content clamps inside). */
    const layoutClasses =
        layout === 'comfortable'
            ? 'w-[280px] h-[120px] shrink-0 px-3 py-2 gap-1 overflow-hidden'
            : 'w-[180px] h-[116px] shrink-0 px-3 py-2 gap-1 overflow-hidden';

    const cardClasses = `relative rounded-lg border text-left flex flex-col min-h-0 ${layoutClasses} ${stateClasses} ${!isInteractive ? 'cursor-default' : ''} ${className}`;

    const titleClass =
        layout === 'comfortable'
            ? 'text-base font-semibold leading-snug text-left truncate'
            : 'text-sm font-semibold truncate';

    const descSizeClass = layout === 'comfortable' ? 'text-xs leading-snug' : 'text-[11px] leading-tight';

    const descClampLines = layout === 'comfortable' ? 4 : 3;

    const tierTextClass =
        tone === 'muted'
            ? state === 'researched'
                ? 'text-zinc-500'
                : state === 'enabled'
                  ? 'text-zinc-400'
                  : 'text-zinc-600'
            : state === 'researched'
              ? 'text-green-700'
              : state === 'enabled'
                ? 'text-primary'
                : state === 'blocked'
                  ? 'text-zinc-500'
                  : 'text-border-custom';

    const tierBadge = showTier && node.tier != null && (
        <span className={`absolute bottom-1 right-2 text-[10px] font-semibold leading-none pointer-events-none ${tierTextClass}`}>
            Tier {node.tier}
        </span>
    );

    const content = (
        <div className="flex h-full min-h-0 w-full flex-col gap-1 overflow-hidden">
            <div className={`${titleClass} shrink-0`}>{node.title}</div>
            <div
                className={`${descSizeClass} min-h-0 flex-1 text-gray-300 ${layout === 'comfortable' ? 'line-clamp-4' : 'line-clamp-3'}`}
                style={{
                    display: '-webkit-box',
                    WebkitLineClamp: descClampLines,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                }}
            >
                {parseHighlightedSegments(node.description).map((segment, idx) => (
                    <span
                        key={`${node.id}-desc-${idx}`}
                        className={segment.highlighted ? 'text-amber-300' : 'text-gray-300'}
                    >
                        {segment.text}
                    </span>
                ))}
            </div>
            {showCost && (
                <div className="shrink-0 text-[10px] text-muted flex flex-wrap items-center gap-1">
                    {costGains.length > 0 ? (
                        costGains.map(({ resource, count }) => (
                            <ResourcePill
                                key={`${node.id}-${resource}`}
                                resource={resource}
                                count={count}
                                size={layout === 'compact' ? 'small' : 'default'}
                            />
                        ))
                    ) : (
                        <span>Free</span>
                    )}
                </div>
            )}
        </div>
    );

    const tooltipWidth = node.modifiesAbility ? 'w-[320px]' : 'w-60';

    const flavorPortal =
        flavorHover &&
        tipPosition &&
        hasTooltipContent &&
        typeof document !== 'undefined' &&
        createPortal(
            <div
                className={`pointer-events-none fixed z-[9999] ${tooltipWidth} rounded-md border border-border-custom bg-surface-light px-3 py-2 text-xs text-gray-200 shadow-lg`}
                style={{
                    left: tipPosition.left,
                    top: tipPosition.top,
                    transform: tipPosition.transform,
                }}
            >
                {node.flavorText && <p className="mt-0.5 italic text-gray-200">{node.flavorText}</p>}
                {selectionReason && (
                    <p className={`${node.flavorText ? 'mt-2' : 'mt-0.5'} text-rose-200`}>{selectionReason}</p>
                )}
                {node.modifiesAbility && (
                    <ResearchAbilityPreview
                        from={node.modifiesAbility.from}
                        to={node.modifiesAbility.to}
                        afterTooltipLines={
                            node.modifiesAbility.from === node.modifiesAbility.to
                                ? [node.description]
                                : undefined
                        }
                    />
                )}
            </div>,
            document.body,
        );

    return (
        <div
            ref={anchorRef}
            className="relative"
            onMouseEnter={handleFlavorEnter}
            onMouseLeave={handleFlavorLeave}
        >
            {hasReqBadges && (
                <div className="absolute right-full top-0 z-10 flex max-w-[150px] flex-col gap-1 items-end pr-2">
                    {requirementBadges.map((badge) => (
                        <span
                            key={badge.id}
                            className={
                                badge.type === 'knowledge'
                                    ? `rounded border border-amber-500/35 bg-amber-950/50 px-1.5 py-px text-[10px] font-medium text-amber-100/95 leading-tight shadow-sm whitespace-nowrap ${badge.satisfied ? 'opacity-45' : 'opacity-100'}`
                                    : `max-w-[150px] truncate rounded border border-zinc-500/45 bg-zinc-800/65 px-1.5 py-px text-right text-[10px] font-medium text-zinc-200/95 leading-tight shadow-sm ${badge.satisfied ? 'opacity-45' : 'opacity-100'}`
                            }
                            title={badge.title}
                        >
                            {badge.label}
                        </span>
                    ))}
                </div>
            )}
            {isInteractive ? (
                <button
                    type="button"
                    onClick={onClick}
                    className={cardClasses}
                    disabled={state !== 'enabled'}
                    aria-label={node.title}
                >
                    {content}
                    {tierBadge}
                </button>
            ) : (
                <div className={cardClasses} aria-label={node.title}>
                    {content}
                    {tierBadge}
                </div>
            )}
            {flavorPortal}
        </div>
    );
}
