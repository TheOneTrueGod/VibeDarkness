import { useState } from 'react';
import DebugJsonBlock from '../DebugJsonBlock';

export interface DebugExpandableOrderProps {
    /** Full wire / persisted record (shown expanded as JSON). */
    entry: unknown;
    unitName: string;
    ownerDisplay: string;
    tick: number;
    abilityId: string;
    moveSummary: string;
    /** CSS color for the left swatch (e.g. player lobby color). */
    swatchColor: string;
    /** Row is still on the server pending queue (not yet in applied log). */
    isPending?: boolean;
}

export default function DebugExpandableOrder({
    entry,
    unitName,
    ownerDisplay,
    tick,
    abilityId,
    moveSummary,
    swatchColor,
    isPending = false,
}: DebugExpandableOrderProps) {
    const [expanded, setExpanded] = useState(false);

    const shellClass = isPending
        ? 'shrink-0 rounded border-2 border-violet-600 bg-violet-400/15 overflow-hidden'
        : 'shrink-0 rounded border border-border-custom bg-surface-light overflow-hidden';
    const buttonHoverClass = isPending
        ? 'hover:bg-violet-400/25'
        : 'hover:bg-border-custom/40';
    const expandedTopBorder = isPending ? 'border-t border-violet-600/70' : 'border-t border-border-custom';
    const expandedBg = isPending ? 'bg-violet-950/30' : 'bg-surface';

    return (
        <div className={shellClass}>
            <button
                type="button"
                className={`w-full text-left flex items-stretch gap-2 px-2 py-2 ${buttonHoverClass} transition-colors min-w-0`}
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
            >
                <span
                    className="w-3 shrink-0 rounded-sm self-stretch"
                    style={{ backgroundColor: swatchColor }}
                    aria-hidden
                />
                <div className="flex-1 min-w-0 flex flex-col gap-0.5 justify-center">
                    <div className="text-xs leading-snug">
                        <span className="font-semibold text-white">{unitName}</span>
                        <span className="text-muted font-normal"> ({ownerDisplay})</span>
                    </div>
                    <div className="text-[11px] text-white/70 leading-snug truncate font-mono">
                        Tick: {tick}
                        <span className="mx-1.5 text-white/40">·</span>
                        ability: {abilityId}
                        <span className="mx-1.5 text-white/40">·</span>
                        Move: {moveSummary}
                    </div>
                </div>
                <span
                    className={`shrink-0 text-muted text-[10px] self-center transition-transform ${
                        expanded ? 'rotate-180' : ''
                    }`}
                    aria-hidden
                >
                    ▼
                </span>
            </button>
            {expanded && (
                <div className={`${expandedTopBorder} px-2 py-2 ${expandedBg} overflow-x-auto`}>
                    <DebugJsonBlock value={entry} emptyText="(empty)" />
                </div>
            )}
        </div>
    );
}
