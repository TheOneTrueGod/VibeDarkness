/**
 * Art for the Chapter 3 boss plan (`docs/ideas/plans/0006_2026-11-14_chapter-3-bosses.md`): the Court
 * Magician's real ability icons (the `.svg` files the cards ship with) and top-down stills of his
 * crystals, Rearrange shapes, Shard Nova and Crystal Laser. The stills are drawn from the fight's
 * numbers (`card_defs/14_enemy_court_magician/`), not captured from the renderer. Colours come from the
 * palette card, which the plan sets to the Court Magic theme.
 */
import type { ReactNode } from 'react';
import { mix, type FxColors } from '../fxColors';
import { ART_BACKGROUNDS, type FxArtPiece, type FxArtProps } from './types';
import rearrangeIcon from '../../../../games/minion_battles/card_defs/14_enemy_court_magician/1401_Rearrange/rearrange.svg?raw';
import shardNovaIcon from '../../../../games/minion_battles/card_defs/14_enemy_court_magician/1402_ShardNova/shardNova.svg?raw';
import crystalVolleyIcon from '../../../../games/minion_battles/card_defs/14_enemy_court_magician/1403_CrystalVolley/crystalVolley.svg?raw';
import crystalRamIcon from '../../../../games/minion_battles/card_defs/14_enemy_court_magician/1404_CrystalRam/crystalRam.svg?raw';
import blinkIcon from '../../../../games/minion_battles/card_defs/14_enemy_court_magician/1405_Blink/blink.svg?raw';
import mirrorSwapIcon from '../../../../games/minion_battles/card_defs/14_enemy_court_magician/1406_MirrorSwap/mirrorSwap.svg?raw';
import conjureCrystalIcon from '../../../../games/minion_battles/card_defs/14_enemy_court_magician/1407_ConjureCrystal/conjureCrystal.svg?raw';
import crystalLaserIcon from '../../../../games/minion_battles/card_defs/14_enemy_court_magician/1490_CrystalLaser/crystalLaser.svg?raw';

const FONT = 'ui-sans-serif, system-ui, sans-serif';
const RED = '#ef4444';

/** One real ability icon, 64 x 64 on a dark card face. */
function iconArt(svg: string) {
    return function IconArt() {
        return (
            <g>
                <rect width={64} height={64} rx={6} fill="#12001f" />
                <g dangerouslySetInnerHTML={{ __html: svg }} />
            </g>
        );
    };
}

function Ground({ w, h, background }: { w: number; h: number; background: FxArtProps['background'] }) {
    return <rect width={w} height={h} fill={ART_BACKGROUNDS[background]} />;
}

/** A dark crystal: the diamond the Crystal Laser / Shard Nova icons use. */
function Crystal({ x, y, colors, s = 1 }: { x: number; y: number; colors: FxColors; s?: number }) {
    return (
        <path
            transform={`translate(${x} ${y}) scale(${s})`}
            d="M0 -7 L5 0 L0 7 L-5 0 Z"
            fill={colors.primary}
            stroke={colors.secondary}
            strokeWidth={1.4}
            strokeLinejoin="round"
        />
    );
}

function Magician({ x, y, colors }: { x: number; y: number; colors: FxColors }) {
    return (
        <g transform={`translate(${x} ${y})`}>
            <circle r={11} fill="#1a0b2b" stroke={colors.secondary} strokeWidth={2} />
            <path d="M-8 4 L0 -15 L8 4 Q0 0 -8 4 Z" fill={colors.primary} stroke={colors.light} strokeWidth={0.8} />
            <circle cx={-2.6} cy={-1} r={1} fill={colors.light} />
            <circle cx={2.6} cy={-1} r={1} fill={colors.light} />
        </g>
    );
}

function Hero({ x, y, tint = '#60a5fa' }: { x: number; y: number; tint?: string }) {
    return (
        <g transform={`translate(${x} ${y})`}>
            <circle r={7} fill="#1c2430" stroke={tint} strokeWidth={1.6} />
            <circle cy={-2} r={1.6} fill={tint} />
        </g>
    );
}

function Label({ x, y, children, anchor = 'middle' }: { x: number; y: number; children: ReactNode; anchor?: 'start' | 'middle' | 'end' }) {
    return (
        <text x={x} y={y} fontSize={8} fill="#cbd5e1" fontFamily={FONT} textAnchor={anchor}>
            {children}
        </text>
    );
}

// ---------------------------------------------------------------------------
// Crystals: the start of the fight and the five he conjures
// ---------------------------------------------------------------------------

function CrystalRingArt({ colors, background }: FxArtProps) {
    const centre = { x: 100, y: 88 };
    const ring = (n: number, r: number, turn: number) =>
        Array.from({ length: n }, (_, i) => {
            const a = ((i + turn) / n) * Math.PI * 2;
            return { x: centre.x + Math.cos(a) * r, y: centre.y + Math.sin(a) * r };
        });
    const start = ring(2, 48, 0.5);
    const conjured = ring(5, 66, 0.2);
    return (
        <g>
            <Ground w={200} h={176} background={background} />
            <circle cx={centre.x} cy={centre.y} r={48} fill="none" stroke={mix(colors.secondary, '#000000', 0.5)} strokeWidth={0.8} strokeDasharray="3 3" />
            <circle cx={centre.x} cy={centre.y} r={66} fill="none" stroke={mix(colors.secondary, '#000000', 0.6)} strokeWidth={0.8} strokeDasharray="2 4" />
            {conjured.map((c, i) => (
                <g key={`c${i}`} opacity={0.55}>
                    <Crystal x={c.x} y={c.y} colors={colors} />
                    <text x={c.x} y={c.y + 17} fontSize={7} fill="#94a3b8" fontFamily={FONT} textAnchor="middle">
                        {90 - i * 10}%
                    </text>
                </g>
            ))}
            {start.map((c, i) => (
                <Crystal key={`s${i}`} x={c.x} y={c.y} colors={colors} s={1.25} />
            ))}
            <Magician x={centre.x} y={centre.y} colors={colors} />
            <Label x={100} y={14}>Opening: 2 crystals (solid)</Label>
            <Label x={100} y={26}>+1 each 10% HP lost, 90% to 50% (faint)</Label>
            <Label x={100} y={168}>Crystals cannot be hurt; they only ram on his command</Label>
        </g>
    );
}

// ---------------------------------------------------------------------------
// Rearrange: the five shapes
// ---------------------------------------------------------------------------

function RearrangeArt({ colors, background }: FxArtProps) {
    const shape = (cx: number, cy: number, kind: 'line' | 'wall' | 'box' | 'ringCaster' | 'ringTarget') => {
        const m = { x: cx - 26, y: cy };
        const t = { x: cx + 26, y: cy };
        let pts: { x: number; y: number }[] = [];
        if (kind === 'line') pts = [1, 2, 3, 4].map((i) => ({ x: m.x + i * 11, y: cy }));
        if (kind === 'wall') pts = [-1.5, -0.5, 0.5, 1.5].map((i) => ({ x: m.x + 14, y: cy + i * 11 }));
        if (kind === 'box') pts = [[-14, -14], [14, -14], [14, 14], [-14, 14]].map(([dx, dy]) => ({ x: t.x + dx, y: cy + dy }));
        if (kind === 'ringCaster') pts = Array.from({ length: 6 }, (_, i) => ({ x: m.x + Math.cos((i / 6) * 6.283) * 17, y: cy + Math.sin((i / 6) * 6.283) * 17 }));
        if (kind === 'ringTarget') pts = Array.from({ length: 6 }, (_, i) => ({ x: t.x + Math.cos((i / 6) * 6.283) * 20, y: cy + Math.sin((i / 6) * 6.283) * 20 }));
        return (
            <g>
                {pts.map((p, i) => (
                    <circle key={`r${i}`} cx={p.x} cy={p.y} r={9} fill={RED} fillOpacity={0.12} stroke={RED} strokeOpacity={0.5} strokeWidth={0.6} />
                ))}
                {pts.map((p, i) => (
                    <Crystal key={i} x={p.x} y={p.y} colors={colors} s={0.8} />
                ))}
                <Magician x={m.x} y={m.y} colors={colors} />
                <Hero x={t.x} y={t.y} />
            </g>
        );
    };
    return (
        <g>
            <Ground w={330} h={150} background={background} />
            {shape(56, 38, 'line')}
            {shape(166, 38, 'wall')}
            {shape(276, 38, 'box')}
            {shape(110, 108, 'ringCaster')}
            {shape(220, 108, 'ringTarget')}
            <Label x={56} y={72}>Line at a player</Label>
            <Label x={166} y={72}>Line across him</Label>
            <Label x={276} y={72}>Cage round a player</Label>
            <Label x={110} y={142}>Guard ring</Label>
            <Label x={220} y={142}>Ring round a player</Label>
        </g>
    );
}

// ---------------------------------------------------------------------------
// Shard Nova: interleaved rings
// ---------------------------------------------------------------------------

function ShardNovaArt({ colors, background }: FxArtProps) {
    const crystals = [{ x: 62, y: 92 }, { x: 128, y: 64 }, { x: 196, y: 98 }];
    const half = Math.PI / 8;
    return (
        <g>
            <Ground w={260} h={160} background={background} />
            {crystals.map((c, ci) =>
                Array.from({ length: 8 }, (_, i) => {
                    const a = (i / 8) * Math.PI * 2 + ci * half;
                    const r = 34 + (i % 2) * 6;
                    const x = c.x + Math.cos(a) * r;
                    const y = c.y + Math.sin(a) * r;
                    return (
                        <g key={`${ci}-${i}`} transform={`translate(${x} ${y}) rotate(${(a * 180) / Math.PI})`}>
                            <path d="M-5 0 L-1 -2.4 L4 0 L-1 2.4 Z" fill={mix(colors.secondary, '#ffffff', 0.2)} stroke={colors.primary} strokeWidth={0.7} />
                        </g>
                    );
                }),
            )}
            {crystals.map((c, i) => (
                <Crystal key={i} x={c.x} y={c.y} colors={colors} s={1.2} />
            ))}
            <Hero x={128} y={118} />
            <Hero x={96} y={132} tint="#34d399" />
            <Label x={130} y={14}>Each crystal bursts an offset ring of slow shards</Label>
            <Label x={130} y={152}>Slow on purpose: dodge by walking through the gaps</Label>
        </g>
    );
}

// ---------------------------------------------------------------------------
// Crystal Laser: aim and fire
// ---------------------------------------------------------------------------

function LaserArt({ colors, background }: FxArtProps) {
    const wallX = 72;
    const ys = [52, 64, 76, 88, 100];
    const shield = { x: 200, y: 76 };
    const panel = (ox: number, firing: boolean) => (
        <g transform={`translate(${ox} 0)`}>
            <rect width={240} height={130} fill={ART_BACKGROUNDS[background]} />
            {ys.map((y) => (
                <g key={y}>
                    {firing ? (
                        <>
                            <rect x={wallX} y={y - 6} width={shield.x - wallX - 8} height={12} fill={colors.secondary} opacity={0.5} />
                            <rect x={wallX} y={y - 2.5} width={shield.x - wallX - 8} height={5} fill="#ffffff" opacity={0.9} />
                        </>
                    ) : (
                        <line x1={wallX} y1={y} x2={shield.x - 8} y2={y} stroke={RED} strokeOpacity={0.75} strokeWidth={1.2} strokeDasharray="4 3" />
                    )}
                </g>
            ))}
            {ys.map((y) => (
                <Crystal key={y} x={wallX} y={y} colors={colors} s={0.95} />
            ))}
            <Magician x={34} y={76} colors={colors} />
            <path d={`M${shield.x - 8} 58 Q${shield.x + 4} 76 ${shield.x - 8} 94`} fill="none" stroke="#38bdf8" strokeWidth={3.5} strokeLinecap="round" />
            <Hero x={shield.x} y={shield.y} />
            <Hero x={shield.x + 20} y={shield.y - 12} tint="#34d399" />
            <Hero x={shield.x + 20} y={shield.y + 12} tint="#fbbf24" />
            <Label x={120} y={20}>{firing ? 'Fire: half a round, turning to follow' : 'Aim: 1.2 s of red sight-lines'}</Label>
            <Label x={120} y={120}>{firing ? 'Rays stop on the first body; a shield covers those behind' : 'Time stopped for 2.2 s before this, while the wall assembles'}</Label>
        </g>
    );
    return (
        <g>
            {panel(0, false)}
            {panel(250, true)}
            <path d="M241 62 L249 65 L241 68 Z" fill="#94a3b8" />
        </g>
    );
}

export const COURT_MAGICIAN_ART: FxArtPiece[] = [
    { id: 'cm-crystals', label: 'The crystals', caption: 'opening ring and the five he conjures', size: [200, 176], displayWidth: 240, Render: CrystalRingArt },
    { id: 'cm-rearrange', label: 'Rearrange', caption: 'the five shapes; red marks where each landing shocks (3 damage)', size: [330, 150], displayWidth: 330, Render: RearrangeArt },
    { id: 'cm-nova', label: 'Shard Nova', caption: 'three crystals, offset rings of 8 (12 when enraged)', size: [260, 160], displayWidth: 280, Render: ShardNovaArt },
    { id: 'cm-laser', label: 'Crystal Laser', caption: 'the super: aim, then fire (enraged, below 50% HP)', size: [490, 130], displayWidth: 490, Render: LaserArt },
    { id: 'cm-rearrange-icon', label: 'Rearrange', caption: '1401', size: [64, 64], displayWidth: 72, Render: iconArt(rearrangeIcon) },
    { id: 'cm-nova-icon', label: 'Shard Nova', caption: '1402', size: [64, 64], displayWidth: 72, Render: iconArt(shardNovaIcon) },
    { id: 'cm-volley-icon', label: 'Crystal Volley', caption: '1403', size: [64, 64], displayWidth: 72, Render: iconArt(crystalVolleyIcon) },
    { id: 'cm-ram-icon', label: 'Crystal Ram', caption: '1404', size: [64, 64], displayWidth: 72, Render: iconArt(crystalRamIcon) },
    { id: 'cm-blink-icon', label: 'Blink', caption: '1405', size: [64, 64], displayWidth: 72, Render: iconArt(blinkIcon) },
    { id: 'cm-swap-icon', label: 'Mirror Swap', caption: '1406', size: [64, 64], displayWidth: 72, Render: iconArt(mirrorSwapIcon) },
    { id: 'cm-conjure-icon', label: 'Conjure Crystal', caption: '1407', size: [64, 64], displayWidth: 72, Render: iconArt(conjureCrystalIcon) },
    { id: 'cm-laser-icon', label: 'Crystal Laser', caption: '1490 (super)', size: [64, 64], displayWidth: 72, Render: iconArt(crystalLaserIcon) },
];
