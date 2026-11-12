/**
 * Animated SVG mock-ups of particle styles for plan `> [!FX_PALETTE]` and `> [!FX_STUDIO]` blocks.
 *
 * Each style is shown in three contexts: a spell-circle **ring**, a **projectile trail**, and rising **off a
 * unit** (the tiny spirit-animal dog, or a caster when a block sets `subject: mage`). Blocks may also list
 * `art:` pieces from `fxArt/` (resource bars, icons, ability effects) painted in the same palette. Particles are plain SVG shapes animated with CSS keyframes; every
 * particle reads its own motion from CSS variables, so one keyframe set per style serves every context.
 * These are concept previews for the Ideas page, not the in-game Pixi painters.
 */
import { createContext, useContext, useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import dogUrl from '../../../games/minion_battles/assets/characters/dog.png';
import type { PlanFxOptions, PlanPaletteColor } from './plansData';
import { FX_FALLBACK_PALETTE as FALLBACK, fxColors, isHex, safePalette, type FxColors, type FxPalette } from './fxColors';
import { FX_ART_CSS, getFxArt } from './fxArt';

export type { FxPalette } from './fxColors';

export type FxContextId = 'ring' | 'trail' | 'unit';
export type FxStyleId = 'wisps' | 'motes' | 'ribbons' | 'ghostfire' | 'frost' | 'droplets' | 'shards' | 'bubbles';
/** What stands in the "Off a unit" scenes. */
export type FxSubject = 'dog' | 'mage';

/** Small deterministic RNG so previews look the same on every render. */
function rng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const between = (r: () => number, lo: number, hi: number) => lo + (hi - lo) * r();

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

interface Stop {
    at: number;
    opacity: number;
    /** CSS transform. Every stop of a style lists the same functions so they interpolate. */
    transform: string;
}

interface StyleDef {
    id: FxStyleId;
    name: string;
    blurb: string;
    count: Record<FxContextId, number>;
    /** Seconds per particle in the ring and unit contexts. */
    dur: [number, number];
    rise: [number, number];
    dx: [number, number];
    sway: [number, number];
    size: [number, number];
    /** Share of the trail loop a particle lives for. */
    trailLife: number;
    ease: string;
    stops: Stop[];
    /** Draws one particle at the origin. `role` picks a colour weight. */
    shape: (p: Particle, c: FxColors, ids: Ids) => ReactNode;
}

const T = (x: string, y: string, rot: string, sx: string, sy: string) =>
    `translate(${x}, ${y}) rotate(${rot}) scale(${sx}, ${sy})`;
const RISE = (f: number) => `calc(var(--rise) * ${-f})`;
const DX = (f: number) => `calc(var(--dx) * ${f})`;

const STYLES: StyleDef[] = [
    {
        id: 'wisps',
        name: 'Wisps',
        blurb: 'Soft blurred puffs that sway as they climb, like breath on cold air. The quietest option.',
        count: { ring: 22, trail: 26, unit: 14 },
        dur: [1.8, 2.8],
        rise: [26, 42],
        dx: [-10, 10],
        sway: [-8, 8],
        size: [2.2, 4.2],
        trailLife: 0.5,
        ease: 'ease-out',
        stops: [
            { at: 0, opacity: 0, transform: T('0px', '0px', '0deg', '0.6', '0.6') },
            { at: 0.15, opacity: 0.9, transform: T('0px', RISE(0.1), '0deg', '1', '1') },
            { at: 0.55, opacity: 0.6, transform: T('var(--sway)', RISE(0.55), '0deg', '1.2', '1.4') },
            { at: 1, opacity: 0, transform: T('var(--dx)', RISE(1), '0deg', '1.6', '2') },
        ],
        shape: (p, c, ids) => (
            <circle r={p.size * 1.9} fill={`url(#${p.role === 0 ? ids.softP : ids.softS})`} />
        ),
    },
    {
        id: 'motes',
        name: 'Motes',
        blurb: 'Pin-sharp sparks that flicker as they rise, like fireflies or dust in a sunbeam. Reads at tiny scale.',
        count: { ring: 30, trail: 34, unit: 18 },
        dur: [1.2, 2],
        rise: [22, 40],
        dx: [-6, 6],
        sway: [-3, 3],
        size: [0.7, 1.4],
        trailLife: 0.35,
        ease: 'linear',
        stops: [
            { at: 0, opacity: 0, transform: T('0px', '0px', '0deg', '1', '1') },
            { at: 0.08, opacity: 1, transform: T('0px', RISE(0.08), '0deg', '1', '1') },
            { at: 0.3, opacity: 0.35, transform: T(DX(0.2), RISE(0.3), '0deg', '1', '1') },
            { at: 0.45, opacity: 1, transform: T('var(--sway)', RISE(0.45), '0deg', '1', '1') },
            { at: 0.65, opacity: 0.4, transform: T(DX(0.6), RISE(0.65), '0deg', '1', '1') },
            { at: 0.8, opacity: 0.9, transform: T(DX(0.8), RISE(0.8), '0deg', '1', '1') },
            { at: 1, opacity: 0, transform: T('var(--dx)', RISE(1), '0deg', '0.5', '0.5') },
        ],
        shape: (p, c, ids) => (
            <g>
                <circle r={p.size * 3.4} fill={`url(#${ids.softP})`} opacity={0.5} />
                <circle r={p.size} fill={p.role === 0 ? c.secondary : c.light} />
            </g>
        ),
    },
    {
        id: 'ribbons',
        name: 'Ribbons',
        blurb: 'Thin curling strands that stretch and twist upward, like incense smoke. Most "spirit", busiest.',
        count: { ring: 16, trail: 18, unit: 9 },
        dur: [1.8, 2.6],
        rise: [26, 40],
        dx: [-8, 8],
        sway: [-6, 6],
        size: [0.9, 1.3],
        trailLife: 0.45,
        ease: 'ease-out',
        stops: [
            { at: 0, opacity: 0, transform: T('0px', '0px', 'calc(var(--rot) * -0.5)', '0.6', '0.3') },
            { at: 0.2, opacity: 0.95, transform: T('0px', RISE(0.15), '0deg', '1', '0.9') },
            { at: 0.6, opacity: 0.7, transform: T('var(--sway)', RISE(0.6), 'var(--rot)', '1', '1.5') },
            { at: 1, opacity: 0, transform: T('var(--dx)', RISE(1), 'calc(var(--rot) * 1.6)', '0.7', '2') },
        ],
        shape: (p, c) => (
            <path
                d="M0 4 C -3 1, 3 -2, 0 -5 C -2 -7, 1 -9, 0 -10"
                fill="none"
                stroke={p.role === 0 ? c.primary : c.secondary}
                strokeWidth={p.size}
                strokeLinecap="round"
            />
        ),
    },
    {
        id: 'ghostfire',
        name: 'Ghost-fire',
        blurb: 'Pale teardrop flames that lick upward and shrink away, like will-o\'-wisps. Strongest silhouette.',
        count: { ring: 18, trail: 20, unit: 10 },
        dur: [0.9, 1.5],
        rise: [16, 28],
        dx: [-4, 4],
        sway: [-3, 3],
        size: [0.8, 1.3],
        trailLife: 0.3,
        ease: 'ease-in',
        stops: [
            { at: 0, opacity: 0, transform: T('0px', '0px', '0deg', '0.5', '0.5') },
            { at: 0.15, opacity: 0.95, transform: T('0px', RISE(0.1), '0deg', '1', '1.1') },
            { at: 0.5, opacity: 0.85, transform: T('var(--sway)', RISE(0.45), 'calc(var(--rot) * 0.3)', '0.8', '1.3') },
            { at: 1, opacity: 0, transform: T('var(--dx)', RISE(1), 'calc(var(--rot) * 0.6)', '0.2', '0.6') },
        ],
        shape: (p, c) => (
            <g transform={`scale(${p.size})`}>
                <path d="M0 -7 C 3.5 -2.5, 3.5 2, 0 3.2 C -3.5 2, -3.5 -2.5, 0 -7 Z" fill={c.primary} opacity={0.8} />
                <path d="M0 -4 C 1.8 -1.2, 1.8 1.4, 0 2.2 C -1.8 1.4, -1.8 -1.2, 0 -4 Z" fill={c.secondary} />
                <circle cy={0.8} r={0.8} fill={c.light} />
            </g>
        ),
    },
    {
        id: 'frost',
        name: 'Frost',
        blurb: 'Six-armed ice crystals that turn slowly as they drift up, like breath freezing in the air. Calm and unmistakably cold.',
        count: { ring: 20, trail: 24, unit: 12 },
        dur: [2.2, 3.2],
        rise: [18, 34],
        dx: [-8, 8],
        sway: [-6, 6],
        size: [1.5, 2.5],
        trailLife: 0.5,
        ease: 'ease-out',
        stops: [
            { at: 0, opacity: 0, transform: T('0px', '0px', '0deg', '0.4', '0.4') },
            { at: 0.2, opacity: 1, transform: T('0px', RISE(0.15), 'calc(var(--rot) * 0.3)', '1', '1') },
            { at: 0.7, opacity: 0.8, transform: T('var(--sway)', RISE(0.65), 'var(--rot)', '1', '1') },
            { at: 1, opacity: 0, transform: T('var(--dx)', RISE(1), 'calc(var(--rot) * 2)', '0.6', '0.6') },
        ],
        shape: (p, c, ids) => (
            <g>
                <circle r={p.size * 2.6} fill={`url(#${ids.softS})`} opacity={0.35} />
                <g transform={`scale(${p.size})`} stroke={p.role === 0 ? c.secondary : c.light} strokeWidth={0.45} strokeLinecap="round">
                    {[0, 60, 120].map((a) => (
                        <g key={a} transform={`rotate(${a})`}>
                            <line x1={0} y1={-3} x2={0} y2={3} />
                            <path d="M-0.9 -2.6 L0 -1.7 L0.9 -2.6 M-0.9 2.6 L0 1.7 L0.9 2.6" fill="none" />
                        </g>
                    ))}
                </g>
            </g>
        ),
    },
    {
        id: 'droplets',
        name: 'Droplets',
        blurb: 'Beads of water flicked up that arc over and fall back, like spray off a wave. The most "liquid" style.',
        count: { ring: 18, trail: 22, unit: 12 },
        dur: [0.9, 1.4],
        rise: [14, 26],
        dx: [-12, 12],
        sway: [-6, 6],
        size: [0.9, 1.4],
        trailLife: 0.35,
        ease: 'linear',
        stops: [
            { at: 0, opacity: 0, transform: T('0px', '0px', '0deg', '0.6', '0.6') },
            { at: 0.15, opacity: 1, transform: T(DX(0.15), RISE(0.6), '0deg', '1', '1') },
            { at: 0.45, opacity: 1, transform: T(DX(0.45), RISE(1), '0deg', '1', '1') },
            { at: 0.7, opacity: 0.95, transform: T(DX(0.7), RISE(0.6), '0deg', '1', '1') },
            { at: 0.9, opacity: 0.7, transform: T(DX(0.9), RISE(0), '0deg', '1', '1') },
            { at: 1, opacity: 0, transform: T('var(--dx)', RISE(-0.25), '0deg', '1.3', '0.5') },
        ],
        shape: (p, c) => (
            <g>
                <ellipse rx={p.size * 1.25} ry={p.size * 1.6} fill={p.role === 0 ? c.primary : c.secondary} opacity={0.9} />
                <circle cx={-p.size * 0.4} cy={-p.size * 0.5} r={p.size * 0.45} fill={c.light} />
            </g>
        ),
    },
    {
        id: 'shards',
        name: 'Ice shards',
        blurb: 'Faceted slivers of ice that burst out and tumble, catching the light. Sharp and violent; best for hits.',
        count: { ring: 16, trail: 20, unit: 10 },
        dur: [0.8, 1.3],
        rise: [20, 34],
        dx: [-16, 16],
        sway: [-8, 8],
        size: [0.8, 1.3],
        trailLife: 0.3,
        ease: 'cubic-bezier(0.2, 0.7, 0.3, 1)',
        stops: [
            { at: 0, opacity: 0, transform: T('0px', '0px', 'calc(var(--rot) * 0.2)', '0.3', '0.3') },
            { at: 0.1, opacity: 1, transform: T(DX(0.15), RISE(0.25), 'calc(var(--rot) * 0.5)', '1', '1') },
            { at: 0.6, opacity: 0.85, transform: T(DX(0.7), RISE(0.8), 'calc(var(--rot) * 2)', '0.9', '0.9') },
            { at: 1, opacity: 0, transform: T('var(--dx)', RISE(1), 'calc(var(--rot) * 3)', '0.4', '0.4') },
        ],
        shape: (p, c) => (
            <g transform={`scale(${p.size})`}>
                <polygon points="0,-6 1.7,0 0,4 -1.7,0" fill={p.role === 0 ? c.primary : c.secondary} stroke={c.light} strokeWidth={0.5} />
                <polygon points="0,-6 1.7,0 0,0" fill={c.light} opacity={0.75} />
            </g>
        ),
    },
    {
        id: 'bubbles',
        name: 'Bubbles',
        blurb: 'Clear rings that wobble upward and pop. Gentle and underwater; weakest on lit ground.',
        count: { ring: 16, trail: 18, unit: 10 },
        dur: [1.6, 2.6],
        rise: [22, 40],
        dx: [-4, 4],
        sway: [-5, 5],
        size: [1, 2.2],
        trailLife: 0.5,
        ease: 'ease-in',
        stops: [
            { at: 0, opacity: 0, transform: T('0px', '0px', '0deg', '0.3', '0.3') },
            { at: 0.15, opacity: 0.95, transform: T('0px', RISE(0.1), '0deg', '1', '1') },
            { at: 0.4, opacity: 0.9, transform: T('var(--sway)', RISE(0.4), '0deg', '1.08', '0.94') },
            { at: 0.7, opacity: 0.85, transform: T('calc(var(--sway) * -1)', RISE(0.7), '0deg', '0.94', '1.06') },
            { at: 0.92, opacity: 0.8, transform: T('var(--dx)', RISE(0.92), '0deg', '1.1', '1.1') },
            { at: 1, opacity: 0, transform: T('var(--dx)', RISE(1), '0deg', '1.9', '1.9') },
        ],
        shape: (p, c) => (
            <g>
                <circle r={p.size * 1.6} fill={c.secondary} fillOpacity={0.15} stroke={p.role === 0 ? c.secondary : c.light} strokeWidth={0.55} />
                <circle cx={-p.size * 0.6} cy={-p.size * 0.6} r={p.size * 0.35} fill={c.light} />
            </g>
        ),
    },
];

export const FX_STYLES: readonly { id: FxStyleId; name: string; blurb: string }[] = STYLES;

const TRAIL_PERIOD = 2.6;
/** Share of the trail loop the projectile is in flight. */
const TRAIL_FLIGHT = 0.72;

function keyframes(name: string, stops: Stop[], scaleAt: number): string {
    const lines = stops.map(
        (s) => `${(s.at * scaleAt * 100).toFixed(2)}% { opacity: ${s.opacity}; transform: ${s.transform}; }`,
    );
    if (scaleAt < 1) {
        const last = stops[stops.length - 1];
        lines.push(`100% { opacity: 0; transform: ${last.transform}; }`);
    }
    return `@keyframes ${name} { ${lines.join(' ')} }`;
}

const FX_CSS = [
    ...STYLES.flatMap((s) => [keyframes(`pfx-${s.id}`, s.stops, 1), keyframes(`pfx-${s.id}-trail`, s.stops, s.trailLife)]),
    `@keyframes pfx-head { 0% { transform: translateX(0px); opacity: 0; } 4% { opacity: 1; } ${TRAIL_FLIGHT * 100}% { transform: translateX(140px); opacity: 1; } ${TRAIL_FLIGHT * 100 + 4}% { transform: translateX(140px); opacity: 0; } 100% { transform: translateX(140px); opacity: 0; } }`,
    '@keyframes pfx-spin { to { transform: rotate(360deg); } }',
    '@keyframes pfx-bob { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-2.5px); } }',
    '@keyframes pfx-pulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 0.9; } }',
    '.pfx-p { transform-box: fill-box; transform-origin: center; opacity: 0; }',
    '@media (prefers-reduced-motion: reduce) { .pfx-anim * { animation-play-state: paused !important; } }',
    FX_ART_CSS,
].join('\n');

// ---------------------------------------------------------------------------
// Particles
// ---------------------------------------------------------------------------

interface Particle {
    x: number;
    y: number;
    size: number;
    /** 0 = primary-weighted, 1 = secondary-weighted. */
    role: 0 | 1;
    style: CSSProperties;
}

interface Ids {
    /** Soft round puffs in primary / secondary: cheaper than a blur filter per particle. */
    softP: string;
    softS: string;
    glow: string;
    dog: string;
}

const RING = { cx: 80, cy: 82, rx: 46, ry: 15 };
const UNIT = { cx: 80, cy: 74 };
const TRAIL_Y = 66;

function makeParticles(style: StyleDef, context: FxContextId): Particle[] {
    const r = rng(style.id.length * 977 + context.length * 131 + style.count[context]);
    const out: Particle[] = [];
    const n = style.count[context];
    for (let i = 0; i < n; i++) {
        let x: number;
        let y: number;
        let dur: number;
        let delay: number;
        let name = `pfx-${style.id}`;
        let riseScale = 1;
        if (context === 'ring') {
            const a = (i / n) * Math.PI * 2 + between(r, -0.15, 0.15);
            x = RING.cx + Math.cos(a) * RING.rx;
            y = RING.cy + Math.sin(a) * RING.ry;
            dur = between(r, style.dur[0], style.dur[1]);
            delay = -between(r, 0, dur);
        } else if (context === 'unit') {
            const a = r() * Math.PI * 2;
            const d = Math.sqrt(r());
            x = UNIT.cx + Math.cos(a) * 10 * d;
            y = UNIT.cy + 2 + Math.sin(a) * 6 * d;
            dur = between(r, style.dur[0], style.dur[1]);
            delay = -between(r, 0, dur);
        } else {
            // Spawn behind the projectile: particle i is born when the head passes x.
            const born = ((i + between(r, 0, 0.8)) / n) * TRAIL_FLIGHT;
            x = 10 + (140 * born) / TRAIL_FLIGHT;
            y = TRAIL_Y + between(r, -3, 3);
            dur = TRAIL_PERIOD;
            delay = born * TRAIL_PERIOD - TRAIL_PERIOD;
            name = `pfx-${style.id}-trail`;
            riseScale = 0.5;
        }
        const vars = {
            '--rise': `${between(r, style.rise[0], style.rise[1]) * riseScale}px`,
            '--dx': `${between(r, style.dx[0], style.dx[1]) - (context === 'trail' ? 6 : 0)}px`,
            '--sway': `${between(r, style.sway[0], style.sway[1])}px`,
            '--rot': `${between(r, -40, 40)}deg`,
            animation: `${name} ${dur.toFixed(2)}s ${style.ease} ${delay.toFixed(2)}s infinite`,
        } as CSSProperties;
        out.push({ x, y, size: between(r, style.size[0], style.size[1]), role: r() < 0.35 ? 0 : 1, style: vars });
    }
    return out;
}

function Particles({ style, context, colors, ids }: { style: StyleDef; context: FxContextId; colors: FxColors; ids: Ids }) {
    const particles = useMemo(() => makeParticles(style, context), [style, context]);
    return (
        <>
            {particles.map((p, i) => (
                <g key={i} transform={`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`}>
                    <g className="pfx-p" style={p.style}>
                        {style.shape(p, colors, ids)}
                    </g>
                </g>
            ))}
        </>
    );
}

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

export type FxBackground = 'dark' | 'ground';

const BACKGROUNDS: Record<FxBackground, { label: string; fill: string; vignette: string }> = {
    dark: { label: 'Darkness', fill: '#07090d', vignette: '#1a1f29' },
    ground: { label: 'Lit ground', fill: '#3a4433', vignette: '#56614a' },
};

function SceneDefs({ ids, colors }: { ids: Ids; colors: FxColors }) {
    return (
        <defs>
            {([
                [ids.softP, colors.primary],
                [ids.softS, colors.secondary],
            ] as const).map(([id, color]) => (
                <radialGradient key={id} id={id}>
                    <stop offset="0%" stopColor={color} stopOpacity={1} />
                    <stop offset="45%" stopColor={color} stopOpacity={0.6} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                </radialGradient>
            ))}
            <filter id={ids.glow} x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="3" />
            </filter>
            {/* Turns the white-on-black dog sprite into a glowing spirit: luminance becomes alpha. */}
            <filter id={ids.dog} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
                <feColorMatrix
                    in="SourceGraphic"
                    type="matrix"
                    values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.33 0.33 0.33 0 -0.15"
                    result="mask"
                />
                <feComposite in="mask" in2="SourceAlpha" operator="in" result="shape" />
                <feFlood floodColor={colors.light} result="body" />
                <feComposite in="body" in2="shape" operator="in" result="dog" />
                <feGaussianBlur in="shape" stdDeviation="1.3" result="soft" />
                <feFlood floodColor={colors.primary} />
                <feComposite in2="soft" operator="in" result="halo" />
                <feMerge>
                    <feMergeNode in="halo" />
                    <feMergeNode in="dog" />
                </feMerge>
            </filter>
        </defs>
    );
}

function RingBase({ colors, ids }: { colors: FxColors; ids: Ids }) {
    const spin = { transformBox: 'view-box', transformOrigin: `${RING.cx}px ${RING.cy}px` } as CSSProperties;
    return (
        <g>
            <ellipse cx={RING.cx} cy={RING.cy} rx={RING.rx + 4} ry={RING.ry + 2} fill={colors.primary} opacity={0.18} filter={`url(#${ids.glow})`} />
            <ellipse cx={RING.cx} cy={RING.cy} rx={RING.rx} ry={RING.ry} fill={colors.primary} opacity={0.12} />
            <ellipse cx={RING.cx} cy={RING.cy} rx={RING.rx} ry={RING.ry} fill="none" stroke={colors.primary} strokeWidth={2} style={{ animation: 'pfx-pulse 2.4s ease-in-out infinite' }} />
            {/* Rotating rune dashes: a circle squashed into the ring's perspective. */}
            <g transform={`translate(${RING.cx} ${RING.cy}) scale(1 ${RING.ry / RING.rx}) translate(${-RING.cx} ${-RING.cy})`}>
                <g style={{ ...spin, animation: 'pfx-spin 9s linear infinite' }}>
                    <circle cx={RING.cx} cy={RING.cy} r={RING.rx - 7} fill="none" stroke={colors.secondary} strokeWidth={1.4} strokeDasharray="2 7 10 7" opacity={0.85} />
                </g>
            </g>
        </g>
    );
}

function TrailHead({ colors, ids }: { colors: FxColors; ids: Ids }) {
    return (
        <g transform={`translate(10 ${TRAIL_Y})`}>
            <g style={{ animation: `pfx-head ${TRAIL_PERIOD}s linear infinite` }}>
                <circle r={9} fill={colors.primary} opacity={0.55} filter={`url(#${ids.glow})`} />
                <ellipse rx={5} ry={3.4} fill={colors.secondary} />
                <circle cx={1} r={1.8} fill={colors.light} />
            </g>
        </g>
    );
}

function SpiritDog({ colors, ids }: { colors: FxColors; ids: Ids }) {
    const size = 36;
    return (
        <g>
            <ellipse cx={UNIT.cx} cy={UNIT.cy + 16} rx={14} ry={4} fill={colors.primary} opacity={0.35} filter={`url(#${ids.glow})`} />
            <g style={{ animation: 'pfx-bob 2.2s ease-in-out infinite' }}>
                <image
                    href={dogUrl}
                    x={UNIT.cx - size / 2}
                    y={UNIT.cy - size / 2}
                    width={size}
                    height={size}
                    filter={`url(#${ids.dog})`}
                />
            </g>
        </g>
    );
}

/** A hooded caster seen from above, standing in for the tree's player unit. */
function Caster({ colors, ids }: { colors: FxColors; ids: Ids }) {
    const { cx, cy } = UNIT;
    return (
        <g>
            <ellipse cx={cx} cy={cy + 14} rx={14} ry={4} fill={colors.primary} opacity={0.4} filter={`url(#${ids.glow})`} />
            <g style={{ animation: 'pfx-bob 2.6s ease-in-out infinite' }}>
                <circle cx={cx} cy={cy} r={11} fill="#1c2430" stroke={colors.primary} strokeWidth={2} />
                <path d={`M${cx - 8} ${cy + 3} Q${cx} ${cy - 17} ${cx + 8} ${cy + 3} Q${cx} ${cy - 1} ${cx - 8} ${cy + 3} Z`} fill={colors.shade} stroke={colors.secondary} strokeWidth={0.8} />
                <circle cx={cx - 2.6} cy={cy - 1.5} r={1} fill={colors.light} />
                <circle cx={cx + 2.6} cy={cy - 1.5} r={1} fill={colors.light} />
            </g>
        </g>
    );
}

const CONTEXT_LABELS: Record<FxContextId, string> = { ring: 'Ring', trail: 'Projectile trail', unit: 'Off a unit' };

/** One animated 160x120 scene: one style, one context, one palette. */
export function FxScene({
    styleId,
    context,
    palette,
    background = 'dark',
    width = 160,
    subject = 'dog',
}: {
    styleId: FxStyleId;
    context: FxContextId;
    palette: FxPalette;
    background?: FxBackground;
    width?: number;
    subject?: FxSubject;
}) {
    const raw = useId().replace(/[^a-zA-Z0-9]/g, '');
    const ids: Ids = { softP: `pfxp${raw}`, softS: `pfxs${raw}`, glow: `pfxg${raw}`, dog: `pfxd${raw}` };
    const p = safePalette(palette);
    const colors = fxColors(p);
    const style = STYLES.find((s) => s.id === styleId) ?? STYLES[0];
    const bg = BACKGROUNDS[background];
    // Particles behind the unit's body for the bottom half of the ring; above it otherwise.
    return (
        <svg
            className="pfx-anim block rounded"
            width={width}
            height={(width * 120) / 160}
            viewBox="0 0 160 120"
            role="img"
            aria-label={`${style.name} ${CONTEXT_LABELS[context]} in ${p.name || 'custom'} colours`}
        >
            <SceneDefs ids={ids} colors={colors} />
            <rect width={160} height={120} fill={bg.fill} />
            <ellipse cx={80} cy={70} rx={70} ry={50} fill={bg.vignette} opacity={0.5} filter={`url(#${ids.glow})`} />
            {context === 'ring' && <RingBase colors={colors} ids={ids} />}
            {context === 'unit' && (subject === 'mage' ? <Caster colors={colors} ids={ids} /> : <SpiritDog colors={colors} ids={ids} />)}
            <Particles style={style} context={context} colors={colors} ids={ids} />
            {context === 'trail' && <TrailHead colors={colors} ids={ids} />}
        </svg>
    );
}

function FxStyleSheet() {
    return <style>{FX_CSS}</style>;
}

const isStyleId = (id: string): id is FxStyleId => STYLES.some((s) => s.id === id);
const isContextId = (id: string): id is FxContextId => id in CONTEXT_LABELS;
const toSubject = (id: string | undefined): FxSubject => (id === 'mage' ? 'mage' : 'dog');

/**
 * One `art:` entry: an `fxArt/` piece, or `fx:<style>:<context>` for a plain particle scene. Unknown ids
 * render a labelled placeholder so a typo in a plan shows up on the page.
 */
export function FxArtTile({
    id,
    palette,
    background = 'dark',
    subject = 'dog',
    scale = 1,
}: {
    id: string;
    palette: FxPalette;
    background?: FxBackground;
    subject?: FxSubject;
    scale?: number;
}) {
    const scene = /^fx:([a-z]+):([a-z]+)$/.exec(id);
    if (scene && isStyleId(scene[1]) && isContextId(scene[2])) {
        const styleId = scene[1];
        const context = scene[2];
        return (
            <figure className="flex flex-col gap-1">
                <FxScene styleId={styleId} context={context} palette={palette} background={background} subject={subject} width={Math.round(128 * scale)} />
                <figcaption className="text-[11px] text-muted">
                    {STYLES.find((s) => s.id === styleId)?.name} · {CONTEXT_LABELS[context]}
                </figcaption>
            </figure>
        );
    }
    const piece = getFxArt(id);
    if (!piece) {
        return <div className="rounded border border-dashed border-red-500/60 px-2 py-1 text-xs text-red-300">Unknown art: {id}</div>;
    }
    const [w, h] = piece.size;
    const width = Math.round(piece.displayWidth * scale);
    const Render = piece.Render;
    return (
        <figure className="flex flex-col gap-1" style={{ width }}>
            <svg
                className="pfx-anim block rounded"
                width={width}
                height={(width * h) / w}
                viewBox={`0 0 ${w} ${h}`}
                role="img"
                aria-label={`${piece.label} in ${palette.name || 'custom'} colours`}
            >
                <Render colors={fxColors(palette)} background={background} />
            </svg>
            <figcaption className="text-[11px] text-muted leading-snug">
                <span className="font-semibold text-gray-300">{piece.label}</span>
                {piece.caption && <> · {piece.caption}</>}
            </figcaption>
        </figure>
    );
}

// ---------------------------------------------------------------------------
// Plan blocks
// ---------------------------------------------------------------------------

interface FxStudioState {
    palettes: FxPalette[];
    selected: string | null;
    select: (name: string) => void;
}

const FxStudioContext = createContext<FxStudioState | null>(null);

/** Wraps a plan so its `[!FX_PALETTE]` cards can push a palette into its `[!FX_STUDIO]` block. */
export function FxStudioProvider({ palettes, children }: { palettes: FxPalette[]; children: ReactNode }) {
    const [selected, setSelected] = useState<string | null>(null);
    const value = useMemo<FxStudioState>(() => ({ palettes, selected, select: setSelected }), [palettes, selected]);
    return (
        <FxStudioContext.Provider value={value}>
            <FxStyleSheet />
            {children}
        </FxStudioContext.Provider>
    );
}

export const FX_STUDIO_ANCHOR = 'fx-studio';

function Swatch({ role, color }: { role: string; color: PlanPaletteColor }) {
    const painted = isHex(color.hex);
    return (
        <span className="inline-flex items-center gap-2 text-xs text-gray-300">
            <span
                className="h-3.5 w-3.5 shrink-0 rounded-sm border border-white/20"
                style={painted ? { backgroundColor: color.hex } : undefined}
                aria-hidden
            />
            <span>{role}</span>
            {color.label !== '' && <span className="text-gray-400">{color.label}</span>}
            {painted && <code className="px-1 py-0.5 rounded bg-surface text-[12px] text-primary">{color.hex}</code>}
        </span>
    );
}

/** A `> [!FX_PALETTE]` card: the palette on the spirit dog and its ring, swatches, and the note. */
export function FxPaletteCard({
    name,
    primary,
    secondary,
    options,
    children,
}: {
    name: string;
    primary: PlanPaletteColor;
    secondary: PlanPaletteColor;
    /** `art:` replaces the three default scenes; `subject:` picks who stands in the unit scene. */
    options?: PlanFxOptions;
    children?: ReactNode;
}) {
    const studio = useContext(FxStudioContext);
    const palette: FxPalette = { name, primary: primary.hex, secondary: secondary.hex };
    const active = studio?.selected === name;
    return (
        <div
            data-className="FxPaletteCard"
            className={`flex flex-col gap-3 rounded-md border bg-surface-light px-4 py-3 ${active ? 'border-primary' : 'border-border-custom'}`}
        >
            <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">{name}</p>
                {studio && (
                    <button
                        type="button"
                        onClick={() => {
                            studio.select(name);
                            document.getElementById(FX_STUDIO_ANCHOR)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                        className="rounded border border-border-custom px-2 py-0.5 text-xs font-semibold text-gray-300 hover:text-white"
                    >
                        Try in studio
                    </button>
                )}
            </div>
            {options?.art ? (
                <div className="flex flex-wrap items-start gap-3">
                    {options.art.map((id) => (
                        <FxArtTile key={id} id={id} palette={palette} subject={toSubject(options.subject)} />
                    ))}
                </div>
            ) : (
                <div className="flex flex-wrap gap-2">
                    <FxScene styleId="wisps" context="unit" palette={palette} width={128} subject={toSubject(options?.subject)} />
                    <FxScene styleId="wisps" context="ring" palette={palette} width={128} />
                    <FxScene styleId="motes" context="trail" palette={palette} width={128} />
                </div>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-2">
                <Swatch role="Primary" color={primary} />
                <Swatch role="Secondary" color={secondary} />
            </div>
            {children}
        </div>
    );
}

function ToggleButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            aria-pressed={active}
            onClick={onClick}
            className={`rounded border px-2 py-0.5 text-xs font-semibold transition-colors ${
                active ? 'border-primary bg-primary text-secondary' : 'border-border-custom text-gray-300 hover:text-white'
            }`}
        >
            {children}
        </button>
    );
}

/**
 * A `> [!FX_STUDIO]` block: pick one of the plan's palettes (or tweak the two colours) and see it on every
 * particle style in a ring, a trail and off a unit.
 */
export function FxStudio({ title, options, children }: { title: string; options?: PlanFxOptions; children?: ReactNode }) {
    const wanted = options?.styles;
    const styles = wanted ? STYLES.filter((s) => wanted.includes(s.id)) : STYLES;
    const subject = toSubject(options?.subject);
    const studio = useContext(FxStudioContext);
    const palettes = studio?.palettes.length ? studio.palettes : [{ ...FALLBACK, name: 'Default' }];
    const selectedName = studio?.selected ?? palettes[0].name;
    const base = palettes.find((p) => p.name === selectedName) ?? palettes[0];
    const [custom, setCustom] = useState<{ from: string; primary: string; secondary: string } | null>(null);
    const [background, setBackground] = useState<FxBackground>('dark');
    const editing = custom && custom.from === base.name ? custom : null;
    const palette: FxPalette = editing ? { name: `${base.name} (edited)`, primary: editing.primary, secondary: editing.secondary } : base;
    const select = (name: string) => {
        setCustom(null);
        studio?.select(name);
    };
    const setColor = (key: 'primary' | 'secondary', hex: string) =>
        setCustom({ from: base.name, primary: palette.primary, secondary: palette.secondary, [key]: hex });

    return (
        <div id={FX_STUDIO_ANCHOR} data-className="FxStudio" className="scroll-mt-32 flex flex-col gap-3 rounded-md border border-border-custom bg-surface-light px-4 py-3">
            <p className="text-sm font-semibold text-white">{title || 'Particle studio'}</p>
            {children}
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted">Palette</span>
                {palettes.map((p) => (
                    <ToggleButton key={p.name} active={p.name === base.name} onClick={() => select(p.name)}>
                        <span className="inline-flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: p.primary }} aria-hidden />
                            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: p.secondary }} aria-hidden />
                            {p.name}
                        </span>
                    </ToggleButton>
                ))}
            </div>
            <div className="flex flex-wrap items-center gap-4">
                <label className="inline-flex items-center gap-2 text-xs text-gray-300">
                    Primary
                    <input type="color" value={safePalette(palette).primary} onChange={(e) => setColor('primary', e.target.value)} className="h-6 w-8 cursor-pointer rounded border border-border-custom bg-transparent" />
                    <code className="text-[12px] text-primary">{palette.primary}</code>
                </label>
                <label className="inline-flex items-center gap-2 text-xs text-gray-300">
                    Secondary
                    <input type="color" value={safePalette(palette).secondary} onChange={(e) => setColor('secondary', e.target.value)} className="h-6 w-8 cursor-pointer rounded border border-border-custom bg-transparent" />
                    <code className="text-[12px] text-primary">{palette.secondary}</code>
                </label>
                {editing && (
                    <button type="button" onClick={() => setCustom(null)} className="text-xs text-gray-400 underline hover:text-white">
                        Reset
                    </button>
                )}
                <span className="ml-auto inline-flex items-center gap-2">
                    <span className="text-xs text-muted">Background</span>
                    {(Object.keys(BACKGROUNDS) as FxBackground[]).map((id) => (
                        <ToggleButton key={id} active={background === id} onClick={() => setBackground(id)}>
                            {BACKGROUNDS[id].label}
                        </ToggleButton>
                    ))}
                </span>
            </div>
            {options?.art && (
                <div className="flex flex-wrap items-start gap-4 border-b border-border-custom pb-3">
                    {options.art.map((id) => (
                        <FxArtTile key={id} id={id} palette={palette} background={background} subject={subject} scale={1.4} />
                    ))}
                </div>
            )}
            <div className="overflow-x-auto">
                <table className="border-separate border-spacing-2">
                    <thead>
                        <tr>
                            <th />
                            {(Object.keys(CONTEXT_LABELS) as FxContextId[]).map((c) => (
                                <th key={c} className="text-left text-xs font-semibold text-muted">
                                    {CONTEXT_LABELS[c]}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {styles.map((s) => (
                            <tr key={s.id}>
                                <td className="w-44 align-top pr-2">
                                    <p className="text-sm font-semibold text-white">{s.name}</p>
                                    <p className="text-xs text-gray-400 leading-snug">{s.blurb}</p>
                                </td>
                                {(Object.keys(CONTEXT_LABELS) as FxContextId[]).map((c) => (
                                    <td key={c}>
                                        <FxScene styleId={s.id} context={c} palette={palette} background={background} width={176} subject={subject} />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
