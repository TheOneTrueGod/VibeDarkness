/**
 * AbilityTooltip - Tooltip for abilities with a title and one or more lines.
 * Static text and dynamic text (wrapped in {}) are rendered in different colours.
 * Prefer `segmentLines` (from formatTooltipLines) for research-aware tokens; legacy
 * `{value}` / `{text:#hex}` strings still work via `lines`.
 * Fixed width and height for consistent layout regardless of content.
 */

import React from 'react';
import type { TooltipSegment } from '../../abilities/tooltipTokens';
import { AnchoredPortalTooltip } from './AnchoredPortalTooltip';
import { getDisabledReasonDisplay, type DisabledReason } from './abilityDisabledReason';

/** Unified render shape (legacy parse + TooltipSegment). */
type RenderSegment = { text: string; dynamic: boolean; color?: string };

/**
 * Splits a line into static and dynamic segments. Dynamic parts are inside {}.
 * Supports optional colour override: {text:#RRGGBB} renders that segment in the given hex colour
 * instead of the default amber. Any content with a colon where the part after is a hex colour
 * (#RRGGBB or #RGB) is treated as a coloured segment.
 */
function parseTooltipLine(line: string): RenderSegment[] {
    const segments: RenderSegment[] = [];
    const re = /\{([^}]*)\}/g;
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
        if (m.index > lastIndex) {
            segments.push({ text: line.slice(lastIndex, m.index), dynamic: false });
        }
        const content = m[1];
        const colonIdx = content.indexOf(':');
        if (colonIdx !== -1 && content[colonIdx + 1] === '#') {
            segments.push({
                text: content.slice(0, colonIdx),
                dynamic: true,
                color: content.slice(colonIdx + 1),
            });
        } else {
            segments.push({ text: content, dynamic: true });
        }
        lastIndex = m.index + m[0].length;
    }
    if (lastIndex < line.length) {
        segments.push({ text: line.slice(lastIndex), dynamic: false });
    }
    return segments;
}

function tooltipSegmentToRender(seg: TooltipSegment): RenderSegment {
    return {
        text: seg.text,
        dynamic: seg.role === 'dynamic',
        color: seg.color,
    };
}

/** Prefer pre-resolved segmentLines; otherwise legacy-parse each string line. */
function resolveLinesForRender(
    lines: string[],
    segmentLines?: TooltipSegment[][],
): RenderSegment[][] {
    if (segmentLines && segmentLines.length > 0) {
        return segmentLines.map((row) => row.map(tooltipSegmentToRender));
    }
    return lines.map(parseTooltipLine);
}

function renderSegmentSpans(
    segments: RenderSegment[],
    staticClassName: string,
): React.ReactNode {
    return segments.map((seg, j) => (
        <span
            key={j}
            className={seg.color ? undefined : (seg.dynamic ? 'text-amber-300' : staticClassName)}
            style={seg.color ? { color: seg.color } : undefined}
        >
            {seg.text}
        </span>
    ));
}

export interface AbilityTooltipProps {
    /** Tooltip title (e.g. ability name). */
    title: string;
    /**
     * Legacy string lines. Use `{value}` for dynamic parts (e.g. "Hit {1} enemy for {8} damage").
     * Ignored for content when `segmentLines` is set (still required for callers that always pass it).
     */
    lines: string[];
    /**
     * Pre-resolved token segments from `formatTooltipLines`. When set (non-empty),
     * these are rendered instead of parsing `lines`.
     */
    segmentLines?: TooltipSegment[][];
    /** When set, shows a rose-colored section explaining why the ability is disabled. */
    disabledReason?: DisabledReason;
    /** Whether this is a mobile overlay (full-width with dismiss). */
    isMobileOverlay?: boolean;
    /** Called when the mobile overlay's X button is tapped. */
    onDismiss?: () => void;
    /** When set with `open`, desktop tooltip is portaled above the anchor (avoids overflow clipping). */
    anchorRef?: React.RefObject<HTMLElement | null>;
    /** Whether the portaled desktop tooltip is visible. Defaults to true when rendered. */
    open?: boolean;
}

const TOOLTIP_WIDTH = 180;
const TOOLTIP_HEIGHT = 200;
const LINE_HEIGHT = 1.35;

export default function AbilityTooltip({
    title,
    lines,
    segmentLines,
    disabledReason,
    isMobileOverlay = false,
    onDismiss,
    anchorRef,
    open = true,
}: AbilityTooltipProps) {
    const reasonDisplay = disabledReason ? getDisabledReasonDisplay(disabledReason) : null;
    const renderedLines = resolveLinesForRender(lines, segmentLines);

    if (isMobileOverlay) {
        return (
            <div
                className="absolute inset-x-0 bottom-0 bg-black border-t border-dark-600 p-4 z-50"
                style={{ minHeight: TOOLTIP_HEIGHT }}
            >
                <div className="relative mb-2">
                    <h3 className="text-white font-bold text-sm text-center">{title}</h3>
                    <button
                        onClick={onDismiss}
                        className="absolute right-0 top-0 text-muted hover:text-white text-lg leading-none px-1"
                    >
                        &times;
                    </button>
                </div>
                <div className="text-gray-200 text-xs leading-relaxed space-y-1">
                    {renderedLines.map((segs, i) => (
                        <div key={i} style={{ lineHeight: LINE_HEIGHT }}>
                            {renderSegmentSpans(segs, 'text-muted')}
                        </div>
                    ))}
                </div>
                {reasonDisplay && (
                    <div className="mt-3 pt-3 border-t border-rose-900">
                        <p className="text-rose-300 font-bold text-xs">{reasonDisplay.title}</p>
                        <p className="text-rose-200 text-xs mt-0.5">{reasonDisplay.description}</p>
                    </div>
                )}
            </div>
        );
    }

    const body = (
        <>
            <h3 className="text-white font-bold text-xs mb-4 text-center">{title}</h3>
            <div className="text-xs space-y-1" style={{ lineHeight: LINE_HEIGHT }}>
                {renderedLines.map((segs, i) => (
                    <div key={i}>
                        {renderSegmentSpans(segs, 'text-gray-200')}
                    </div>
                ))}
            </div>
            {reasonDisplay && (
                <div className="mt-auto">
                    <div className="mt-2 pt-2 border-t border-rose-900">
                        <p className="text-rose-300 font-bold text-xs">{reasonDisplay.title}</p>
                        <p className="text-rose-200 text-xs mt-0.5">{reasonDisplay.description}</p>
                    </div>
                </div>
            )}
        </>
    );

    const desktopClassName =
        'flex flex-col rounded-lg border border-white bg-black p-3 shadow-lg';

    if (anchorRef) {
        return (
            <AnchoredPortalTooltip
                anchorRef={anchorRef}
                open={open}
                className={desktopClassName}
                style={{
                    width: TOOLTIP_WIDTH,
                    minHeight: TOOLTIP_HEIGHT,
                }}
            >
                {body}
            </AnchoredPortalTooltip>
        );
    }

    return (
        <div
            className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none z-50 flex flex-col ${desktopClassName}`}
            style={{
                width: TOOLTIP_WIDTH,
                minHeight: TOOLTIP_HEIGHT,
            }}
            role="tooltip"
        >
            {body}
        </div>
    );
}
