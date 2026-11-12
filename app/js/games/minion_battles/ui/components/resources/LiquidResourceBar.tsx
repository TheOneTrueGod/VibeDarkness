/**
 * LiquidResourceBar — `barStyle: 'liquid'` (Water). Ported from the studio's `WaterBar`
 * (`Ideas/fxArt/waterArt.tsx`).
 *
 * The fill's leading edge is a moving liquid surface: two sine layers sliding vertically, the front one
 * inside a mask so the gradient stays still while the surface moves. A caustic glint and rising bubbles
 * play inside the fill, and faint ticks mark every {@link LIQUID_BAR_TICK_EVERY} points so small costs
 * read at a glance. Colours come from the resource: `color` (the surface) and `barDeepColor` (the deep end).
 * Animations stop under `prefers-reduced-motion: reduce`.
 */

import { useId, type CSSProperties } from 'react';
import type { ResourceDisplay } from '../../../resources/Resource';
import { darkenCssHex, mixCssHex } from '../../../themes/colorUtils';

interface LiquidResourceBarProps {
    resource: ResourceDisplay;
}

/** Bar size in px: the same 160 x 16 as the other resource bars. */
const BAR_W = 160;
const BAR_H = 16;

/** A faint tick every this many points of the resource. */
export const LIQUID_BAR_TICK_EVERY = 4;

/** Share of white mixed into `color` for highlights (the studio's `light`). */
const LIGHT_MIX = 0.55;
/** Without `barDeepColor`, the deep end is `color` darkened by this factor. */
const FALLBACK_DEEP_FACTOR = 0.35;

const ANIM_CLASS = 'liquid-bar-anim';

const LIQUID_BAR_CSS = [
    '@keyframes liquid-bar-wave { from { transform: translateY(calc(var(--p) * -1)); } to { transform: translateY(0px); } }',
    '@keyframes liquid-bar-bubble { 0% { transform: translateY(0px); opacity: 0; } 15% { opacity: 0.9; } 85% { opacity: 0.7; } 100% { transform: translateY(-12px); opacity: 0; } }',
    '@keyframes liquid-bar-caustic { to { stroke-dashoffset: -32; } }',
    `@media (prefers-reduced-motion: reduce) { .${ANIM_CLASS} * { animation: none !important; } }`,
].join('\n');

/** Closed path filling everything left of a vertical sine edge at x = 0, tall enough to slide one period. */
function wavePath(amp: number, period: number): string {
    const pts: string[] = [];
    for (let y = -2 * period; y <= BAR_H + 2 * period; y += 1) {
        pts.push(`${(amp * Math.sin((2 * Math.PI * y) / period)).toFixed(2)} ${y}`);
    }
    return `M${-BAR_W - 10} ${-2 * period} L${pts.join(' L')} L${-BAR_W - 10} ${BAR_H + 2 * period} Z`;
}

const FRONT_WAVE = { d: wavePath(2, 12), period: 12, durSec: 1.5 };
const BACK_WAVE = { d: wavePath(2.6, 17), period: 17, durSec: 2.4 };
const CAUSTIC = `M0 3.5 q4 -1.4 8 0 ${Array.from({ length: 21 }, () => 't8 0').join(' ')}`;
/** Bubble x positions as fractions of the fill width. */
const BUBBLES = [0.22, 0.55, 0.82];

/** `useId` output (e.g. `:r1:`) made safe for `url(#...)` references. */
function svgSafeId(raw: string): string {
    return `liq${raw.replace(/[^a-zA-Z0-9]/g, '')}`;
}

export function LiquidResourceBar({ resource }: LiquidResourceBarProps) {
    const uid = svgSafeId(useId());
    const surface = resource.color;
    const deep = resource.barDeepColor ?? darkenCssHex(surface, FALLBACK_DEEP_FACTOR);
    const light = mixCssHex(surface, '#ffffff', LIGHT_MIX);

    const max = Math.max(resource.max, 1);
    const fw = BAR_W * Math.min(1, Math.max(0, resource.current / max));
    const ticks: number[] = [];
    for (let k = LIQUID_BAR_TICK_EVERY; k < resource.max; k += LIQUID_BAR_TICK_EVERY) ticks.push(k);

    const clip = `${uid}c`;
    const fill = `${uid}f`;
    const mask = `${uid}m`;
    const inner = `${uid}i`;

    return (
        <>
            <style>{LIQUID_BAR_CSS}</style>
            <svg
                className={ANIM_CLASS}
                width={BAR_W}
                height={BAR_H}
                viewBox={`0 0 ${BAR_W} ${BAR_H}`}
                style={{ display: 'block' }}
                aria-hidden
            >
                <defs>
                    <clipPath id={clip}>
                        <rect width={BAR_W} height={BAR_H} rx={3} />
                    </clipPath>
                    <clipPath id={inner}>
                        <rect width={Math.max(0, fw - 3)} height={BAR_H} />
                    </clipPath>
                    <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={light} />
                        <stop offset="30%" stopColor={surface} />
                        <stop offset="100%" stopColor={deep} />
                    </linearGradient>
                    {/* The wave lives in a mask so the gradient stays still while the surface moves. */}
                    <mask id={mask} maskUnits="userSpaceOnUse" x={0} y={0} width={BAR_W} height={BAR_H}>
                        <g transform={`translate(${fw} 0)`}>
                            <path
                                d={FRONT_WAVE.d}
                                fill="#fff"
                                style={{ '--p': `${FRONT_WAVE.period}px`, animation: `liquid-bar-wave ${FRONT_WAVE.durSec}s linear infinite reverse` } as CSSProperties}
                            />
                        </g>
                    </mask>
                </defs>
                <rect width={BAR_W} height={BAR_H} rx={3} fill="#262b36" />
                <g clipPath={`url(#${clip})`}>
                    {fw > 0 && (
                        <>
                            <g transform={`translate(${fw + 1.6} 0)`}>
                                <path
                                    d={BACK_WAVE.d}
                                    fill={light}
                                    opacity={0.35}
                                    style={{ '--p': `${BACK_WAVE.period}px`, animation: `liquid-bar-wave ${BACK_WAVE.durSec}s linear infinite` } as CSSProperties}
                                />
                            </g>
                            <rect width={BAR_W} height={BAR_H} fill={`url(#${fill})`} mask={`url(#${mask})`} />
                            <g clipPath={`url(#${inner})`}>
                                <path
                                    d={CAUSTIC}
                                    fill="none"
                                    stroke={light}
                                    strokeWidth={0.8}
                                    strokeDasharray="10 6"
                                    opacity={0.55}
                                    style={{ animation: 'liquid-bar-caustic 1.6s linear infinite' }}
                                />
                                {BUBBLES.map((f, i) => (
                                    <circle
                                        key={f}
                                        cx={fw * f}
                                        cy={BAR_H - 2}
                                        r={0.9}
                                        fill="none"
                                        stroke={light}
                                        strokeWidth={0.5}
                                        style={{ animation: `liquid-bar-bubble 1.8s ease-in ${-i * 0.6}s infinite`, opacity: 0 }}
                                    />
                                ))}
                            </g>
                        </>
                    )}
                    {ticks.map((k) => (
                        <line
                            key={k}
                            x1={(BAR_W * k) / max}
                            x2={(BAR_W * k) / max}
                            y1={0}
                            y2={BAR_H}
                            stroke="#000"
                            strokeOpacity={0.35}
                            strokeWidth={0.8}
                        />
                    ))}
                </g>
                <rect width={BAR_W} height={BAR_H} rx={3} fill="none" stroke="#fff" strokeOpacity={0.1} />
            </svg>
        </>
    );
}
