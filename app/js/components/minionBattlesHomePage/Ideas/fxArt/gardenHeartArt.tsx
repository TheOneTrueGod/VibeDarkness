/**
 * Concept art for the garden boss, the Garden Heart (plan `docs/ideas/plans/0006_2026-11-14_chapter-3-bosses.md`):
 * three ways to draw the Heart, the living Stem and its Bud, the Husk's damage cut, the Stem turning
 * into Briar and then Tangle, the retreat-and-resprout, the four phase shapes, and the five node kinds.
 * Everything is painted from the palette card so the studio can recolour it. These are Ideas-page
 * previews drawn from the design, not the in-game Pixi painters.
 */
import { useId, type CSSProperties, type ReactNode } from 'react';
import { mix, type FxColors } from '../fxColors';
import { ART_BACKGROUNDS, type FxArtPiece, type FxArtProps } from './types';

const FONT = 'ui-sans-serif, system-ui, sans-serif';
const RED = '#ef4444';
const GRAY_TEXT = '#9ca3af';
/** One tile in these drawings. */
const T = 14;

type Pt = [number, number];
export type HeartStyle = 'rose' | 'pod' | 'wood';
export type NodeKind = 'shooter' | 'mortar' | 'bloom' | 'hive' | 'creeper';

const uidOf = (raw: string) => `g${raw.replace(/[^a-zA-Z0-9]/g, '')}`;

/** Class for elements that scale about their own centre. */
const P = 'gfx-p';

/** Runner patches appear as the creeper reaches them (fractions of its length, reached by 45% of the loop). */
const CREEP_PATCHES = [0.14, 0.32, 0.5, 0.68, 0.86];

export const GARDEN_ART_CSS = [
    `.${P} { transform-box: fill-box; transform-origin: center; }`,
    '@keyframes gfx-pulse { 0%, 100% { transform: scale(1); opacity: 0.85; } 50% { transform: scale(1.12); opacity: 1; } }',
    '@keyframes gfx-dmg-big { 0% { opacity: 0; transform: translateY(0px) scale(0.6); } 6% { opacity: 1; transform: translateY(-2px) scale(1.2); } 12% { transform: translateY(-4px) scale(1); } 45% { opacity: 1; transform: translateY(-16px) scale(1); } 55%, 100% { opacity: 0; transform: translateY(-18px) scale(1); } }',
    '@keyframes gfx-dmg-dull { 0% { opacity: 0; transform: translateY(0px); } 10% { opacity: 0.9; } 80% { opacity: 0.8; transform: translateY(-6px); } 92%, 100% { opacity: 0; transform: translateY(-7px); } }',
    '@keyframes gfx-slash { 0% { stroke-dashoffset: 100; opacity: 1; } 6% { stroke-dashoffset: 0; opacity: 1; } 22%, 100% { stroke-dashoffset: 0; opacity: 0; } }',
    '@keyframes gfx-fly { 0% { opacity: 0; transform: translateX(0px); } 3% { opacity: 1; } 82% { opacity: 1; transform: translateX(var(--len)); } 86%, 100% { opacity: 0; transform: translateX(var(--len)); } }',
    '@keyframes gfx-drift { 0% { opacity: 0; transform: translate(0px, 0px); } 10% { opacity: 1; } 80% { opacity: 1; transform: translate(var(--dx), var(--dy)); } 100% { opacity: 0; transform: translate(var(--dx), var(--dy)); } }',
    '@keyframes gfx-flash { 0% { opacity: 0; transform: scale(0.6); } 4% { opacity: 0.95; transform: scale(1.15); } 16%, 100% { opacity: 0; transform: scale(1.6); } }',
    // Bud Mortar, 7 s: lob 0-7%, grow 7-79%, telegraph the last 1.5 s (57-79%), burst at 80%.
    '@keyframes gfx-lob { 0% { opacity: 1; transform: translate(0px, 0px) scale(0.8); } 3.5% { transform: translate(var(--mx), var(--my)) scale(1.3); } 7% { opacity: 1; transform: translate(var(--dx), var(--dy)) scale(0.8); } 8%, 100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(0.8); } }',
    '@keyframes gfx-grow { 0%, 7% { opacity: 0; transform: scale(0.2); } 8% { opacity: 1; transform: scale(0.25); } 78% { opacity: 1; transform: scale(1); } 80% { opacity: 1; transform: scale(1.2); } 81%, 100% { opacity: 0; transform: scale(1.2); } }',
    '@keyframes gfx-tele { 0%, 57% { opacity: 0; } 58%, 79% { opacity: 1; } 80%, 100% { opacity: 0; } }',
    '@keyframes gfx-fill { 0%, 57% { transform: scale(0); } 79% { transform: scale(1); } 100% { transform: scale(1); } }',
    '@keyframes gfx-boom { 0%, 79% { opacity: 0; transform: scale(0.5); } 81% { opacity: 1; transform: scale(1); } 92%, 100% { opacity: 0; transform: scale(1.35); } }',
    // Creeper, 6 s: grow 0-45%, hold, retract 60-85%.
    '@keyframes gfx-creep { 0% { stroke-dashoffset: 100; } 45%, 60% { stroke-dashoffset: 0; } 85%, 100% { stroke-dashoffset: 100; } }',
    ...CREEP_PATCHES.map((f, i) => {
        const at = (f * 45).toFixed(1);
        const on = (f * 45 + 3).toFixed(1);
        return `@keyframes gfx-patch-${i} { 0%, ${at}% { opacity: 0; transform: scale(0.4); } ${on}% { opacity: 1; transform: scale(1); } 92% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(1); } }`;
    }),
    // Retreat, 7 s: close 14-22%, sink 24-46%, burrow 48-62%, rise 62-78%, open 84-90%.
    '@keyframes gfx-l-open { 0%, 14% { opacity: 1; } 22%, 94% { opacity: 0; } 100% { opacity: 1; } }',
    '@keyframes gfx-l-closed { 0%, 14% { opacity: 0; } 22%, 94% { opacity: 1; } 100% { opacity: 0; } }',
    '@keyframes gfx-sink { 0%, 24% { opacity: 1; transform: translateY(0px) scale(1); } 46% { opacity: 1; transform: translateY(var(--sink)) scale(0.55); } 47%, 94% { opacity: 0; transform: translateY(var(--sink)) scale(0.55); } 100% { opacity: 1; transform: translateY(0px) scale(1); } }',
    '@keyframes gfx-rise { 0%, 62% { opacity: 0; transform: translateY(var(--sink)) scale(0.55); } 63% { opacity: 1; } 78% { opacity: 1; transform: translateY(0px) scale(1); } 94% { opacity: 1; transform: translateY(0px) scale(1); } 100% { opacity: 0; transform: translateY(0px) scale(1); } }',
    '@keyframes gfx-r-open { 0%, 84% { opacity: 0; } 90%, 100% { opacity: 1; } }',
    '@keyframes gfx-r-closed { 0%, 84% { opacity: 1; } 90%, 100% { opacity: 0; } }',
    '@keyframes gfx-burrow { 0%, 46% { opacity: 0; transform: translateX(0px); } 48% { opacity: 1; transform: translateX(0px); } 62% { opacity: 1; transform: translateX(var(--dx)); } 64%, 100% { opacity: 0; transform: translateX(var(--dx)); } }',
    '@keyframes gfx-sprout { 0%, 88% { stroke-dashoffset: 100; } 96%, 100% { stroke-dashoffset: 0; } }',
].join('\n');

const anim = (name: string, dur: number, delay = 0, extra: CSSProperties = {}, timing = 'linear'): CSSProperties => ({
    animation: `${name} ${dur}s ${timing} ${delay.toFixed(3)}s infinite`,
    ...extra,
});

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

/** Bark for husks and dead wood: the primary pulled toward brown. */
const barkOf = (c: FxColors) => mix(c.primary, '#4a3423', 0.55);
/** A node's soft flesh, between mass and event. */
const fleshOf = (c: FxColors) => mix(c.primary, c.secondary, 0.35);
/** Dead stem colour: drained of the palette. */
const deadOf = (c: FxColors) => mix(barkOf(c), '#8a8073', 0.45);

function Ground({ w, h, background, grid = true }: { w: number; h: number; background: FxArtProps['background']; grid?: boolean }) {
    return (
        <g>
            <rect width={w} height={h} fill={ART_BACKGROUNDS[background]} />
            {grid &&
                Array.from({ length: Math.ceil(w / T) }, (_, i) => (
                    <line key={`v${i}`} x1={i * T} y1={0} x2={i * T} y2={h} stroke="#ffffff" strokeOpacity={0.035} strokeWidth={0.5} />
                ))}
            {grid &&
                Array.from({ length: Math.ceil(h / T) }, (_, i) => (
                    <line key={`h${i}`} x1={0} y1={i * T} x2={w} y2={i * T} stroke="#ffffff" strokeOpacity={0.035} strokeWidth={0.5} />
                ))}
        </g>
    );
}

function Label({ x, y, children, anchor = 'middle', size = 8, fill = '#cbd5e1' }: { x: number; y: number; children: ReactNode; anchor?: 'start' | 'middle' | 'end'; size?: number; fill?: string }) {
    return (
        <text x={x} y={y} fontSize={size} fill={fill} fontFamily={FONT} textAnchor={anchor}>
            {children}
        </text>
    );
}

function Hero({ x, y, tint = '#60a5fa' }: { x: number; y: number; tint?: string }) {
    return (
        <g transform={`translate(${x} ${y})`}>
            <circle r={6} fill="#1c2430" stroke={tint} strokeWidth={1.5} />
            <circle cy={-1.8} r={1.4} fill={tint} />
        </g>
    );
}

/** Catmull-Rom through the points, as cubic Beziers. */
function smooth(pts: Pt[]): string {
    if (pts.length < 2) return '';
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] ?? pts[i];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[i + 2] ?? p2;
        const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
        const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
        d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d;
}

/** The points pushed sideways by a travelling sine; the root stays put and the far end swings most. */
function sway(pts: Pt[], phase: number, amp: number): Pt[] {
    const n = pts.length;
    return pts.map((p, i) => {
        if (i === 0) return p;
        const prev = pts[Math.max(0, i - 1)];
        const next = pts[Math.min(n - 1, i + 1)];
        const tx = next[0] - prev[0];
        const ty = next[1] - prev[1];
        const len = Math.hypot(tx, ty) || 1;
        const k = amp * Math.sin(phase + i * 1.25) * (0.35 + (0.65 * i) / (n - 1));
        return [p[0] + (-ty / len) * k, p[1] + (tx / len) * k];
    });
}

/** Centres of the tiles a polyline crosses, skipping the first `skip` fraction (where it leaves its node). */
function tilesAlong(pts: Pt[], skip = 0): Pt[] {
    const seen = new Set<string>();
    const out: Pt[] = [];
    const steps = 80;
    for (let s = Math.round(skip * steps); s <= steps; s++) {
        const idx = (s / steps) * (pts.length - 1);
        const i = Math.min(pts.length - 2, Math.floor(idx));
        const t = idx - i;
        const x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t;
        const y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t;
        const cx = Math.floor(x / T) * T + T / 2;
        const cy = Math.floor(y / T) * T + T / 2;
        const key = `${cx},${cy}`;
        if (!seen.has(key)) {
            seen.add(key);
            out.push([cx, cy]);
        }
    }
    return out;
}

const SWAY_PHASES =[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2, 0];

/** The stem's look: dark rind, living core, thorn ticks either side. */
function StemStrokes({ d, colors, dead = false, width = 5 }: { d: string; colors: FxColors; dead?: boolean; width?: number }) {
    const rind = dead ? mix(deadOf(colors), '#000000', 0.35) : colors.shade;
    const core = dead ? deadOf(colors) : colors.primary;
    return (
        <g fill="none" strokeLinecap="round">
            <path d={d} stroke={rind} strokeWidth={width + 5} strokeDasharray="1.2 6" />
            <path d={d} stroke={rind} strokeWidth={width + 2} />
            <path d={d} stroke={core} strokeWidth={width} />
            {!dead && <path d={d} stroke={colors.light} strokeOpacity={0.3} strokeWidth={1} strokeDasharray="5 7" />}
        </g>
    );
}

/** A living stem that sways, with whatever hangs off its tip moving along with it. */
function LiveStem({ pts, colors, amp = 4, dur = 4.5, tip }: { pts: Pt[]; colors: FxColors; amp?: number; dur?: number; tip?: ReactNode }) {
    const frames = SWAY_PHASES.map((ph) => sway(pts, ph, amp));
    const values = frames.map(smooth).join(';');
    const end = pts[pts.length - 1];
    const tipValues = frames.map((f) => `${(f[f.length - 1][0] - end[0]).toFixed(1)} ${(f[f.length - 1][1] - end[1]).toFixed(1)}`).join(';');
    const d = smooth(frames[0]);
    return (
        <g>
            <g fill="none" strokeLinecap="round">
                {[
                    { stroke: colors.shade, width: 10, dash: '1.2 6' },
                    { stroke: colors.shade, width: 7 },
                    { stroke: colors.primary, width: 5 },
                    { stroke: colors.light, width: 1, dash: '5 7', opacity: 0.3 },
                ].map((s, i) => (
                        <path key={i} d={d} stroke={s.stroke} strokeWidth={s.width} strokeDasharray={s.dash} strokeOpacity={s.opacity}>
                            <animate attributeName="d" dur={`${dur}s`} repeatCount="indefinite" values={values} calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1" />
                        </path>
                ))}
            </g>
            {tip && (
                <g transform={`translate(${end[0]} ${end[1]})`}>
                    <g>
                        <animateTransform attributeName="transform" type="translate" dur={`${dur}s`} repeatCount="indefinite" values={tipValues} calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1" />
                        {tip}
                    </g>
                </g>
            )}
        </g>
    );
}

/** The glowing heart-core that shows when a husk opens. */
function Core({ r, colors }: { r: number; colors: FxColors }) {
    return (
        <g>
            <circle r={r * 1.5} fill={colors.secondary} opacity={0.18} />
            <g className={P} style={anim('gfx-pulse', 1.6, 0, {}, 'ease-in-out')}>
                <circle r={r} fill={colors.secondary} />
                <circle r={r * 0.55} fill={colors.light} />
                <circle r={r * 0.22} cx={-r * 0.2} cy={-r * 0.25} fill="#ffffff" opacity={0.8} />
            </g>
        </g>
    );
}

// ---------------------------------------------------------------------------
// The Heart, three ways
// ---------------------------------------------------------------------------

const petal = (len: number, wide: number) => `M0 0 Q${wide} ${-len * 0.55} 0 ${-len} Q${-wide} ${-len * 0.55} 0 0 Z`;

/** Rosebud: overlapping petal plates close into a tight bud; they splay open around the core. */
function RoseHeart({ R, colors, open }: { R: number; colors: FxColors; open: boolean }) {
    const outer = Array.from({ length: 6 }, (_, k) => k * 60 + 30);
    const inner = Array.from({ length: 5 }, (_, k) => k * 72);
    const plate = open ? mix(colors.primary, colors.secondary, 0.2) : colors.primary;
    return (
        <g>
            <ellipse cy={R * 0.55} rx={R * 1.05} ry={R * 0.4} fill="#000000" opacity={0.35} />
            {outer.map((a) => (
                <g key={`o${a}`} transform={`rotate(${a}) scale(${open ? 1.35 : 1})`}>
                    <path d={petal(R * 1.05, R * 0.75)} fill={plate} stroke={colors.shade} strokeWidth={1.6} strokeLinejoin="round" />
                    <path d={`M0 ${-R * 1.02} l-2 -4 l4 0 Z`} fill={barkOf(colors)} />
                </g>
            ))}
            {open ? (
                <Core r={R * 0.48} colors={colors} />
            ) : (
                <g>
                    {inner.map((a) => (
                        <path key={`i${a}`} transform={`rotate(${a})`} d={petal(R * 0.72, R * 0.55)} fill={mix(colors.primary, colors.shade, 0.25)} stroke={colors.shade} strokeWidth={1.3} />
                    ))}
                    <path d={`M0 0 m-${R * 0.2} 0 a${R * 0.2} ${R * 0.2} 0 1 1 ${R * 0.3} ${R * 0.1} a${R * 0.12} ${R * 0.12} 0 1 1 -${R * 0.12} -${R * 0.16}`} fill="none" stroke={colors.shade} strokeWidth={1.4} />
                </g>
            )}
        </g>
    );
}

/** Seed pod: a plated husk with a faint seam; it splits in two around the core. */
function PodHeart({ R, colors, open, uid }: { R: number; colors: FxColors; open: boolean; uid: string }) {
    const rx = R;
    const ry = R * 1.12;
    const spikes = Array.from({ length: 10 }, (_, k) => (k / 10) * Math.PI * 2);
    const half = (side: -1 | 1) => (
        <g transform={`translate(${open ? side * R * 0.42 : 0} 0) rotate(${open ? side * 8 : 0})`}>
            <clipPath id={`${uid}-${side}`}>
                <rect x={side < 0 ? -rx - 8 : 0} y={-ry - 8} width={rx + 8} height={ry * 2 + 16} />
            </clipPath>
            <g clipPath={`url(#${uid}-${side})`}>
                {spikes.map((a) => (
                    <path key={a} transform={`rotate(${(a * 180) / Math.PI})`} d={`M-2.5 ${-ry + 1} L0 ${-ry - 5} L2.5 ${-ry + 1} Z`} fill={barkOf(colors)} />
                ))}
                <ellipse rx={rx} ry={ry} fill={colors.primary} stroke={colors.shade} strokeWidth={2.4} />
                <path d={`M${-rx * 0.55} ${-ry * 0.8} Q${-rx * 0.85} 0 ${-rx * 0.55} ${ry * 0.8} M${rx * 0.55} ${-ry * 0.8} Q${rx * 0.85} 0 ${rx * 0.55} ${ry * 0.8}`} fill="none" stroke={colors.shade} strokeWidth={1.4} />
                <path d={`M${-rx} ${-ry * 0.1} Q0 ${ry * 0.25} ${rx} ${-ry * 0.1}`} fill="none" stroke={colors.shade} strokeWidth={1} opacity={0.7} />
            </g>
        </g>
    );
    return (
        <g>
            <ellipse cy={R * 0.7} rx={R * 1.1} ry={R * 0.4} fill="#000000" opacity={0.35} />
            {open && <Core r={R * 0.5} colors={colors} />}
            {half(-1)}
            {half(1)}
            {!open && <line x1={0} y1={-ry + 2} x2={0} y2={ry - 2} stroke={colors.secondary} strokeWidth={1.2} strokeOpacity={0.6} className={P} style={anim('gfx-pulse', 2.2, 0, {}, 'ease-in-out')} />}
        </g>
    );
}

/** Heartwood: a gnarled burl with roots in the ground; it cracks open to show the core. */
function WoodHeart({ R, colors, open }: { R: number; colors: FxColors; open: boolean }) {
    const blob: Pt[] = Array.from({ length: 11 }, (_, k) => {
        const a = (k / 11) * Math.PI * 2;
        const r = R * (1 + 0.12 * Math.sin(k * 2.3) + 0.06 * Math.cos(k * 5.1));
        return [Math.cos(a) * r, Math.sin(a) * r];
    });
    const outline = smooth([...blob, blob[0], blob[1]]);
    const roots = [20, 95, 160, 230, 300].map((deg) => {
        const a = (deg * Math.PI) / 180;
        const c = Math.cos(a);
        const s = Math.sin(a);
        return `M${c * R * 0.9} ${s * R * 0.9} Q${c * R * 1.5 + s * 5} ${s * R * 1.5 - c * 5} ${c * R * 1.9} ${s * R * 1.9}`;
    });
    const bark = barkOf(colors);
    return (
        <g>
            <ellipse cy={R * 0.55} rx={R * 1.15} ry={R * 0.45} fill="#000000" opacity={0.35} />
            {roots.map((d, i) => (
                <path key={i} d={d} fill="none" stroke={bark} strokeWidth={3.5} strokeLinecap="round" />
            ))}
            <path d={outline} fill={bark} stroke={mix(bark, '#000000', 0.5)} strokeWidth={2} />
            <path d={outline} fill="none" stroke={colors.primary} strokeWidth={3} transform="scale(0.72)" opacity={0.8} />
            <path d={outline} fill="none" stroke={mix(bark, '#000000', 0.4)} strokeWidth={1} transform="scale(0.48)" />
            {open ? (
                <g>
                    {[10, 80, 150, 215, 290].map((deg) => (
                        <path key={deg} transform={`rotate(${deg})`} d={`M0 ${-R * 0.4} l2 ${-R * 0.2} l-3 ${-R * 0.18} l2 ${-R * 0.2}`} fill="none" stroke={colors.secondary} strokeWidth={1.4} strokeLinecap="round" />
                    ))}
                    <Core r={R * 0.42} colors={colors} />
                </g>
            ) : (
                <circle r={R * 0.16} fill={mix(bark, '#000000', 0.5)} />
            )}
        </g>
    );
}

function Heart({ x, y, R = 18, style, colors, open, uid }: { x: number; y: number; R?: number; style: HeartStyle; colors: FxColors; open: boolean; uid: string }) {
    return (
        <g transform={`translate(${x} ${y})`}>
            {style === 'rose' && <RoseHeart R={R} colors={colors} open={open} />}
            {style === 'pod' && <PodHeart R={R} colors={colors} open={open} uid={uid} />}
            {style === 'wood' && <WoodHeart R={R} colors={colors} open={open} />}
        </g>
    );
}

// ---------------------------------------------------------------------------
// Knots (branch nodes) and Buds (tip nodes)
// ---------------------------------------------------------------------------

/** A Knot: a node with children. Husked, it wears a thick plated ring; bare, its core shows. */
function Knot({ x, y, r = 10, colors, husked, kind }: { x: number; y: number; r?: number; colors: FxColors; husked: boolean; kind?: NodeKind }) {
    return (
        <g transform={`translate(${x} ${y})`}>
            <circle r={r + 3} fill="#000000" opacity={0.3} cy={2} />
            {husked ? (
                <g>
                    <circle r={r} fill={fleshOf(colors)} />
                    {kind && <KindGlyph kind={kind} r={r * 0.7} colors={colors} />}
                    <circle r={r + 1.5} fill="none" stroke={barkOf(colors)} strokeWidth={5} />
                    <circle r={r + 1.5} fill="none" stroke={mix(barkOf(colors), '#000000', 0.5)} strokeWidth={5} strokeDasharray="1.2 4.5" />
                    <circle r={r + 4} fill="none" stroke={mix(barkOf(colors), '#000000', 0.5)} strokeWidth={0.8} />
                </g>
            ) : (
                <g>
                    <circle r={r + 2} fill="none" stroke={colors.secondary} strokeOpacity={0.35} strokeWidth={2} />
                    <circle r={r} fill={fleshOf(colors)} stroke={colors.shade} strokeWidth={1.2} />
                    {kind ? <KindGlyph kind={kind} r={r * 0.7} colors={colors} /> : <Core r={r * 0.5} colors={colors} />}
                </g>
            )}
        </g>
    );
}

function Sepals({ r, colors }: { r: number; colors: FxColors }) {
    return (
        <g>
            <ellipse transform={`rotate(40) translate(0 ${r * 0.9})`} rx={r * 0.35} ry={r * 0.7} fill={colors.primary} stroke={colors.shade} strokeWidth={0.8} />
            <ellipse transform={`rotate(-40) translate(0 ${r * 0.9})`} rx={r * 0.35} ry={r * 0.7} fill={colors.primary} stroke={colors.shade} strokeWidth={0.8} />
        </g>
    );
}

/** The mark inside a node that says what it does. */
function KindGlyph({ kind, r, colors }: { kind: NodeKind; r: number; colors: FxColors }) {
    const bark = barkOf(colors);
    switch (kind) {
        case 'shooter':
            return (
                <g>
                    {[-35, 0, 35].map((a) => (
                        <path key={a} transform={`rotate(${a})`} d={`M-${r * 0.25} ${-r * 0.5} L0 ${-r * 1.35} L${r * 0.25} ${-r * 0.5} Z`} fill={mix(bark, '#ffffff', 0.25)} stroke={mix(bark, '#000000', 0.4)} strokeWidth={0.5} />
                    ))}
                    <circle r={r * 0.45} fill={colors.shade} />
                    <circle r={r * 0.2} fill={colors.secondary} />
                </g>
            );
        case 'mortar':
            return (
                <g>
                    <circle r={r * 0.75} fill={colors.secondary} opacity={0.85} />
                    <ellipse rx={r * 0.32} ry={r * 0.42} fill={colors.shade} />
                    <circle cx={-r * 0.1} cy={-r * 0.15} r={r * 0.12} fill={colors.light} />
                </g>
            );
        case 'bloom':
            return (
                <g>
                    {Array.from({ length: 6 }, (_, k) => (
                        <ellipse key={k} transform={`rotate(${k * 60}) translate(0 ${-r * 0.65})`} rx={r * 0.38} ry={r * 0.6} fill={colors.secondary} stroke={mix(colors.secondary, '#000000', 0.35)} strokeWidth={0.5} />
                    ))}
                    <circle r={r * 0.38} fill={colors.light} />
                </g>
            );
        case 'hive':
            return (
                <g>
                    <ellipse rx={r * 0.85} ry={r * 0.7} fill={mix(bark, colors.primary, 0.4)} stroke={mix(bark, '#000000', 0.4)} strokeWidth={0.6} />
                    {[[-0.35, -0.15], [0.3, -0.25], [0.05, 0.3]].map(([dx, dy], i) => (
                        <circle key={i} cx={dx * r} cy={dy * r} r={r * 0.17} fill="#0b0b0b" />
                    ))}
                </g>
            );
        case 'creeper':
            return <path d={`M0 0 m${r * 0.1} 0 a${r * 0.18} ${r * 0.18} 0 1 1 ${-r * 0.3} ${-r * 0.15} a${r * 0.45} ${r * 0.45} 0 1 1 ${r * 0.75} ${r * 0.35} a${r * 0.7} ${r * 0.7} 0 0 1 ${-r * 1.15} ${r * 0.5}`} fill="none" stroke={colors.light} strokeWidth={1.4} strokeLinecap="round" />;
    }
}

/** A Bud: a tip node, no husk, always open to damage. */
function Bud({ x = 0, y = 0, r = 8, colors, kind = 'shooter' }: { x?: number; y?: number; r?: number; colors: FxColors; kind?: NodeKind }) {
    return (
        <g transform={`translate(${x} ${y})`}>
            <circle r={r + 2} fill="#000000" opacity={0.3} cy={2} />
            {kind !== 'bloom' && <Sepals r={r} colors={colors} />}
            {kind === 'bloom' ? (
                <g>
                    {[0, 72, 144, 216, 288].map((a) => (
                        <path key={a} transform={`rotate(${a})`} d={`M0 ${r * 0.6} q-2 ${r * 0.5} 0 ${r * 0.9}`} fill="none" stroke={barkOf(colors)} strokeWidth={1} />
                    ))}
                    <KindGlyph kind="bloom" r={r * 1.05} colors={colors} />
                </g>
            ) : (
                <g>
                    <circle r={r} fill={fleshOf(colors)} stroke={colors.shade} strokeWidth={1.2} />
                    <KindGlyph kind={kind} r={r * 0.8} colors={colors} />
                </g>
            )}
        </g>
    );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/** One look option for the garden boss. `chosen` marks the option the plan settled on. */
export interface GardenHeartPaletteOption {
    name: string;
    primary: string;
    secondary: string;
    primaryLabel: string;
    secondaryLabel: string;
    /** The mood, then the honest risk. */
    note: string;
    chosen?: boolean;
}

/**
 * Every palette the artbook offered (plan 0006, "The look"). The plan keeps only the chosen one; the
 * Storybook's Garden Heart entry shows them all.
 */
export const GARDEN_HEART_PALETTES: readonly GardenHeartPaletteOption[] = [
    { name: "Queen's Garden", primary: '#166534', primaryLabel: 'Hedge', secondary: '#f9a8d4', secondaryLabel: 'Rose', note: "A tended royal garden turned on the party. Risk: green sits near Command's pine and its Bramble Patch." },
    { name: 'Blighted Garden', primary: '#3b1f4a', primaryLabel: 'Bruise', secondary: '#bef264', secondaryLabel: 'Sick lime', note: "The garden after the Darkness got into it. Risk: lime is close to Command's secondary; dark Husks vanish unlit." },
    { name: 'Bramble Rose', primary: '#4c0519', primaryLabel: 'Old wine', secondary: '#fb7185', secondaryLabel: 'Rose red', note: "All thorns and blood-red roses. Risk: next to Blood Mage, and red is every telegraph's colour." },
    { name: 'Conservatory', primary: '#3f6212', primaryLabel: 'Olive', secondary: '#fde047', secondaryLabel: 'Pollen', note: 'A sunlit greenhouse. Risk: gold is near Light, and olive on grass is the weakest silhouette.' },
    { name: 'Nightbloom', primary: '#134e4a', primaryLabel: 'Deep teal', secondary: '#e9d5ff', secondaryLabel: 'Lilac', note: "Night flowers that glow in the dark garden. Risk: teal near Command's Aurora, lilac near the Court Magician's orchid.", chosen: true },
];

export interface GardenHeartStyleOption {
    id: HeartStyle;
    name: string;
    note: string;
    chosen?: boolean;
}

/** The three ways the artbook drew the Heart. */
export const GARDEN_HEART_STYLES: readonly GardenHeartStyleOption[] = [
    { id: 'rose', name: 'A · Rosebud', note: 'Petal plates close into a bud and splay open around the core.' },
    { id: 'pod', name: 'B · Seed pod', note: 'A plated husk with a glowing seam that splits in two.', chosen: true },
    { id: 'wood', name: 'C · Heartwood', note: 'A gnarled burl with roots in the ground that cracks open.' },
];

/** The Heart style every other garden piece is drawn with. */
export const CHOSEN_HEART_STYLE: HeartStyle = GARDEN_HEART_STYLES.find((s) => s.chosen)?.id ?? 'pod';

const HEART_STYLES = GARDEN_HEART_STYLES;

/** One Heart style, husk closed and open. */
function singleHeartArt(style: HeartStyle) {
    return function SingleHeartArt({ colors, background }: FxArtProps) {
        const uid = uidOf(useId());
        return (
            <g>
                <Ground w={140} h={96} background={background} />
                <Heart x={38} y={46} style={style} colors={colors} open={false} uid={`${uid}c`} />
                <Heart x={102} y={46} style={style} colors={colors} open uid={`${uid}o`} />
                <Label x={38} y={88} fill={GRAY_TEXT}>husked</Label>
                <Label x={102} y={88} fill={GRAY_TEXT}>open</Label>
            </g>
        );
    };
}

function HeartOptionsArt({ colors, background }: FxArtProps) {
    const uid = uidOf(useId());
    return (
        <g>
            <Ground w={330} h={176} background={background} />
            {HEART_STYLES.map((s, i) => {
                const x = 55 + i * 110;
                return (
                    <g key={s.id}>
                        <Heart x={x} y={52} style={s.id} colors={colors} open={false} uid={`${uid}a${i}`} />
                        <Heart x={x} y={124} style={s.id} colors={colors} open uid={`${uid}b${i}`} />
                        <Label x={x} y={170}>{s.name}</Label>
                    </g>
                );
            })}
            <Label x={4} y={12} anchor="start" fill={GRAY_TEXT}>Husk closed (has children)</Label>
            <Label x={4} y={90} anchor="start" fill={GRAY_TEXT}>Husk open (no children: vulnerable)</Label>
        </g>
    );
}

/** The opening: one Bud on one Stem. Kill the Bud and the Heart opens. */
function OpeningArt({ colors, background }: FxArtProps) {
    const uid = uidOf(useId());
    const stem: Pt[] = [
        [70, 92],
        [100, 70],
        [134, 84],
        [160, 118],
        [196, 124],
        [222, 98],
        [246, 70],
    ];
    return (
        <g>
            <Ground w={300} h={170} background={background} />
            <LiveStem pts={stem} colors={colors} amp={5} tip={<Bud colors={colors} kind="shooter" />} />
            <Heart x={62} y={96} style={CHOSEN_HEART_STYLE} colors={colors} open={false} uid={uid} />
            <Hero x={210} y={150} />
            <Hero x={238} y={140} tint="#34d399" />
            <Hero x={262} y={152} tint="#fbbf24" />
            <Label x={150} y={14}>Phase 1: the Heart, one Stem, one Bud</Label>
            <Label x={150} y={26} fill={GRAY_TEXT}>The Stem sways and blocks movement; the Bud drags it as it moves</Label>
        </g>
    );
}

/** The husk's damage cut: -10 per hit, shown in small grey text that drifts slowly. */
function HuskDamageArt({ colors, background }: FxArtProps) {
    const dur = 2.6;
    const slash = (x: number, y: number) => (
        <path d={`M${x - 16} ${y + 12} L${x + 14} ${y - 14}`} pathLength={100} stroke="#e5e7eb" strokeWidth={2} strokeLinecap="round" strokeDasharray="100" style={{ ...anim('gfx-slash', dur, 0, {}, 'ease-out'), opacity: 0 }} />
    );
    return (
        <g>
            <Ground w={260} h={130} background={background} />
            <Knot x={70} y={78} r={13} colors={colors} husked />
            {slash(70, 78)}
            <text x={86} y={64} fontSize={8} fontWeight={600} fill={GRAY_TEXT} fontFamily={FONT} stroke="#050508" strokeWidth={0.6} style={{ ...anim('gfx-dmg-dull', dur, 0.05, {}, 'ease-out'), opacity: 0 }}>
                4
            </text>
            <Knot x={190} y={78} r={13} colors={colors} husked={false} />
            {slash(190, 78)}
            <text x={206} y={64} fontSize={15} fontWeight={800} fill="#ffffff" fontFamily={FONT} stroke="#050508" strokeWidth={1} className={P} style={{ ...anim('gfx-dmg-big', dur, 0.05, {}, 'ease-out'), opacity: 0 }}>
                14
            </text>
            <Label x={70} y={20}>Husked: a 14-damage hit lands as 4</Label>
            <Label x={70} y={120} fill={GRAY_TEXT}>small, grey, slow: "not working"</Label>
            <Label x={190} y={20}>Bare: full damage</Label>
            <Label x={190} y={120} fill={GRAY_TEXT}>the normal damage number</Label>
        </g>
    );
}

/** Bud dies, its Stem stills into Briar, the parent opens; then the Briar is cut into Tangle. */
function SeverArt({ colors, background }: FxArtProps) {
    const uid = uidOf(useId());
    const stem: Pt[] = [
        [34, 70],
        [58, 52],
        [86, 64],
        [104, 92],
        [128, 90],
    ];
    const briarTiles = tilesAlong(stem, 0.22);
    const panel = (ox: number, stage: 0 | 1 | 2) => (
        <g transform={`translate(${ox} 0)`}>
            <Ground w={150} h={140} background={background} />
            {stage === 2 &&
                briarTiles.map(([x, y], i) => (
                    <g key={i}>
                        <rect x={x - T / 2} y={y - T / 2} width={T} height={T} fill={mix(colors.primary, '#0b0f0a', 0.45)} opacity={0.9} />
                        {[0, 1, 2].map((k) => (
                            <path key={k} d={`M${x - 5 + k * 4} ${y + 4} q2 -5 ${-1 + k} -9`} fill="none" stroke={mix(colors.primary, colors.secondary, 0.25)} strokeWidth={1.2} />
                        ))}
                    </g>
                ))}
            {stage === 0 && <LiveStem pts={stem} colors={colors} amp={3} />}
            {stage === 1 && (
                <g>
                    {briarTiles.map(([x, y], i) => (
                        <rect key={i} x={x - T / 2} y={y - T / 2} width={T} height={T} fill="none" stroke="#f59e0b" strokeOpacity={0.6} strokeDasharray="2 2" strokeWidth={0.8} />
                    ))}
                    <StemStrokes d={smooth(stem)} colors={colors} dead width={6} />
                </g>
            )}
            <Heart x={30} y={74} R={15} style={CHOSEN_HEART_STYLE} colors={colors} open={stage > 0} uid={`${uid}${stage}`} />
            {stage === 0 && (
                <g transform="translate(128 90)">
                    <Bud colors={colors} />
                    <circle r={12} fill={colors.light} className={P} style={{ ...anim('gfx-flash', 2.4, 0, {}, 'ease-out'), opacity: 0 }} />
                    <path d="M-9 -9 L9 9 M9 -9 L-9 9" stroke={RED} strokeWidth={2} strokeLinecap="round" />
                </g>
            )}
            {stage === 2 && <Hero x={98} y={86} />}
            <Label x={75} y={14}>{['1 · Bud destroyed', '2 · Stem stills into Briar', '3 · Briar cut down: Tangle'][stage]}</Label>
            <Label x={75} y={128} fill={GRAY_TEXT}>
                {['the Heart is still husked', 'Briar blocks movement; Heart opens', 'very slow ground, stops shots'][stage]}
            </Label>
        </g>
    );
    return (
        <g>
            {panel(0, 0)}
            {panel(156, 1)}
            {panel(312, 2)}
            <path d="M151 64 L155 67 L151 70 Z" fill="#94a3b8" />
            <path d="M307 64 L311 67 L307 70 Z" fill="#94a3b8" />
        </g>
    );
}

/** Tangle: slow ground that soaks up projectiles; a few hits wear it down to Grass. */
function TangleArt({ colors, background }: FxArtProps) {
    const stage = (ox: number, hits: number, label: string, sub: string) => {
        const density = 3 - hits;
        return (
            <g transform={`translate(${ox} 0)`}>
                <Ground w={124} h={130} background={background} grid={false} />
                {Array.from({ length: 3 }, (_, row) =>
                    Array.from({ length: 3 }, (_, col) => {
                        const x = 41 + col * T;
                        const y = 46 + row * T;
                        return (
                            <g key={`${row}${col}`}>
                                <rect x={x - T / 2} y={y - T / 2} width={T} height={T} fill={density > 0 ? mix(colors.primary, '#0b0f0a', 0.45) : '#3f7f3a'} opacity={0.9} />
                                {Array.from({ length: density > 0 ? density + 1 : 2 }, (_, k) => (
                                    <path key={k} d={`M${x - 5 + k * 3.5} ${y + 5} q2 -5 ${-1 + k} -${density > 0 ? 10 : 5}`} fill="none" stroke={density > 0 ? mix(colors.primary, colors.secondary, 0.25) : '#6fbf5a'} strokeWidth={density > 0 ? 1.3 : 0.9} />
                                ))}
                            </g>
                        );
                    }),
                )}
                {density > 0 && (
                    <g>
                        <path d="M10 60 L32 60" stroke={colors.light} strokeWidth={1.6} strokeLinecap="round" />
                        <circle cx={34} cy={60} r={4} fill={colors.light} className={P} style={{ ...anim('gfx-flash', 1.8, 0, {}, 'ease-out'), opacity: 0 }} />
                    </g>
                )}
                {density === 0 && <path d="M10 60 L110 60" stroke={colors.light} strokeWidth={1.6} strokeLinecap="round" strokeDasharray="6 5" />}
                {[0, 1, 2].map((k) => (
                    <circle key={k} cx={50 + k * 10} cy={98} r={3} fill={k < hits ? '#4b5563' : colors.secondary} stroke="#111827" strokeWidth={0.6} />
                ))}
                <Label x={62} y={16}>{label}</Label>
                <Label x={62} y={116} fill={GRAY_TEXT}>{sub}</Label>
            </g>
        );
    };
    return (
        <g>
            {stage(0, 0, 'Tangle', 'very slow; stops shots')}
            {stage(130, 2, 'Worn', 'two hits taken')}
            {stage(260, 3, 'Grass', 'third hit: plain grass')}
        </g>
    );
}

/** The retreat: the husk closes, the Heart sinks into the ground, burrows, and comes up elsewhere. */
function retreatArt(style: HeartStyle) {
    return function RetreatArt({ colors, background }: FxArtProps) {
        const uid = uidOf(useId());
        const R = 18;
        const dur = 7;
        const L = { x: 60, y: 76 };
        const Rp = { x: 230, y: 76 };
        const groundY = L.y + R * 0.95;
        const sink = `${R * 1.9}px`;
        const site = (p: { x: number; y: number }, side: 'l' | 'r') => {
            const origin: CSSProperties = { transformBox: 'view-box', transformOrigin: `${p.x}px ${groundY}px`, ['--sink' as string]: sink };
            return (
                <g>
                    <ellipse cx={p.x} cy={groundY} rx={R * 1.15} ry={R * 0.32} fill="#000000" opacity={0.55} />
                    <g clipPath={`url(#${uid}-clip)`}>
                        <g style={{ ...anim(side === 'l' ? 'gfx-sink' : 'gfx-rise', dur, 0, origin, 'ease-in-out'), opacity: side === 'l' ? 1 : 0 }}>
                            <g style={anim(side === 'l' ? 'gfx-l-open' : 'gfx-r-open', dur, 0)}>
                                <Heart x={p.x} y={p.y} R={R} style={style} colors={colors} open uid={`${uid}${side}o`} />
                            </g>
                            <g style={anim(side === 'l' ? 'gfx-l-closed' : 'gfx-r-closed', dur, 0)}>
                                <Heart x={p.x} y={p.y} R={R} style={style} colors={colors} open={false} uid={`${uid}${side}c`} />
                            </g>
                        </g>
                    </g>
                    <path d={`M${p.x - R * 1.2} ${groundY} Q${p.x} ${groundY + R * 0.5} ${p.x + R * 1.2} ${groundY}`} fill="none" stroke={mix(ART_BACKGROUNDS[background], '#8b6914', 0.45)} strokeWidth={3} strokeLinecap="round" />
                </g>
            );
        };
        return (
            <g>
                <Ground w={290} h={150} background={background} />
                <defs>
                    <clipPath id={`${uid}-clip`}>
                        <rect x={0} y={0} width={290} height={groundY + 0.5} />
                    </clipPath>
                </defs>
                {site(L, 'l')}
                {site(Rp, 'r')}
                {[0, 1, 2, 3].map((k) => (
                    <ellipse key={k} cx={L.x + 26 + k * 6} cy={groundY + 6 + (k % 2) * 3} rx={4} ry={2} fill={mix(ART_BACKGROUNDS[background], '#8b6914', 0.5)} style={{ ...anim('gfx-burrow', dur, -k * 0.08, { ['--dx' as string]: `${Rp.x - L.x - 60}px` }, 'ease-in-out'), opacity: 0 }} />
                ))}
                <path d={`M${Rp.x + 14} ${Rp.y - 8} Q${Rp.x + 30} ${Rp.y - 30} ${Rp.x + 46} ${Rp.y - 24}`} pathLength={100} fill="none" stroke={colors.primary} strokeWidth={4} strokeDasharray="100 101" style={anim('gfx-sprout', dur, 0)} />
                <Label x={145} y={14}>Below a threshold: close, sink, resprout</Label>
                <Label x={L.x} y={140} fill={GRAY_TEXT}>shrinks into the ground</Label>
                <Label x={Rp.x} y={140} fill={GRAY_TEXT}>comes up with more nodes</Label>
            </g>
        );
    };
}

interface TreeNode {
    kind: 'knot' | 'bud';
    at: Pt;
    children?: TreeNode[];
}

function PhaseTree({ ox, title, sub, tree, colors, uid }: { ox: number; title: string; sub: string; tree: TreeNode[]; colors: FxColors; uid: string }) {
    const heart: Pt = [60, 74];
    const edges: { from: Pt; to: Pt }[] = [];
    const walk = (from: Pt, nodes: TreeNode[]) => {
        for (const n of nodes) {
            edges.push({ from, to: n.at });
            if (n.children) walk(n.at, n.children);
        }
    };
    walk(heart, tree);
    const flat: TreeNode[] = [];
    const collect = (nodes: TreeNode[]) => nodes.forEach((n) => (flat.push(n), n.children && collect(n.children)));
    collect(tree);
    return (
        <g transform={`translate(${ox} 0)`}>
            {edges.map((e, i) => {
                const mid: Pt = [(e.from[0] + e.to[0]) / 2 + (i % 2 ? 5 : -5), (e.from[1] + e.to[1]) / 2 + (i % 2 ? -4 : 4)];
                return <StemStrokes key={i} d={smooth([e.from, mid, e.to])} colors={colors} width={3} />;
            })}
            <Heart x={heart[0]} y={heart[1]} R={12} style={CHOSEN_HEART_STYLE} colors={colors} open={false} uid={uid} />
            {flat.map((n, i) => (n.kind === 'knot' ? <Knot key={i} x={n.at[0]} y={n.at[1]} r={7} colors={colors} husked /> : <Bud key={i} x={n.at[0]} y={n.at[1]} r={5.5} colors={colors} kind="shooter" />))}
            <Label x={60} y={14}>{title}</Label>
            <Label x={60} y={140} fill={GRAY_TEXT}>{sub}</Label>
        </g>
    );
}

function PhasesArt({ colors, background }: FxArtProps) {
    const uid = uidOf(useId());
    const b = (x: number, y: number): TreeNode => ({ kind: 'bud', at: [x, y] });
    const phases: { title: string; sub: string; tree: TreeNode[] }[] = [
        { title: 'Phase 1 · 100%', sub: '1 Bud (the tutorial)', tree: [b(98, 40)] },
        { title: 'Phase 2 · 75%', sub: '2 Buds', tree: [b(100, 44), b(96, 112)] },
        {
            title: 'Phase 3 · 50%',
            sub: '2 Knots, 1 Bud each',
            tree: [
                { kind: 'knot', at: [86, 42], children: [b(110, 28)] },
                { kind: 'knot', at: [86, 108], children: [b(110, 120)] },
            ],
        },
        {
            title: 'Phase 4 · 25%',
            sub: '2 Knots × 2 Buds, +2 Buds',
            tree: [
                { kind: 'knot', at: [84, 40], children: [b(108, 26), b(112, 54)] },
                { kind: 'knot', at: [84, 110], children: [b(108, 96), b(110, 124)] },
                b(24, 40),
                b(24, 110),
            ],
        },
    ];
    return (
        <g>
            {phases.map((p, i) => (
                <g key={i}>
                    <rect x={i * 124} y={0} width={120} height={148} fill={ART_BACKGROUNDS[background]} />
                    <PhaseTree ox={i * 124} title={p.title} sub={p.sub} tree={p.tree} colors={colors} uid={`${uid}${i}`} />
                </g>
            ))}
        </g>
    );
}

const KINDS: { kind: NodeKind; name: string; role: string }[] = [
    { kind: 'shooter', name: 'Thornspitter', role: 'thorn bursts' },
    { kind: 'mortar', name: 'Pod Mortar', role: 'seed bombs' },
    { kind: 'bloom', name: 'Mender Bloom', role: 'heals nodes' },
    { kind: 'hive', name: 'Hive Gourd', role: 'swarmlings, slimes' },
    { kind: 'creeper', name: 'Creeper', role: 'thorn runners' },
];

function NodeKitArt({ colors, background }: FxArtProps) {
    return (
        <g>
            <Ground w={360} h={96} background={background} grid={false} />
            {KINDS.map((k, i) => {
                const x = 36 + i * 72;
                return (
                    <g key={k.kind}>
                        <Bud x={x} y={40} r={13} colors={colors} kind={k.kind} />
                        <Label x={x} y={76}>{k.name}</Label>
                        <Label x={x} y={87} size={7} fill={GRAY_TEXT}>{k.role}</Label>
                    </g>
                );
            })}
        </g>
    );
}

/** Thornspitter: short bursts of slow thorns, fanned at a player. */
function ShooterArt({ colors, background }: FxArtProps) {
    const dur = 3.2;
    const origin = { x: 40, y: 70 };
    const fan = [-14, 0, 14];
    return (
        <g>
            <Ground w={230} h={130} background={background} />
            <Bud x={origin.x} y={origin.y} r={10} colors={colors} kind="shooter" />
            {[0, 1].map((wave) =>
                fan.map((deg, i) => (
                    <g key={`${wave}${i}`} transform={`translate(${origin.x} ${origin.y}) rotate(${deg})`}>
                        <g style={{ ...anim('gfx-fly', dur, wave * 0.35 + i * 0.08, { ['--len' as string]: '150px' }, 'linear'), opacity: 0 }}>
                            <path d="M14 -2.2 L24 0 L14 2.2 Z" fill={mix(barkOf(colors), '#ffffff', 0.3)} stroke={colors.shade} strokeWidth={0.6} />
                            <path d="M9 0 L14 0" stroke={colors.secondary} strokeWidth={1} strokeOpacity={0.6} />
                        </g>
                    </g>
                )),
            )}
            <Hero x={190} y={62} />
            <path d="M190 80 q10 8 22 4" fill="none" stroke="#94a3b8" strokeWidth={1} strokeDasharray="2 2" />
            <Label x={115} y={16}>Thornspitter</Label>
            <Label x={115} y={120} fill={GRAY_TEXT}>2 quick fans of 3 slow thorns; step between them</Label>
        </g>
    );
}

/** Pod Mortar: a seed lobbed into the ground grows for 5 s, flashes its blast for the last 1.5 s, and pops. */
function MortarArt({ colors, background }: FxArtProps) {
    const dur = 7;
    const from = { x: 36, y: 86 };
    const to = { x: 150, y: 70 };
    const blastR = 30;
    const lobVars = { ['--dx' as string]: `${to.x - from.x}px`, ['--dy' as string]: `${to.y - from.y}px`, ['--mx' as string]: `${(to.x - from.x) / 2}px`, ['--my' as string]: `${(to.y - from.y) / 2 - 34}px` };
    return (
        <g>
            <Ground w={230} h={130} background={background} />
            <Bud x={from.x} y={from.y} r={10} colors={colors} kind="mortar" />
            <circle cx={from.x} cy={from.y} r={3.5} fill={colors.shade} stroke={colors.secondary} strokeWidth={1} style={{ ...anim('gfx-lob', dur, 0, lobVars, 'ease-in-out'), opacity: 0 }} />
            <g style={{ ...anim('gfx-tele', dur), opacity: 0 }}>
                <circle cx={to.x} cy={to.y} r={blastR} fill={RED} fillOpacity={0.1} stroke={RED} strokeWidth={1.2} strokeDasharray="4 3" />
                <circle cx={to.x} cy={to.y} r={blastR} fill={RED} fillOpacity={0.25} className={P} style={anim('gfx-fill', dur)} />
            </g>
            <g className={P} style={{ ...anim('gfx-grow', dur), opacity: 0 }}>
                <ellipse cx={to.x} cy={to.y + 6} rx={11} ry={4} fill="#000000" opacity={0.4} />
                <path d={`M${to.x} ${to.y + 4} q-3 -6 0 -10`} fill="none" stroke={colors.primary} strokeWidth={2} />
                <circle cx={to.x} cy={to.y - 4} r={9} fill={fleshOf(colors)} stroke={colors.shade} strokeWidth={1.2} />
                <circle cx={to.x} cy={to.y - 4} r={5} fill={colors.secondary} className={P} style={anim('gfx-pulse', 0.7, 0, {}, 'ease-in-out')} />
            </g>
            <g className={P} style={{ ...anim('gfx-boom', dur, 0, {}, 'ease-out'), opacity: 0 }}>
                <circle cx={to.x} cy={to.y} r={blastR} fill={colors.secondary} opacity={0.55} />
                <circle cx={to.x} cy={to.y} r={blastR * 0.6} fill={colors.light} opacity={0.8} />
            </g>
            <Hero x={170} y={86} />
            <Label x={115} y={16}>Pod Mortar</Label>
            <Label x={115} y={120} fill={GRAY_TEXT}>grows 5 s; red for the last 1.5 s, then bursts</Label>
        </g>
    );
}

/** Mender Bloom: rooted, heals the nodes around it. */
function BloomArt({ colors, background }: FxArtProps) {
    const dur = 2.4;
    const bloom = { x: 54, y: 82 };
    const knot = { x: 168, y: 56 };
    return (
        <g>
            <Ground w={230} h={130} background={background} />
            <line x1={bloom.x} y1={bloom.y} x2={knot.x} y2={knot.y} stroke={colors.secondary} strokeOpacity={0.4} strokeWidth={1} strokeDasharray="3 4" />
            <Knot x={knot.x} y={knot.y} r={11} colors={colors} husked kind="shooter" />
            <Bud x={bloom.x} y={bloom.y} r={12} colors={colors} kind="bloom" />
            {[0, 1, 2, 3].map((k) => (
                <circle key={k} cx={bloom.x} cy={bloom.y} r={2.2} fill={colors.light} style={{ ...anim('gfx-drift', dur, -k * (dur / 4), { ['--dx' as string]: `${knot.x - bloom.x}px`, ['--dy' as string]: `${knot.y - bloom.y}px` }, 'ease-in'), opacity: 0 }} />
            ))}
            <text x={knot.x + 14} y={knot.y - 10} fontSize={10} fontWeight={700} fill="#4ade80" fontFamily={FONT} stroke="#050508" strokeWidth={0.6} style={{ ...anim('gfx-dmg-dull', dur, 0), opacity: 0 }}>
                +3
            </text>
            <Label x={115} y={16}>Mender Bloom</Label>
            <Label x={115} y={120} fill={GRAY_TEXT}>rooted, never a parent; heals nearby nodes</Label>
        </g>
    );
}

/** Hive Gourd: pops out swarmlings and slimes. */
function HiveArt({ colors, background }: FxArtProps) {
    const dur = 3;
    const hive = { x: 60, y: 70 };
    const out: { dx: number; dy: number; slime?: boolean }[] = [
        { dx: 90, dy: -30 },
        { dx: 110, dy: 8 },
        { dx: 80, dy: 36 },
        { dx: 70, dy: -4, slime: true },
    ];
    return (
        <g>
            <Ground w={230} h={130} background={background} />
            <g className={P} style={anim('gfx-pulse', 1, 0, {}, 'ease-in-out')}>
                <Bud x={hive.x} y={hive.y} r={14} colors={colors} kind="hive" />
            </g>
            {out.map((o, i) => (
                <g key={i} transform={`translate(${hive.x} ${hive.y})`}>
                    <g style={{ ...anim('gfx-drift', dur, i * 0.55, { ['--dx' as string]: `${o.dx}px`, ['--dy' as string]: `${o.dy}px` }, 'ease-out'), opacity: 0 }}>
                        {o.slime ? (
                            <path d="M-7 3 Q-7 -6 0 -6 Q7 -6 7 3 Z" fill="#6b7280" stroke="#1f2937" strokeWidth={1} />
                        ) : (
                            <g>
                                <circle r={3.5} fill="#4b5563" stroke="#111827" strokeWidth={0.8} />
                                <path d="M-3 -1 L-6 -3 M-3 1 L-6 3 M3 -1 L6 -3 M3 1 L6 3" stroke="#111827" strokeWidth={0.8} />
                            </g>
                        )}
                    </g>
                </g>
            ))}
            <Label x={115} y={16}>Hive Gourd</Label>
            <Label x={115} y={120} fill={GRAY_TEXT}>swarmlings (small) and a slime (large)</Label>
        </g>
    );
}

/** Creeper: a slow runner vine that lays dark thorns as it goes, then pulls back. */
function CreeperArt({ colors, background }: FxArtProps) {
    const dur = 6;
    const pts: Pt[] = [
        [36, 72],
        [64, 58],
        [94, 70],
        [122, 90],
        [152, 82],
        [182, 62],
        [206, 66],
    ];
    const d = smooth(pts);
    const at = (f: number): Pt => {
        const idx = f * (pts.length - 1);
        const i = Math.min(pts.length - 2, Math.floor(idx));
        const t = idx - i;
        return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t];
    };
    return (
        <g>
            <Ground w={240} h={130} background={background} />
            {CREEP_PATCHES.map((f, i) => {
                const [x, y] = at(f);
                const cx = x;
                const cy = y;
                return (
                    <g key={i} className={P} style={{ ...anim(`gfx-patch-${i}`, dur), opacity: 0 }}>
                        <rect x={cx - T} y={cy - T / 2} width={T * 2} height={T} fill="#1a1022" opacity={0.9} />
                        {[0, 1, 2, 3, 4].map((k) => (
                            <path key={k} d={`M${cx - T + 3 + k * 5.5} ${cy + 4} l1.5 -7 l1.5 7`} fill={mix(colors.primary, '#3b0764', 0.5)} />
                        ))}
                    </g>
                );
            })}
            <path d={d} pathLength={100} fill="none" stroke={colors.shade} strokeWidth={6} strokeLinecap="round" strokeDasharray="100 101" style={anim('gfx-creep', dur, 0, {}, 'ease-in-out')} />
            <path d={d} pathLength={100} fill="none" stroke={colors.primary} strokeWidth={3.5} strokeLinecap="round" strokeDasharray="100 101" style={anim('gfx-creep', dur, 0, {}, 'ease-in-out')} />
            <Bud x={pts[0][0]} y={pts[0][1]} r={10} colors={colors} kind="creeper" />
            <Label x={120} y={16}>Creeper</Label>
            <Label x={120} y={120} fill={GRAY_TEXT}>crawls ~5 tiles laying dark thorns, then retracts</Label>
        </g>
    );
}

export const GARDEN_HEART_ART: FxArtPiece[] = [
    { id: 'gh-hearts', label: 'The Heart', caption: 'three looks, husk closed and open', size: [330, 176], displayWidth: 330, Render: HeartOptionsArt },
    { id: 'gh-heart-rose', label: 'Rosebud', caption: 'husk closed and open', size: [140, 96], displayWidth: 168, Render: singleHeartArt('rose') },
    { id: 'gh-heart-pod', label: 'Seed pod', caption: 'husk closed and open', size: [140, 96], displayWidth: 168, Render: singleHeartArt('pod') },
    { id: 'gh-heart-wood', label: 'Heartwood', caption: 'husk closed and open', size: [140, 96], displayWidth: 168, Render: singleHeartArt('wood') },
    { id: 'gh-opening', label: 'Phase 1', caption: 'one living Stem and its Bud', size: [300, 170], displayWidth: 300, Render: OpeningArt },
    { id: 'gh-husk', label: 'The Husk', caption: '-10 per hit while a node has children', size: [260, 130], displayWidth: 260, Render: HuskDamageArt },
    { id: 'gh-sever', label: 'Severing a Bud', caption: 'Stem to Briar to Tangle', size: [462, 140], displayWidth: 462, Render: SeverArt },
    { id: 'gh-tangle', label: 'Tangle', caption: 'projectile hits wear it down to Grass', size: [384, 130], displayWidth: 384, Render: TangleArt },
    { id: 'gh-retreat-rose', label: 'Retreat (Rosebud)', caption: 'close, sink, resprout', size: [290, 150], displayWidth: 290, Render: retreatArt('rose') },
    { id: 'gh-retreat-pod', label: 'Retreat (Seed pod)', caption: 'close, sink, resprout', size: [290, 150], displayWidth: 290, Render: retreatArt('pod') },
    { id: 'gh-retreat-wood', label: 'Retreat (Heartwood)', caption: 'close, sink, resprout', size: [290, 150], displayWidth: 290, Render: retreatArt('wood') },
    { id: 'gh-phases', label: 'The four phases', caption: 'what sprouts at each threshold', size: [492, 148], displayWidth: 492, Render: PhasesArt },
    { id: 'gh-kit', label: 'Node kinds', caption: 'the five behaviours a node can have', size: [360, 96], displayWidth: 360, Render: NodeKitArt },
    { id: 'gh-shooter', label: 'Thornspitter', caption: 'the Shooter', size: [230, 130], displayWidth: 230, Render: ShooterArt },
    { id: 'gh-mortar', label: 'Pod Mortar', caption: 'the Bulb Launcher', size: [230, 130], displayWidth: 230, Render: MortarArt },
    { id: 'gh-bloom', label: 'Mender Bloom', caption: 'the Flower', size: [230, 130], displayWidth: 230, Render: BloomArt },
    { id: 'gh-hive', label: 'Hive Gourd', caption: 'the Nest', size: [230, 130], displayWidth: 230, Render: HiveArt },
    { id: 'gh-creeper', label: 'Creeper', caption: 'the Runner', size: [240, 130], displayWidth: 240, Render: CreeperArt },
];
