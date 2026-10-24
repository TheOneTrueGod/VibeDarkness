import React, { useEffect, useRef, useState } from 'react';
import { Ham, Heart } from 'lucide-react';
import ResourcePill, {
    HUNGER_ORANGE,
    RESOURCE_PILL_SIZE_CLASS,
    RESOURCE_PILL_SIZE_MEDIUM,
} from '../../../../../components/ResourcePill';
import type { VictoryHealthConversion } from '../../../storylines/victoryHealthConversion';
import { CharacterHungerBar } from '../CharacterEditor/CharacterHungerBar';
import { VICTORY_CONVERSION_ICON_COUNT } from './victorySequence';

const HP_GREEN = '#22c55e';
/** Tailwind blue-500: HP just recovered. */
const HP_RECOVERED_BLUE = '#3b82f6';

/** Width of each of the Hunger and HP bars. */
const VICTORY_CONVERSION_BAR_WIDTH_PX = 200;

interface HungerToHealthConversionProps {
    conversion: VictoryHealthConversion;
    /** The conversion stage has started. */
    active: boolean;
    /** Length of the conversion animation (ms); 0 shows the end state at once. */
    durationMs: number;
}

function lerp(from: number, to: number, t: number): number {
    return from + (to - from) * t;
}

function hpPercent(hp: number, maxHp: number): number {
    return maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
}

/** Green up to the HP the match ended with, blue for what has been recovered since. */
function HpBar({ hp, hpBefore, maxHp }: { hp: number; hpBefore: number; maxHp: number }) {
    const percent = hpPercent(hp, maxHp);
    const beforePercent = Math.min(percent, hpPercent(hpBefore, maxHp));
    return (
        <div
            className="flex items-center gap-2 rounded-lg border px-2 py-1.5"
            style={{ backgroundColor: '#000000', borderColor: HP_GREEN, width: '100%' }}
            aria-label={`Health ${Math.round(hp)} of ${maxHp}`}
        >
            <span className="flex shrink-0 items-center gap-0.5">
                <span className="font-mono text-xs leading-none" style={{ color: HP_GREEN }} aria-hidden>
                    {Math.round(hp)}
                </span>
                <Heart className="h-3.5 w-3.5 shrink-0" stroke={HP_GREEN} strokeWidth={2} aria-hidden />
            </span>
            <div className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full">
                {/* Recovered span sits under the green, so only the part past the match-end HP shows blue. */}
                <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ width: `${percent}%`, backgroundColor: HP_RECOVERED_BLUE }}
                    title={`${Math.round(hp - hpBefore)} HP recovered`}
                    aria-hidden
                />
                <div
                    className="relative h-full rounded-full"
                    style={{ width: `${beforePercent}%`, backgroundColor: HP_GREEN }}
                    title={`${Math.round(hpBefore)} HP at the end of the fight`}
                />
            </div>
        </div>
    );
}

/** Health restored, in the same pill chrome as `ResourcePill` (green Heart on black). */
function HealthPill({ count }: { count: number }) {
    const sizeClass = RESOURCE_PILL_SIZE_CLASS[RESOURCE_PILL_SIZE_MEDIUM];
    return (
        <span
            className={`inline-flex shrink-0 cursor-default select-none items-center font-semibold leading-snug ${sizeClass.pill}`}
            style={{ borderWidth: 1, borderStyle: 'solid', borderColor: HP_GREEN, color: HP_GREEN, backgroundColor: '#000000' }}
            title={`${count} health restored`}
        >
            <Heart className={`${sizeClass.icon} shrink-0`} stroke={HP_GREEN} strokeWidth={2} aria-hidden />
            +{count}
        </span>
    );
}

/** Share of the stage spent paying the cost when Hunger is also found (the rest refills the Hunger bar). */
const COST_SHARE_WITH_FOUND = 0.7;

function easeOut(t: number): number {
    return 1 - (1 - t) * (1 - t);
}

/**
 * Hunger bar (left) drains while the HP bar (right) fills, with small food icons flying from one to the other;
 * any Hunger found afterwards then refills the Hunger bar. Progress is driven by one rAF loop so the bars, digits
 * and icons share the stage's duration.
 */
export default function HungerToHealthConversion({ conversion, active, durationMs }: HungerToHealthConversionProps) {
    const [progress, setProgress] = useState(() => (active && durationMs <= 0 ? 1 : 0));
    const flightRef = useRef<HTMLDivElement | null>(null);
    const { hungerCost, hungerFound } = conversion;
    const costShare = hungerCost <= 0 ? 0 : hungerFound > 0 ? COST_SHARE_WITH_FOUND : 1;

    useEffect(() => {
        if (!active) return undefined;
        if (durationMs <= 0) {
            setProgress(1);
            return undefined;
        }
        const startedAt = performance.now();
        let frame = requestAnimationFrame(function tick(now) {
            const t = Math.min(1, Math.max(0, (now - startedAt) / durationMs));
            setProgress(t);
            if (t < 1) frame = requestAnimationFrame(tick);
        });
        return () => cancelAnimationFrame(frame);
    }, [active, durationMs]);

    // Food icons: staggered flights from the Hunger bar across to the HP bar, while the cost is being paid.
    useEffect(() => {
        const host = flightRef.current;
        const costMs = durationMs * costShare;
        if (!active || costMs <= 0 || !host || typeof host.animate !== 'function') return undefined;
        const flightMs = costMs * 0.55;
        const staggerMs = (costMs - flightMs) / Math.max(1, VICTORY_CONVERSION_ICON_COUNT - 1);
        const animations = Array.from(host.children).map((el, i) =>
            (el as HTMLElement).animate(
                [
                    { left: '30%', opacity: 0 },
                    { left: '40%', opacity: 1, offset: 0.2 },
                    { left: '60%', opacity: 1, offset: 0.8 },
                    { left: '70%', opacity: 0 },
                ],
                { duration: flightMs, delay: i * staggerMs, easing: 'ease-in-out', fill: 'both' },
            ),
        );
        return () => animations.forEach((a) => a.cancel());
    }, [active, durationMs, costShare]);

    const costT = costShare > 0 ? easeOut(Math.min(1, progress / costShare)) : 1;
    const foundT = costShare < 1 ? easeOut(Math.max(0, (progress - costShare) / (1 - costShare))) : 0;
    const hunger =
        foundT > 0
            ? lerp(conversion.hungerAfterCost, conversion.hungerAfter, foundT)
            : lerp(conversion.hungerBefore, conversion.hungerAfterCost, costT);
    const hp = lerp(conversion.hpBefore, conversion.hpAfter, costT);
    const hpRestored = Math.round(conversion.hpAfter - conversion.hpBefore);

    return (
        <div className="flex flex-col gap-2" data-testid="victory-hunger-conversion">
            {/* Narrow, left-aligned bars: they read as stats, not as dividers across the card. */}
            <div className="relative flex items-center gap-6">
                <div style={{ width: VICTORY_CONVERSION_BAR_WIDTH_PX }} className="min-w-0 shrink">
                    <CharacterHungerBar
                        hunger={hunger}
                        maxHunger={conversion.maxHunger}
                        spentFrom={conversion.hungerBefore}
                        fullWidth
                    />
                </div>
                <div style={{ width: VICTORY_CONVERSION_BAR_WIDTH_PX }} className="min-w-0 shrink">
                    <HpBar hp={hp} hpBefore={conversion.hpBefore} maxHp={conversion.maxHp} />
                </div>
                <div ref={flightRef} className="pointer-events-none absolute inset-0" aria-hidden>
                    {Array.from({ length: VICTORY_CONVERSION_ICON_COUNT }, (_, i) => (
                        <Ham
                            key={i}
                            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 opacity-0"
                            stroke={HUNGER_ORANGE}
                            strokeWidth={2}
                            // Vertical jitter so the icons read as a stream, not a single line.
                            style={{ marginTop: (i % 3) * 5 - 5 }}
                        />
                    ))}
                </div>
            </div>
            {hungerCost > 0 ? (
                <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted">
                    <ResourcePill resource="hunger" count={-hungerCost} size={RESOURCE_PILL_SIZE_MEDIUM} />
                    <span>restores</span>
                    <HealthPill count={hpRestored} />
                </div>
            ) : null}
            {hungerFound > 0 ? (
                <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted">
                    <span>Found</span>
                    <ResourcePill resource="hunger" count={Math.round(hungerFound)} size={RESOURCE_PILL_SIZE_MEDIUM} />
                </div>
            ) : null}
        </div>
    );
}
