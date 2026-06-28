/**
 * AbilityTooltip - Tooltip for abilities with a title and one or more lines.
 * Static text and dynamic text (wrapped in {}) are rendered in different colours.
 * Fixed width and height for consistent layout regardless of content.
 */

import React from 'react';

/**
 * Splits a line into static and dynamic segments. Dynamic parts are inside {}.
 * Supports optional colour override: {text:#RRGGBB} renders that segment in the given hex colour
 * instead of the default amber. Any content with a colon where the part after is a hex colour
 * (#RRGGBB or #RGB) is treated as a coloured segment.
 */
function parseTooltipLine(line: string): Array<{ text: string; dynamic: boolean; color?: string }> {
    const segments: Array<{ text: string; dynamic: boolean; color?: string }> = [];
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

export interface AbilityTooltipProps {
    /** Tooltip title (e.g. ability name). */
    title: string;
    /** One or more lines. Use {value} for dynamic parts (e.g. "Hit {1} enemy for {8} damage"). */
    lines: string[];
    /** Whether this is a mobile overlay (full-width with dismiss). */
    isMobileOverlay?: boolean;
    /** Called when the mobile overlay's X button is tapped. */
    onDismiss?: () => void;
}

const TOOLTIP_WIDTH = 180;
const TOOLTIP_HEIGHT = 200;
const LINE_HEIGHT = 1.35;

export default function AbilityTooltip({
    title,
    lines,
    isMobileOverlay = false,
    onDismiss,
}: AbilityTooltipProps) {
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
                    {lines.map((line, i) => (
                        <div key={i} style={{ lineHeight: LINE_HEIGHT }}>
                            {parseTooltipLine(line).map((seg, j) => (
                                <span
                                    key={j}
                                    className={seg.color ? undefined : (seg.dynamic ? 'text-amber-300' : 'text-muted')}
                                    style={seg.color ? { color: seg.color } : undefined}
                                >
                                    {seg.text}
                                </span>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-black border border-white rounded-lg p-3 shadow-lg pointer-events-none z-50 flex flex-col"
            style={{
                width: TOOLTIP_WIDTH,
                height: TOOLTIP_HEIGHT,
            }}
            role="tooltip"
        >
            <h3 className="text-white font-bold text-xs mb-4 text-center">{title}</h3>
            <div className="text-xs space-y-1" style={{ lineHeight: LINE_HEIGHT }}>
                {lines.map((line, i) => (
                    <div key={i}>
                        {parseTooltipLine(line).map((seg, j) => (
                            <span
                                key={j}
                                className={seg.color ? undefined : (seg.dynamic ? 'text-amber-300' : 'text-gray-200')}
                                style={seg.color ? { color: seg.color } : undefined}
                            >
                                {seg.text}
                            </span>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
