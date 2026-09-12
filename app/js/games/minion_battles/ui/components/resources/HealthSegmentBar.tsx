import { useRef, useState } from 'react';
import { SHIELD_RESOURCE_COLOR } from '../../../resources/resourceDisplayDefs';
import {
    EXHAUSTION_HEALTH_BAR_TOOLTIP,
} from '../../../character_defs/exhaustionHealth';
import { AnchoredPortalTooltip } from '../AnchoredPortalTooltip';

interface HealthSegmentBarProps {
    hp: number;
    maxHp: number;
    hpInjury?: number;
    hpExhaustion?: number;
    /** Total active shield HP (sum of ShieldBuff.remainingHp). Renders a light-blue overlay. */
    shieldHp?: number;
}

const SEGMENTS = 4;

function segmentColor(hp: number, maxHp: number): string {
    if (maxHp <= 0) return 'bg-gray-600';
    const pct = (hp / maxHp) * 100;
    if (pct > 60) return 'bg-green-500';
    if (pct > 30) return 'bg-yellow-500';
    return 'bg-red-500';
}

export function HealthSegmentBar({
    hp,
    maxHp,
    hpInjury = 0,
    hpExhaustion = 0,
    shieldHp = 0,
}: HealthSegmentBarProps) {
    const color = segmentColor(hp, maxHp);
    const hpPerSegment = maxHp / SEGMENTS;
    const exhaustionStartGlobal = maxHp - hpExhaustion;
    const injuryStartGlobal = maxHp - hpInjury - hpExhaustion;
    // Shield width is capped at the available (non-reserved) capacity, never bleeding
    // into the injury or exhaustion regions.
    const shieldGlobalWidth = Math.max(0, Math.min(shieldHp, injuryStartGlobal));
    const [exhaustionTipOpen, setExhaustionTipOpen] = useState(false);
    const exhaustionTipRef = useRef<HTMLDivElement>(null);

    return (
        <div className="relative flex w-full gap-0.5">
            {Array.from({ length: SEGMENTS }, (_, i) => {
                const segmentStart = i * hpPerSegment;
                const segmentEnd = (i + 1) * hpPerSegment;
                const fill = Math.max(0, Math.min(1, (hp - segmentStart) / hpPerSegment));
                const isEmpty = hp <= segmentStart;
                const exhaustionOverlapStart = Math.max(segmentStart, exhaustionStartGlobal);
                const exhaustionFill = hpExhaustion > 0
                    ? Math.max(0, Math.min(1, (segmentEnd - exhaustionOverlapStart) / hpPerSegment))
                    : 0;
                const injuryOverlapStart = Math.max(segmentStart, injuryStartGlobal);
                const injuryOverlapEnd = Math.min(segmentEnd, exhaustionStartGlobal);
                const injuryFill = hpInjury > 0
                    ? Math.max(0, Math.min(1, (injuryOverlapEnd - injuryOverlapStart) / hpPerSegment))
                    : 0;
                const shieldFill = shieldGlobalWidth > 0
                    ? Math.max(0, Math.min(1, (shieldGlobalWidth - segmentStart) / hpPerSegment))
                    : 0;
                return (
                    <div
                        key={i}
                        className="relative h-3 flex-1 overflow-hidden rounded-sm bg-green-950"
                    >
                        {!isEmpty && (
                            <div
                                className={`absolute inset-y-0 left-0 ${color} transition-[width] duration-150`}
                                style={{ width: `${fill * 100}%` }}
                            />
                        )}
                        {shieldFill > 0 && (
                            <div
                                className="absolute inset-y-0 left-0 transition-[width] duration-150"
                                style={{ width: `${shieldFill * 100}%`, backgroundColor: SHIELD_RESOURCE_COLOR, opacity: 0.55 }}
                            />
                        )}
                        {injuryFill > 0 && (
                            <div
                                className="absolute inset-y-0 bg-black"
                                style={{ right: `${exhaustionFill * 100}%`, width: `${injuryFill * 100}%` }}
                            />
                        )}
                        {exhaustionFill > 0 && (
                            <div
                                className="absolute inset-y-0 right-0 bg-gray-500"
                                style={{ width: `${exhaustionFill * 100}%` }}
                            />
                        )}
                    </div>
                );
            })}
            {hpExhaustion > 0 && (
                <div
                    ref={exhaustionTipRef}
                    className="absolute inset-y-0 right-0 z-10"
                    style={{ width: `${Math.min(100, (hpExhaustion / Math.max(maxHp, 1)) * 100)}%` }}
                    onMouseEnter={() => setExhaustionTipOpen(true)}
                    onMouseLeave={() => setExhaustionTipOpen(false)}
                />
            )}
            <AnchoredPortalTooltip anchorRef={exhaustionTipRef} open={exhaustionTipOpen} placement="top">
                <div className="max-w-xs px-2 py-1 text-[10px] leading-tight">
                    {EXHAUSTION_HEALTH_BAR_TOOLTIP}
                </div>
            </AnchoredPortalTooltip>
        </div>
    );
}
