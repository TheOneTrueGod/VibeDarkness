import React from 'react';
import { getAbility } from '../../abilities/AbilityRegistry';
import type { AbilityStatic } from '../../abilities/Ability';

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

function MiniAbilityCard({ ability, label }: { ability: AbilityStatic; label: string }) {
    const lines = ability.getTooltipText();

    return (
        <div className="flex flex-col gap-1">
            <div className="text-[9px] uppercase tracking-wider text-zinc-500 px-0.5">{label}</div>
            <div className="flex flex-col gap-1.5 rounded border border-zinc-600 bg-zinc-900 px-2 py-1.5 w-[130px]">
                <div className="flex items-center gap-1.5">
                    <div className="w-7 h-7 shrink-0 overflow-hidden relative">
                        <div
                            style={{ transform: 'scale(0.7)', transformOrigin: 'top left', width: 40, height: 40, position: 'absolute' }}
                            dangerouslySetInnerHTML={{ __html: ability.image }}
                        />
                    </div>
                    <div className="text-[11px] font-semibold text-white leading-tight truncate min-w-0">{ability.name}</div>
                </div>
                {lines.length > 0 && (
                    <div className="flex flex-col gap-0.5">
                        {lines.map((line, lineIdx) => (
                            <div
                                key={lineIdx}
                                className="text-[10px] text-gray-400 leading-snug"
                                style={{
                                    display: '-webkit-box',
                                    WebkitLineClamp: 4,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                }}
                            >
                                {parseHighlightedSegments(line).map((seg, i) => (
                                    <span key={i} className={seg.highlighted ? 'text-amber-300' : ''}>
                                        {seg.text}
                                    </span>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

interface ResearchAbilityPreviewProps {
    from: string;
    to: string;
}

export default function ResearchAbilityPreview({ from, to }: ResearchAbilityPreviewProps) {
    const fromAbility = getAbility(from);
    const toAbility = getAbility(to);

    if (!fromAbility && !toAbility) return null;

    return (
        <div className="flex items-start gap-2 mt-2 pt-2 border-t border-zinc-700">
            {fromAbility ? (
                <MiniAbilityCard ability={fromAbility} label="Before" />
            ) : (
                <div className="w-[130px] rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[10px] text-zinc-500 italic">
                    Unknown
                </div>
            )}
            <div className="text-zinc-400 text-base shrink-0 self-center">→</div>
            {toAbility ? (
                <MiniAbilityCard ability={toAbility} label="After" />
            ) : (
                <div className="w-[130px] rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[10px] text-zinc-500 italic">
                    Unknown
                </div>
            )}
        </div>
    );
}
