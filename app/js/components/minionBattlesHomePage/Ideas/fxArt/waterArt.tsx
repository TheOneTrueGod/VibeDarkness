/**
 * Concept art for the Water tree (plan `docs/ideas/plans/0005_2026-11-11_water-tree.md`): the wavy Water
 * resource bar, the core icon, the three overlap cards' icons, the tile-drain mechanic and the three
 * ability effects. Everything is painted from the palette so the studio can recolour it. Concept previews
 * for the Ideas page, not the in-game Pixi painters.
 */
import { useId, type CSSProperties, type ReactNode } from 'react';
import { mix, type FxColors } from '../fxColors';
import { ART_BACKGROUNDS, type FxArtPiece, type FxArtProps } from './types';

const FONT = 'ui-sans-serif, system-ui, sans-serif';

const uidOf = (raw: string) => `w${raw.replace(/[^a-zA-Z0-9]/g, '')}`;

/** Animation delay that puts a loop's local 0% at `start` (0-1) of a `dur`-second cycle. */
const phase = (start: number, dur: number) => `${(start * dur - dur).toFixed(3)}s`;

const anim = (name: string, dur: number, start: number, extra: CSSProperties = {}, timing = 'linear'): CSSProperties => ({
    animation: `${name} ${dur}s ${timing} ${phase(start, dur)} infinite`,
    ...extra,
});

/** Class for elements that scale about their own centre. */
const P = 'wfx-p';

export const WATER_ART_CSS = [
    `.${P} { transform-box: fill-box; transform-origin: center; }`,
    '@keyframes wfx-wave { from { transform: translateY(calc(var(--p) * -1)); } to { transform: translateY(0px); } }',
    '@keyframes wfx-bubble { 0% { transform: translateY(0px); opacity: 0; } 15% { opacity: 0.9; } 85% { opacity: 0.7; } 100% { transform: translateY(-12px); opacity: 0; } }',
    '@keyframes wfx-caustic { to { stroke-dashoffset: -32; } }',
    '@keyframes wfx-slash { 0% { stroke-dashoffset: 100; opacity: 1; } 6% { stroke-dashoffset: 0; opacity: 1; } 25% { stroke-dashoffset: 0; opacity: 0; } 100% { stroke-dashoffset: 0; opacity: 0; } }',
    '@keyframes wfx-flash { 0% { opacity: 0; transform: scale(0.6); } 3% { opacity: 0.95; transform: scale(1.15); } 14% { opacity: 0; transform: scale(1.6); } 100% { opacity: 0; transform: scale(1.6); } }',
    '@keyframes wfx-chip { 0% { opacity: 0; transform: translate(0px, 0px) rotate(0deg) scale(0.4); } 2% { opacity: 1; transform: translate(0px, 0px) rotate(0deg) scale(1); } 16% { opacity: 0; transform: translate(var(--dx), var(--dy)) rotate(var(--rot)) scale(0.5); } 100% { opacity: 0; transform: translate(var(--dx), var(--dy)) rotate(var(--rot)) scale(0.5); } }',
    '@keyframes wfx-fly { 0% { opacity: 0; transform: translateX(0px); } 1.5% { opacity: 1; } 25% { opacity: 1; transform: translateX(var(--len)); } 27% { opacity: 0; transform: translateX(var(--len)); } 100% { opacity: 0; transform: translateX(var(--len)); } }',
    '@keyframes wfx-fly-short { 0% { opacity: 0; transform: translateX(0px); } 1.5% { opacity: 1; } 18% { opacity: 1; transform: translateX(var(--len)); } 20% { opacity: 0; transform: translateX(var(--len)); } 100% { opacity: 0; transform: translateX(var(--len)); } }',
    '@keyframes wfx-ring-in { 0% { opacity: 0; transform: scale(0.4); } 6% { opacity: 1; transform: scale(1); } 18% { opacity: 1; transform: scale(1); } 26% { opacity: 0; transform: scale(1.1); } 100% { opacity: 0; transform: scale(1.1); } }',
    '@keyframes wfx-ff-mark { 0% { opacity: 0.95; } 70% { opacity: 0.95; } 76% { opacity: 0; } 100% { opacity: 0; } }',
    '@keyframes wfx-rise { 0% { opacity: 0; transform: translateY(6px) scaleY(0.15); } 3% { opacity: 1; transform: translateY(0px) scaleY(1.12); } 5% { opacity: 1; transform: translateY(0px) scaleY(1); } 64% { opacity: 1; transform: translateY(0px) scaleY(1); } 70% { opacity: 0; transform: translateY(0px) scaleY(1); } 100% { opacity: 0; transform: translateY(0px) scaleY(1); } }',
    '@keyframes wfx-ff-field { 0% { opacity: 0; transform: scale(0.96); } 1.5% { opacity: 0.95; transform: scale(1.03); } 3% { opacity: 0.95; transform: scale(1); } 64% { opacity: 0.95; transform: scale(1); } 72% { opacity: 0; transform: scale(1); } 100% { opacity: 0; transform: scale(1); } }',
    '@keyframes wfx-ff-pulse { 0% { opacity: 0.35; } 6% { opacity: 0; } 100% { opacity: 0; } }',
    '@keyframes wfx-drain { 0% { opacity: 0; transform: translate(0px, 0px) scale(1); } 12% { opacity: 1; } 88% { opacity: 1; transform: translate(var(--dx), var(--dy)) scale(0.6); } 100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(0.4); } }',
    '@keyframes wfx-drainring { from { stroke-dashoffset: 100; } to { stroke-dashoffset: 0; } }',
    '@keyframes wfx-levelup { 0%, 88% { opacity: 0; } 95%, 100% { opacity: 0.92; } }',
    '@keyframes wfx-ripple { 0% { opacity: 0.7; transform: scale(0.3); } 100% { opacity: 0; transform: scale(1.3); } }',
    '@keyframes wfx-float { 0% { opacity: 0; transform: translateY(0px); } 15% { opacity: 1; } 100% { opacity: 0; transform: translateY(-14px); } }',
].join('\n');

function Ground({ w, h, background }: { w: number; h: number; background: FxArtProps['background'] }) {
    return <rect width={w} height={h} fill={ART_BACKGROUNDS[background]} />;
}

/** Top-down caster facing up the page: dark body, hood pointing forward. */
function Mage({ x, y, colors }: { x: number; y: number; colors: FxColors }) {
    return (
        <g transform={`translate(${x} ${y})`}>
            <circle r={10} fill="#1c2430" stroke={colors.primary} strokeWidth={2} />
            <path d="M-7 4 L0 -12 L7 4 Q0 0 -7 4 Z" fill={colors.shade} stroke={colors.secondary} strokeWidth={0.8} />
            <circle cx={-2.4} cy={-1} r={0.9} fill={colors.light} />
            <circle cx={2.4} cy={-1} r={0.9} fill={colors.light} />
        </g>
    );
}

function Enemy({ x, y }: { x: number; y: number }) {
    return <circle cx={x} cy={y} r={8} fill="#6b7280" stroke="#374151" strokeWidth={1.5} />;
}

/** A frosty ring and fill that flashes over a unit when it is hit. */
function HitFlash({ x, y, at, dur, colors }: { x: number; y: number; at: number; dur: number; colors: FxColors }) {
    return (
        <circle className={P} cx={x} cy={y} r={9} fill={colors.light} fillOpacity={0.35} stroke={colors.light} strokeWidth={1.4} style={{ ...anim('wfx-flash', dur, at, {}, 'ease-out'), opacity: 0 }} />
    );
}

/** Ice chips bursting out of a point. */
function Chips({ x, y, at, dur, colors, n = 6, spread = 12, seed = 0 }: { x: number; y: number; at: number; dur: number; colors: FxColors; n?: number; spread?: number; seed?: number }) {
    return (
        <g transform={`translate(${x} ${y})`}>
            {Array.from({ length: n }, (_, i) => {
                const a = ((i + seed * 0.37) / n) * Math.PI * 2;
                const d = spread * (0.7 + ((i * 7 + seed) % 5) * 0.1);
                const style = {
                    '--dx': `${(Math.cos(a) * d).toFixed(1)}px`,
                    '--dy': `${(Math.sin(a) * d).toFixed(1)}px`,
                    '--rot': `${(i % 2 ? 1 : -1) * (120 + i * 30)}deg`,
                    ...anim('wfx-chip', dur, at, {}, 'ease-out'),
                    opacity: 0,
                } as CSSProperties;
                return <polygon key={i} className={P} points="0,-3 1.1,0 0,2.2 -1.1,0" fill={i % 2 ? colors.light : colors.secondary} style={style} />;
            })}
        </g>
    );
}

/** A zigzag line from (x0, y0) to (x1, y1): the icy edge of a claw. */
function jag(x0: number, y0: number, x1: number, y1: number, n: number, amp: number): string {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const px = -dy / len;
    const py = dx / len;
    const pts: string[] = [];
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        const o = i === 0 || i === n ? 0 : i % 2 ? amp : -amp;
        pts.push(`${(x0 + dx * t + px * o).toFixed(1)} ${(y0 + dy * t + py * o).toFixed(1)}`);
    }
    return `M${pts.join(' L')}`;
}

function Flake({ x, y, r, stroke, width = 1 }: { x: number; y: number; r: number; stroke: string; width?: number }) {
    return (
        <g transform={`translate(${x} ${y})`} stroke={stroke} strokeWidth={width} strokeLinecap="round" fill="none">
            {[0, 60, 120].map((a) => (
                <g key={a} transform={`rotate(${a})`}>
                    <line y1={-r} y2={r} />
                    <path d={`M${-r * 0.3} ${-r * 0.78} L0 ${-r * 0.5} L${r * 0.3} ${-r * 0.78} M${-r * 0.3} ${r * 0.78} L0 ${r * 0.5} L${r * 0.3} ${r * 0.78}`} />
                </g>
            ))}
        </g>
    );
}

// ---------------------------------------------------------------------------
// Water resource bar
// ---------------------------------------------------------------------------

export const WATER_MAX = 16;
const BAR_W = 160;
const BAR_H = 16;

/** Closed path filling everything left of a vertical sine edge at x = 0, tall enough to slide one period. */
function wavePath(amp: number, period: number): string {
    const pts: string[] = [];
    for (let y = -2 * period; y <= BAR_H + 2 * period; y += 1) {
        pts.push(`${(amp * Math.sin((2 * Math.PI * y) / period)).toFixed(2)} ${y}`);
    }
    return `M${-BAR_W - 10} ${-2 * period} L${pts.join(' L')} L${-BAR_W - 10} ${BAR_H + 2 * period} Z`;
}

const FRONT_WAVE = wavePath(2, 12);
const BACK_WAVE = wavePath(2.6, 17);
const CAUSTIC = `M0 3.5 ${Array.from({ length: 22 }, () => 't8 0').join(' ').replace('t8 0', 'q4 -1.4 8 0')}`;

/**
 * The bar as `ResourceBarRow` would draw it (160 x 16): the fill's leading edge is a moving water
 * surface (two sine layers sliding vertically), with a caustic glint and bubbles inside. Faint ticks
 * every 4 Water so costs of 3 and 4 read at a glance.
 */
function WaterBar({ x, y, value, colors, uid }: { x: number; y: number; value: number; colors: FxColors; uid: string }) {
    const fw = BAR_W * Math.min(1, value / WATER_MAX);
    const clip = `${uid}c`;
    const fill = `${uid}f`;
    const mask = `${uid}m`;
    const inner = `${uid}i`;
    return (
        <g transform={`translate(${x} ${y})`}>
            <defs>
                <clipPath id={clip}>
                    <rect width={BAR_W} height={BAR_H} rx={3} />
                </clipPath>
                <clipPath id={inner}>
                    <rect width={Math.max(0, fw - 3)} height={BAR_H} />
                </clipPath>
                <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors.light} />
                    <stop offset="30%" stopColor={colors.secondary} />
                    <stop offset="100%" stopColor={colors.primary} />
                </linearGradient>
                {/* The wave lives in a mask so the gradient stays still while the surface moves. */}
                <mask id={mask} maskUnits="userSpaceOnUse" x={0} y={0} width={BAR_W} height={BAR_H}>
                    <g transform={`translate(${fw} 0)`}>
                        <path d={FRONT_WAVE} fill="#fff" style={{ '--p': '12px', animation: 'wfx-wave 1.5s linear infinite reverse' } as CSSProperties} />
                    </g>
                </mask>
            </defs>
            <rect width={BAR_W} height={BAR_H} rx={3} fill="#262b36" />
            <g clipPath={`url(#${clip})`}>
                <g transform={`translate(${fw + 1.6} 0)`}>
                    <path d={BACK_WAVE} fill={colors.light} opacity={0.35} style={{ '--p': '17px', animation: 'wfx-wave 2.4s linear infinite' } as CSSProperties} />
                </g>
                <rect width={BAR_W} height={BAR_H} fill={`url(#${fill})`} mask={`url(#${mask})`} />
                <g clipPath={`url(#${inner})`}>
                    <path d={CAUSTIC} fill="none" stroke={colors.light} strokeWidth={0.8} strokeDasharray="10 6" opacity={0.55} style={{ animation: 'wfx-caustic 1.6s linear infinite' }} />
                    {[0.22, 0.55, 0.82].map((f, i) => (
                        <circle key={f} cx={fw * f} cy={BAR_H - 2} r={0.9} fill="none" stroke={colors.light} strokeWidth={0.5} style={{ animation: `wfx-bubble 1.8s ease-in ${-i * 0.6}s infinite`, opacity: 0 }} />
                    ))}
                </g>
                {[4, 8, 12].map((k) => (
                    <line key={k} x1={(BAR_W * k) / WATER_MAX} x2={(BAR_W * k) / WATER_MAX} y1={0} y2={BAR_H} stroke="#000" strokeOpacity={0.35} strokeWidth={0.8} />
                ))}
            </g>
            <rect width={BAR_W} height={BAR_H} rx={3} fill="none" stroke="#fff" strokeOpacity={0.1} />
        </g>
    );
}

/** The resource icon: a droplet (lucide `Droplet` stand-in) with the current value as a badge. */
function WaterIcon({ x, y, value, colors }: { x: number; y: number; value: number; colors: FxColors }) {
    return (
        <g transform={`translate(${x} ${y})`}>
            <path d="M0 -8 C0 -8 6 -1 6 3 A6 6 0 0 1 -6 3 C-6 -1 0 -8 0 -8 Z" fill={colors.secondary} stroke={colors.light} strokeWidth={0.8} />
            <path d="M-3 2 Q-3 -1 -1 -3.5" fill="none" stroke="#fff" strokeWidth={0.8} opacity={0.8} strokeLinecap="round" />
            <text x={5} y={10} fontSize={6.5} fontWeight={700} fill="#fff" stroke="#000" strokeWidth={1.6} paintOrder="stroke" fontFamily={FONT}>
                {Math.floor(value)}
            </text>
        </g>
    );
}

function WaterBarArt({ colors }: FxArtProps) {
    const uid = uidOf(useId());
    const rows = [3, 10.5, 16];
    return (
        <g fontFamily={FONT}>
            <rect width={240} height={142} fill="#14171f" />
            {/* Tooltip mock: the same three lines the in-game resource tooltip would show. */}
            <rect x={8} y={6} width={200} height={38} rx={3} fill="#000" stroke="#e5e7eb" strokeWidth={0.6} />
            <text x={13} y={16} fontSize={8} fill="#e5e7eb">Water</text>
            <text x={13} y={27} fontSize={7.5} fill="#e5e7eb">
                +<tspan fill={colors.secondary}>0.5</tspan>/s in or beside water
            </text>
            <text x={13} y={38} fontSize={7.5} fill="#9ca3af">Drains up to 4 nearby tiles · max 16</text>
            {rows.map((v, i) => {
                const y = 56 + i * 28;
                return (
                    <g key={v}>
                        <WaterIcon x={18} y={y + 8} value={v} colors={colors} />
                        <WaterBar x={36} y={y} value={v} colors={colors} uid={`${uid}r${i}`} />
                        <text x={202} y={y + 11} fontSize={8} fill="#9ca3af">{`${v} / ${WATER_MAX}`}</text>
                    </g>
                );
            })}
        </g>
    );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

/** The tree's core icon in 64 x 64 units: a ring like the other cores, a droplet with a frost star. */
function WaterCoreIcon({ colors, uid }: { colors: FxColors; uid: string }) {
    return (
        <g>
            <defs>
                <filter id={`${uid}g`} x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="2.5" result="b" />
                    <feMerge>
                        <feMergeNode in="b" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
                <radialGradient id={`${uid}r`} cx="50%" cy="45%" r="55%">
                    <stop offset="0%" stopColor={mix(colors.primary, colors.secondary, 0.3)} stopOpacity={0.85} />
                    <stop offset="100%" stopColor={colors.shade} stopOpacity={0.85} />
                </radialGradient>
                <linearGradient id={`${uid}d`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors.light} />
                    <stop offset="100%" stopColor={colors.secondary} />
                </linearGradient>
            </defs>
            <circle cx={32} cy={32} r={24} fill={`url(#${uid}r)`} stroke={colors.primary} strokeWidth={5} filter={`url(#${uid}g)`} />
            <path d="M32 13 C32 13 44 26 44 35 A12 12 0 0 1 20 35 C20 26 32 13 32 13 Z" fill={`url(#${uid}d)`} stroke={colors.light} strokeWidth={1.2} />
            <Flake x={32} y={36} r={6} stroke={colors.shade} width={1.7} />
            <path d="M24.5 31 Q25 25 29 20.5" stroke="#fff" strokeWidth={1.4} opacity={0.7} fill="none" strokeLinecap="round" />
        </g>
    );
}

function WaterCoreArt({ colors }: FxArtProps) {
    const uid = uidOf(useId());
    return (
        <g fontFamily={FONT}>
            <rect width={150} height={80} fill="#14171f" />
            <g transform="translate(4 4)">
                <WaterCoreIcon colors={colors} uid={`${uid}a`} />
            </g>
            <g transform="translate(82 24) scale(0.375)">
                <WaterCoreIcon colors={colors} uid={`${uid}b`} />
            </g>
            <g transform="translate(118 28) scale(0.25)">
                <WaterCoreIcon colors={colors} uid={`${uid}c`} />
            </g>
            <text x={36} y={76} fontSize={7} fill="#6b7280" textAnchor="middle">64</text>
            <text x={94} y={58} fontSize={7} fill="#6b7280" textAnchor="middle">24</text>
            <text x={126} y={58} fontSize={7} fill="#6b7280" textAnchor="middle">16</text>
        </g>
    );
}

/** A 64 x 64 card face shared by the three card icons. */
function CardFace({ colors, uid, children }: { colors: FxColors; uid: string; children: ReactNode }) {
    return (
        <g>
            <defs>
                <radialGradient id={`${uid}mist`} cx="0.5" cy="0.55" r="0.6">
                    <stop offset="0%" stopColor={colors.primary} stopOpacity={0.7} />
                    <stop offset="100%" stopColor={colors.primary} stopOpacity={0} />
                </radialGradient>
            </defs>
            <rect width={64} height={64} rx={6} fill={mix(colors.shade, '#000000', 0.45)} />
            <circle cx={32} cy={34} r={28} fill={`url(#${uid}mist)`} />
            {children}
        </g>
    );
}

const tip = (x: number, y: number) => `M${x} ${y - 3} L${x + 1.6} ${y} L${x} ${y + 3} L${x - 1.6} ${y} Z`;

function IceClawsIcon({ colors, uid }: { colors: FxColors; uid: string }) {
    const setA: [number, number, number, number][] = [[14, 50, 36, 12], [20, 54, 42, 16], [26, 58, 48, 20]];
    const setB: [number, number, number, number][] = [[50, 50, 28, 12], [44, 54, 22, 16], [38, 58, 16, 20]];
    return (
        <CardFace colors={colors} uid={uid}>
            {setA.map(([x0, y0, x1, y1]) => (
                <g key={`a${x0}`}>
                    <path d={jag(x0, y0, x1, y1, 4, 1)} stroke={mix(colors.primary, colors.secondary, 0.45)} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    <path d={jag(x0, y0, x1, y1, 4, 1)} stroke={colors.light} strokeWidth={1} strokeLinecap="round" fill="none" />
                    <path d={tip(x1, y1)} fill="#fff" />
                </g>
            ))}
            {setB.map(([x0, y0, x1, y1]) => (
                <g key={`b${x0}`}>
                    <path d={jag(x0, y0, x1, y1, 4, 1)} stroke={colors.secondary} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    <path d={jag(x0, y0, x1, y1, 4, 1)} stroke="#fff" strokeWidth={0.9} strokeLinecap="round" fill="none" />
                    <path d={tip(x1, y1)} fill="#fff" />
                </g>
            ))}
        </CardFace>
    );
}

function IceShardsIcon({ colors, uid }: { colors: FxColors; uid: string }) {
    const shard = (dx: number, dy: number, key: string) => (
        <g key={key} transform={`translate(${dx} ${dy})`}>
            <polygon points="40,6 45,20 23,46 19,36" fill={`url(#${uid}body)`} stroke={colors.shade} strokeWidth={1.5} strokeLinejoin="round" />
            <polygon points="40,8 42.5,18 36.5,20" fill="#fff" opacity={0.6} />
            <line x1={40} y1={6} x2={21} y2={41} stroke={colors.light} strokeWidth={0.7} opacity={0.7} />
        </g>
    );
    return (
        <CardFace colors={colors} uid={uid}>
            <defs>
                <linearGradient id={`${uid}body`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={colors.light} />
                    <stop offset="50%" stopColor={colors.secondary} />
                    <stop offset="100%" stopColor={colors.primary} />
                </linearGradient>
            </defs>
            {shard(-10, 4, 'back')}
            {shard(9, 9, 'front')}
            {/* A bead of frozen blood in the back shard: it still draws on bleeding enemies. */}
            <ellipse cx={20} cy={31} rx={1.8} ry={3} transform="rotate(30 20 31)" fill="#b91c1c" opacity={0.9} />
            <circle cx={8} cy={52} r={1.6} fill="#7f1d1d" />
        </CardFace>
    );
}

function FrozenFieldIcon({ colors, uid }: { colors: FxColors; uid: string }) {
    const spikes: [number, number, number][] = [[20, 50, 12], [32, 52, 20], [44, 50, 13], [26, 40, 8], [39, 41, 9]];
    return (
        <CardFace colors={colors} uid={uid}>
            <polygon points="6,56 58,56 48,28 16,28" fill={colors.primary} fillOpacity={0.6} stroke={colors.secondary} strokeWidth={1.5} strokeLinejoin="round" />
            <path d="M14 50 L24 44 L22 38 M42 46 L50 50 M34 34 L30 40" stroke={colors.light} strokeWidth={0.8} opacity={0.6} fill="none" />
            {spikes.map(([x, y, h]) => (
                <g key={`${x}-${y}`}>
                    <polygon points={`${x - 3.5},${y} ${x},${y - h} ${x + 3.5},${y}`} fill={colors.secondary} stroke={colors.light} strokeWidth={0.8} strokeLinejoin="round" />
                    <polygon points={`${x},${y} ${x},${y - h} ${x + 3.5},${y}`} fill="#fff" opacity={0.45} />
                </g>
            ))}
            {/* Stun stars. */}
            <path d="M32 7 L33.6 12.4 L39 14 L33.6 15.6 L32 21 L30.4 15.6 L25 14 L30.4 12.4 Z" fill={colors.light} />
            <path d="M18 14 L18.8 16.2 L21 17 L18.8 17.8 L18 20 L17.2 17.8 L15 17 L17.2 16.2 Z" fill={colors.light} opacity={0.8} />
            <path d="M46 14 L46.8 16.2 L49 17 L46.8 17.8 L46 20 L45.2 17.8 L43 17 L45.2 16.2 Z" fill={colors.light} opacity={0.8} />
        </CardFace>
    );
}

function iconArt(Icon: typeof IceClawsIcon) {
    return function IconArt({ colors }: FxArtProps) {
        const uid = uidOf(useId());
        return <Icon colors={colors} uid={uid} />;
    };
}

// ---------------------------------------------------------------------------
// Tile drain
// ---------------------------------------------------------------------------

type Tile = 'D' | 'S' | 'W' | 'X';
const TILE_COLORS: Record<Tile, string> = { D: '#8B6914', S: '#7DBDF0', W: '#2F7FD6', X: '#1B4A94' };
const NEXT_LEVEL: Record<Tile, Tile> = { X: 'W', W: 'S', S: 'D', D: 'D' };
const TILE_MAP: Tile[][] = [
    ['D', 'D', 'S', 'W', 'W'],
    ['D', 'S', 'S', 'W', 'X'],
    ['D', 'S', 'S', 'W', 'X'],
    ['D', 'D', 'S', 'S', 'W'],
    ['D', 'D', 'D', 'S', 'W'],
];
/** The four tiles being drawn on: deepest first, then nearest (own tile, orthogonal, diagonal). */
const DRAINED: [number, number][] = [[1, 3], [2, 3], [2, 2], [1, 2]];
const TS = 26;
const GRID = { x: 35, y: 6 };
const DRAIN_LOOP = 4;

function WaterDrainArt({ colors }: FxArtProps) {
    const center = { x: GRID.x + 2.5 * TS, y: GRID.y + 2.5 * TS };
    return (
        <g fontFamily={FONT}>
            <rect width={200} height={142} fill="#14171f" />
            {TILE_MAP.map((row, r) =>
                row.map((t, c) => (
                    <g key={`${r}-${c}`}>
                        <rect x={GRID.x + c * TS} y={GRID.y + r * TS} width={TS} height={TS} fill={TILE_COLORS[t]} stroke="#000" strokeOpacity={0.25} strokeWidth={0.5} />
                        {t !== 'D' && (
                            <path d={`M${GRID.x + c * TS + 5} ${GRID.y + r * TS + 10} q3 -2 6 0 t6 0 M${GRID.x + c * TS + 9} ${GRID.y + r * TS + 18} q3 -2 6 0`} fill="none" stroke="#fff" strokeOpacity={0.18} strokeWidth={0.8} />
                        )}
                    </g>
                )),
            )}
            <rect x={GRID.x + TS} y={GRID.y + TS} width={TS * 3} height={TS * 3} fill="none" stroke={colors.light} strokeWidth={1} strokeDasharray="3 2" opacity={0.75} />
            {DRAINED.map(([r, c], i) => {
                const cx = GRID.x + (c + 0.5) * TS;
                const cy = GRID.y + (r + 0.5) * TS;
                const tile = TILE_MAP[r][c];
                return (
                    <g key={`d${r}-${c}`}>
                        <rect x={GRID.x + c * TS} y={GRID.y + r * TS} width={TS} height={TS} fill={TILE_COLORS[NEXT_LEVEL[tile]]} style={{ animation: `wfx-levelup ${DRAIN_LOOP}s linear infinite`, opacity: 0 }} />
                        <circle className={P} cx={cx} cy={cy} r={10} fill="none" stroke={colors.light} strokeWidth={0.8} style={{ animation: `wfx-ripple 1.4s ease-out ${-i * 0.35}s infinite`, opacity: 0 }} />
                        <circle cx={cx} cy={cy} r={8} fill="none" stroke="#000" strokeOpacity={0.4} strokeWidth={2.4} strokeDasharray="11.5 1" pathLength={100} />
                        <circle
                            cx={cx}
                            cy={cy}
                            r={8}
                            fill="none"
                            stroke={colors.light}
                            strokeWidth={2.2}
                            pathLength={100}
                            strokeDasharray="100"
                            transform={`rotate(-90 ${cx} ${cy})`}
                            style={{ animation: `wfx-drainring ${DRAIN_LOOP}s steps(8, start) infinite` }}
                        />
                        {(r !== 2 || c !== 2) &&
                            [0, 1, 2].map((k) => (
                                <ellipse
                                    key={k}
                                    cx={cx}
                                    cy={cy}
                                    rx={1.4}
                                    ry={1.9}
                                    fill={colors.secondary}
                                    stroke={colors.light}
                                    strokeWidth={0.4}
                                    style={{ '--dx': `${center.x - cx}px`, '--dy': `${center.y - cy}px`, animation: `wfx-drain 1.2s ease-in ${-k * 0.4 - i * 0.13}s infinite`, opacity: 0 } as CSSProperties}
                                />
                            ))}
                    </g>
                );
            })}
            <Mage x={center.x} y={center.y} colors={colors} />
            <text x={center.x} y={center.y - 14} fontSize={7} fontWeight={700} fill={colors.light} textAnchor="middle" stroke="#000" strokeWidth={1.6} paintOrder="stroke" style={{ animation: 'wfx-float 2s ease-out infinite', opacity: 0 }}>
                +0.5
            </text>
            {(['X', 'W', 'S', 'D'] as Tile[]).map((t, i) => (
                <g key={t} transform={`translate(172 ${30 + i * 22})`}>
                    <rect width={10} height={10} fill={TILE_COLORS[t]} stroke="#000" strokeOpacity={0.4} />
                    {i < 3 && <path d="M5 12 L5 19 M3 17 L5 19.5 L7 17" stroke="#9ca3af" strokeWidth={0.8} fill="none" />}
                </g>
            ))}
        </g>
    );
}

// ---------------------------------------------------------------------------
// Ability effects
// ---------------------------------------------------------------------------

const S = 0.9;
type Pt = { x: number; y: number };

/** A point in the caster's aim frame (forward up the page, side < 0 to the left), in scene px. */
function aimPoint(caster: Pt, forward: number, side: number): Pt {
    return { x: caster.x + side * S, y: caster.y - forward * S };
}

/** Proposed Ice Claws claw: Bloody Claws' (12, -48) -> (62, 18) pushed out and lengthened. */
export const ICE_CLAWS_CLAW = { base: { forward: 16, side: -60 }, tip: { forward: 92, side: 26 } };

function ClawSweep({ from, to, at, dur, colors, keyPrefix }: { from: Pt; to: Pt; at: number; dur: number; colors: FxColors; keyPrefix: string }) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    const px = -dy / len;
    const py = dx / len;
    const style = { ...anim('wfx-slash', dur, at, {}, 'ease-out'), opacity: 0 };
    return (
        <g>
            {[-7, 0, 7].map((o) => {
                const d = jag(from.x + px * o, from.y + py * o, to.x + px * o, to.y + py * o, 7, 0.7);
                return (
                    <g key={`${keyPrefix}${o}`}>
                        <path d={d} pathLength={100} strokeDasharray="100" fill="none" stroke={colors.secondary} strokeWidth={4.5} strokeOpacity={0.45} strokeLinecap="round" style={style} />
                        <path d={d} pathLength={100} strokeDasharray="100" fill="none" stroke={colors.light} strokeWidth={1.6} strokeLinecap="round" style={style} />
                    </g>
                );
            })}
            {[0.25, 0.5, 0.75, 0.95].map((t, i) => (
                <Chips key={t} x={from.x + dx * t} y={from.y + dy * t} at={at + 0.02 + t * 0.03} dur={dur} colors={colors} n={4} spread={10} seed={i + keyPrefix.length} />
            ))}
        </g>
    );
}

function IceClawsFx({ colors, background }: FxArtProps) {
    const D = 2.4;
    const caster = { x: 100, y: 134 };
    const { base, tip: clawTip } = ICE_CLAWS_CLAW;
    const left = { from: aimPoint(caster, base.forward, base.side), to: aimPoint(caster, clawTip.forward, clawTip.side) };
    const right = { from: aimPoint(caster, base.forward, -base.side), to: aimPoint(caster, clawTip.forward, -clawTip.side) };
    const beats = [
        { at: 0.04, claws: [left] },
        { at: 0.29, claws: [right] },
        { at: 0.54, claws: [left, right] },
    ];
    const enemies = [
        { x: 84, y: 86, beats: [0, 2] },
        { x: 116, y: 86, beats: [1, 2] },
        { x: 100, y: 70, beats: [0, 1, 2] },
    ];
    return (
        <g>
            <Ground w={200} h={150} background={background} />
            {enemies.map((e) => (
                <Enemy key={`${e.x}`} x={e.x} y={e.y} />
            ))}
            {enemies.flatMap((e) => e.beats.map((b) => <HitFlash key={`${e.x}-${b}`} x={e.x} y={e.y} at={beats[b].at + 0.035} dur={D} colors={colors} />))}
            {beats.flatMap((beat, b) => beat.claws.map((claw, k) => <ClawSweep key={`${b}-${k}`} from={claw.from} to={claw.to} at={beat.at} dur={D} colors={colors} keyPrefix={`${b}${k}`} />))}
            <Mage x={caster.x} y={caster.y} colors={colors} />
        </g>
    );
}

/** One thrown ice shard flying from `from` toward `to` over `flight` (share of the loop). */
function FlyingShard({ from, to, at, dur, colors, blood = false, short = false }: { from: Pt; to: Pt; at: number; dur: number; colors: FxColors; blood?: boolean; short?: boolean }) {
    const len = Math.hypot(to.x - from.x, to.y - from.y);
    const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
    return (
        <g transform={`translate(${from.x} ${from.y}) rotate(${angle.toFixed(1)})`}>
            <g style={{ '--len': `${len.toFixed(1)}px`, ...anim(short ? 'wfx-fly-short' : 'wfx-fly', dur, at, {}, 'linear'), opacity: 0 } as CSSProperties}>
                <line x1={-24} y1={0} x2={-4} y2={0} stroke={blood ? '#dc2626' : colors.secondary} strokeWidth={2.4} strokeOpacity={0.4} strokeLinecap="round" />
                <line x1={-14} y1={0} x2={-4} y2={0} stroke={colors.light} strokeWidth={1} strokeOpacity={0.7} strokeLinecap="round" />
                <polygon points="-6,0 0,-2.8 10,0 0,2.8" fill={blood ? '#b91c1c' : colors.secondary} stroke={colors.light} strokeWidth={0.9} />
                <polygon points="0,-2.8 10,0 0,0" fill="#fff" opacity={0.55} />
            </g>
        </g>
    );
}

function Crosshair({ x, y, color }: { x: number; y: number; color: string }) {
    return (
        <g stroke={color} strokeWidth={0.9} opacity={0.7} fill="none">
            <circle cx={x} cy={y} r={4} />
            <path d={`M${x - 7} ${y} L${x - 2} ${y} M${x + 2} ${y} L${x + 7} ${y} M${x} ${y - 7} L${x} ${y - 2} M${x} ${y + 2} L${x} ${y + 7}`} />
        </g>
    );
}

function IceShardsFx({ colors, background }: FxArtProps) {
    const D = 2.2;
    const FLIGHT = 0.25;
    const start = { x: 100, y: 122 };
    const lerp = (a: Pt, b: Pt, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    const shots = [
        { to: { x: 86, y: 44 }, at: 0.02 },
        { to: { x: 124, y: 42 }, at: 0.3 },
    ];
    const bleeder = { x: 36, y: 80 };
    const splinterAt = 0.1;
    return (
        <g>
            <Ground w={200} h={150} background={background} />
            {shots.map((s) => (
                <Crosshair key={s.at} x={s.to.x} y={s.to.y} color={colors.light} />
            ))}
            {shots.map((s) => {
                const first = lerp(start, s.to, 0.45);
                return (
                    <g key={`e${s.at}`}>
                        <Enemy x={first.x} y={first.y} />
                        <Enemy x={s.to.x} y={s.to.y} />
                        <HitFlash x={first.x} y={first.y} at={s.at + FLIGHT * 0.45} dur={D} colors={colors} />
                        <Chips x={first.x} y={first.y} at={s.at + FLIGHT * 0.45} dur={D} colors={colors} n={5} spread={9} />
                        <HitFlash x={s.to.x} y={s.to.y} at={s.at + FLIGHT} dur={D} colors={colors} />
                        <Chips x={s.to.x} y={s.to.y} at={s.at + FLIGHT} dur={D} colors={colors} n={7} spread={13} seed={3} />
                    </g>
                );
            })}
            {/* A bleeding enemy bursts a blood shard that flies at the first target (Blood Splinters). */}
            <Enemy x={bleeder.x} y={bleeder.y} />
            {[[-4, 9], [3, 10], [6, 6]].map(([dx, dy]) => (
                <circle key={`${dx}`} cx={bleeder.x + dx} cy={bleeder.y + dy} r={1.4} fill="#b91c1c" />
            ))}
            <circle cx={bleeder.x} cy={bleeder.y} r={10} fill="none" stroke="#dc2626" strokeWidth={1} strokeDasharray="2 2" opacity={0.8} />
            <Chips x={bleeder.x} y={bleeder.y} at={splinterAt} dur={D} colors={{ ...colors, secondary: '#dc2626' }} n={5} spread={8} seed={2} />
            <FlyingShard from={bleeder} to={shots[0].to} at={splinterAt} dur={D} colors={colors} blood short />
            {shots.map((s) => (
                <FlyingShard key={`s${s.at}`} from={start} to={s.to} at={s.at} dur={D} colors={colors} />
            ))}
            <Mage x={100} y={134} colors={colors} />
        </g>
    );
}

/** Proposed Frozen Field timing (seconds): windup, the late target pick, the ice rising, then pulses. */
export const FROZEN_FIELD_TIMINGS = { selectAt: 0.8, firstHit: 1.0, pulseEvery: 0.5, pulses: 6 };
const FIELD = { x: 40, y: 24, w: 120, h: 96 };

function FrozenFieldFx({ colors, background }: FxArtProps) {
    const uid = uidOf(useId());
    const D = 4;
    const T = FROZEN_FIELD_TIMINGS;
    const caster = { x: 100, y: 150 };
    const target = { x: FIELD.x + FIELD.w / 2, y: FIELD.y + FIELD.h / 2 };
    const selectAt = T.selectAt / D;
    const hitAt = T.firstHit / D;
    const pulseAts = Array.from({ length: T.pulses }, (_, k) => (T.firstHit + k * T.pulseEvery) / D);
    const spikes: [number, number, number][] = [
        [52, 112, 9], [78, 104, 12], [112, 114, 8], [146, 100, 11], [60, 78, 10], [100, 84, 13],
        [138, 66, 9], [50, 44, 11], [84, 34, 9], [118, 40, 12], [150, 36, 8], [72, 58, 8],
    ];
    const frozen = [
        { x: 70, y: 96 },
        { x: 126, y: 76 },
        { x: 96, y: 46 },
    ];
    return (
        <g fontFamily={FONT}>
            <defs>
                <pattern id={`${uid}frost`} width={16} height={16} patternUnits="userSpaceOnUse">
                    <Flake x={8} y={8} r={2.6} stroke={colors.light} width={0.6} />
                </pattern>
            </defs>
            <Ground w={200} h={192} background={background} />
            {/* Windup (1 s): a spell ring at the caster's feet. */}
            <g className={P} style={{ ...anim('wfx-ring-in', D, 0, {}, 'ease-out'), opacity: 0 }}>
                <circle cx={caster.x} cy={caster.y} r={17} fill={colors.primary} fillOpacity={0.15} stroke={colors.primary} strokeWidth={1.6} />
                <circle cx={caster.x} cy={caster.y} r={13} fill="none" stroke={colors.secondary} strokeWidth={1.1} strokeDasharray="2 5 7 5">
                    <animateTransform attributeName="transform" type="rotate" from={`0 ${caster.x} ${caster.y}`} to={`360 ${caster.x} ${caster.y}`} dur="4s" repeatCount="indefinite" />
                </circle>
            </g>
            <Enemy x={176} y={62} />
            {frozen.map((e) => (
                <Enemy key={`${e.x}`} x={e.x} y={e.y} />
            ))}
            {/* 0.2 s before the first hit the target is picked: aim line, crosshair and the field's outline. */}
            <g style={{ ...anim('wfx-ff-mark', D, selectAt), opacity: 0 }}>
                <line x1={caster.x} y1={caster.y - 12} x2={target.x} y2={FIELD.y + FIELD.h + 2} stroke={colors.light} strokeWidth={0.8} strokeDasharray="3 3" />
                <rect x={FIELD.x} y={FIELD.y} width={FIELD.w} height={FIELD.h} fill="none" stroke={colors.secondary} strokeWidth={1.5} strokeDasharray="5 3" />
            </g>
            {/* The intro: ice shards rise out of the ground in the last 0.2 s. */}
            {spikes.map(([x, y, h], i) => (
                <g key={`${x}-${y}`} style={{ ...anim('wfx-rise', D, selectAt + (i / spikes.length) * 0.04, {}, 'ease-out'), transformBox: 'fill-box', transformOrigin: '50% 100%', opacity: 0 }}>
                    <polygon points={`${x - 3.5},${y} ${x},${y - h} ${x + 3.5},${y}`} fill={colors.secondary} stroke={colors.light} strokeWidth={0.7} strokeLinejoin="round" />
                    <polygon points={`${x},${y} ${x},${y - h} ${x + 3.5},${y}`} fill="#fff" opacity={0.45} />
                </g>
            ))}
            {/* The field lands at 1 s and stays, frosted, for the pulses. */}
            <g style={{ ...anim('wfx-ff-field', D, hitAt, {}, 'ease-out'), transformBox: 'fill-box', transformOrigin: 'center', opacity: 0 }}>
                <rect x={FIELD.x} y={FIELD.y} width={FIELD.w} height={FIELD.h} fill={colors.primary} fillOpacity={0.42} />
                <rect x={FIELD.x} y={FIELD.y} width={FIELD.w} height={FIELD.h} fill={`url(#${uid}frost)`} opacity={0.6} />
                <rect x={FIELD.x} y={FIELD.y} width={FIELD.w} height={FIELD.h} fill="none" stroke={colors.secondary} strokeWidth={1.5} />
            </g>
            {/* Each pulse: a cold flash over the field and on every enemy inside. */}
            {pulseAts.map((at) => (
                <g key={`p${at}`}>
                    <rect x={FIELD.x} y={FIELD.y} width={FIELD.w} height={FIELD.h} fill={colors.light} style={{ ...anim('wfx-ff-pulse', D, at, {}, 'ease-out'), opacity: 0 }} />
                    {frozen.map((e) => (
                        <HitFlash key={`${e.x}`} x={e.x} y={e.y} at={at} dur={D} colors={colors} />
                    ))}
                </g>
            ))}
            {/* Stunned for as long as the pulses keep landing: cased in ice, with stars circling. */}
            {frozen.map((e) => (
                <g key={`f${e.x}`} style={{ ...anim('wfx-ff-field', D, hitAt, {}, 'ease-out'), transformBox: 'fill-box', transformOrigin: 'center', opacity: 0 }}>
                    <polygon
                        points={Array.from({ length: 6 }, (_, i) => {
                            const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
                            return `${(e.x + Math.cos(a) * 12).toFixed(1)},${(e.y + Math.sin(a) * 12).toFixed(1)}`;
                        }).join(' ')}
                        fill={colors.light}
                        fillOpacity={0.3}
                        stroke={colors.light}
                        strokeWidth={1.2}
                    />
                    <path d={`M${e.x - 6} ${e.y - 6} L${e.x - 2} ${e.y - 1} M${e.x + 5} ${e.y - 7} L${e.x + 2} ${e.y - 3}`} stroke="#fff" strokeWidth={0.8} opacity={0.8} />
                    <g transform={`translate(${e.x} ${e.y - 14})`}>
                        <g>
                            <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="1.6s" repeatCount="indefinite" />
                            {[0, 120, 240].map((a) => (
                                <path
                                    key={a}
                                    transform={`rotate(${a}) translate(7 0) scale(0.5)`}
                                    d="M0 -6 L1.6 -1.6 L6 0 L1.6 1.6 L0 6 L-1.6 1.6 L-6 0 L-1.6 -1.6 Z"
                                    fill={colors.light}
                                />
                            ))}
                        </g>
                    </g>
                </g>
            ))}
            <Mage x={caster.x} y={caster.y} colors={colors} />
            {/* The card's mode strip: Frozen Field selected, Blood Burst one click away. */}
            <g transform="translate(40 172)">
                <rect width={62} height={15} rx={3} fill={colors.secondary} />
                <text x={31} y={10.5} fontSize={7.5} fontWeight={700} fill={colors.shade} textAnchor="middle">Frozen Field</text>
                <rect x={64} width={56} height={15} rx={3} fill="none" stroke="#f87171" strokeWidth={1} />
                <text x={92} y={10.5} fontSize={7.5} fill="#fca5a5" textAnchor="middle">Blood Burst</text>
            </g>
        </g>
    );
}

export const WATER_ART: FxArtPiece[] = [
    { id: 'water-bar', label: 'Water bar', caption: '3, 10.5 and 16 of 16, with its tooltip', size: [240, 142], displayWidth: 240, Render: WaterBarArt },
    { id: 'water-core', label: 'Core icon', caption: 'at 64, 24 and 16 px', size: [150, 80], displayWidth: 150, Render: WaterCoreArt },
    { id: 'water-drain', label: 'Drawing water', caption: 'up to 4 tiles in the 3x3, 1/8 per second (2x speed)', size: [200, 142], displayWidth: 200, Render: WaterDrainArt },
    { id: 'ice-claws-icon', label: 'Ice Claws', caption: 'card icon', size: [64, 64], displayWidth: 96, Render: iconArt(IceClawsIcon) },
    { id: 'ice-shards-icon', label: 'Ice Shards', caption: 'card icon', size: [64, 64], displayWidth: 96, Render: iconArt(IceShardsIcon) },
    { id: 'frozen-field-icon', label: 'Frozen Field', caption: 'card icon', size: [64, 64], displayWidth: 96, Render: iconArt(FrozenFieldIcon) },
    { id: 'ice-claws-fx', label: 'Ice Claws', caption: 'left, right, X; frost chips on each claw', size: [200, 150], displayWidth: 200, Render: IceClawsFx },
    { id: 'ice-shards-fx', label: 'Ice Shards', caption: 'two throws, each pierces one enemy; a bleeder bursts a blood shard', size: [200, 150], displayWidth: 200, Render: IceShardsFx },
    { id: 'frozen-field-fx', label: 'Frozen Field', caption: '1 s windup, target picked at 0.8 s as ice rises, then 6 pulses that damage and re-stun', size: [200, 192], displayWidth: 200, Render: FrozenFieldFx },
];
