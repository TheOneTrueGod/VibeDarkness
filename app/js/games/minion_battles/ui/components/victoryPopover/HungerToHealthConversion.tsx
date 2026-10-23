import React, { useEffect, useRef, useState } from 'react';
import { Ham, Heart } from 'lucide-react';
import { HUNGER_ORANGE } from '../../../../../components/ResourcePill';
import type { VictoryHealthConversion } from '../../../storylines/victoryHealthConversion';
import { CharacterHungerBar } from '../CharacterEditor/CharacterHungerBar';
import { VICTORY_CONVERSION_ICON_COUNT } from './victorySequence';

const HP_GREEN = '#22c55e';

interface HungerToHealthConversionProps {
    conversion: VictoryHealthConversion;
    /** The conversion stage has started. */
    active: boolean;
    /** Length of the conversion stage (ms); 0 shows the end state at once. */
    durationMs: number;
}

function lerp(from: number, to: number, t: number): number {
    return from + (to - from) * t;
}

function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
    const percent = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
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
                <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: HP_GREEN }} />
            </div>
        </div>
    );
}

/**
 * Hunger bar (left) drains while the HP bar (right) fills; small food icons fly from one to the other.
 * Progress is driven by one rAF loop so the bars, digits and icons share the stage's duration.
 */
export default function HungerToHealthConversion({ conversion, active, durationMs }: HungerToHealthConversionProps) {
    const [progress, setProgress] = useState(() => (active && durationMs <= 0 ? 1 : 0));
    const flightRef = useRef<HTMLDivElement | null>(null);

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

    // Food icons: staggered flights across the gap between the bars.
    useEffect(() => {
        const host = flightRef.current;
        if (!active || durationMs <= 0 || !host || typeof host.animate !== 'function') return undefined;
        const flightMs = durationMs * 0.55;
        const staggerMs = (durationMs - flightMs) / Math.max(1, VICTORY_CONVERSION_ICON_COUNT - 1);
        const animations = Array.from(host.children).map((el, i) =>
            (el as HTMLElement).animate(
                [
                    { left: '8%', opacity: 0 },
                    { left: '20%', opacity: 1, offset: 0.2 },
                    { left: '80%', opacity: 1, offset: 0.8 },
                    { left: '92%', opacity: 0 },
                ],
                { duration: flightMs, delay: i * staggerMs, easing: 'ease-in-out', fill: 'both' },
            ),
        );
        return () => animations.forEach((a) => a.cancel());
    }, [active, durationMs]);

    const eased = 1 - (1 - progress) * (1 - progress);
    const hunger = lerp(conversion.hungerBefore, conversion.hungerAfter, eased);
    const hp = lerp(conversion.hpBefore, conversion.hpAfter, eased);
    const spent = Math.round(conversion.hungerBefore - conversion.hungerAfter);

    return (
        <div className="flex flex-col items-center gap-1.5" data-testid="victory-hunger-conversion">
            <div className="relative flex w-full items-center gap-2">
                <div className="min-w-0 flex-1">
                    <CharacterHungerBar hunger={hunger} maxHunger={conversion.maxHunger} fullWidth />
                </div>
                <div className="w-14 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                    <HpBar hp={hp} maxHp={conversion.maxHp} />
                </div>
                <div ref={flightRef} className="pointer-events-none absolute inset-0" aria-hidden>
                    {Array.from({ length: VICTORY_CONVERSION_ICON_COUNT }, (_, i) => (
                        <Ham
                            key={i}
                            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 opacity-0"
                            stroke={HUNGER_ORANGE}
                            strokeWidth={2}
                            style={{ marginTop: (i % 3) * 4 - 4 }}
                        />
                    ))}
                </div>
            </div>
            <span className="text-xs text-muted">
                −{spent} Hunger restores health
            </span>
        </div>
    );
}
