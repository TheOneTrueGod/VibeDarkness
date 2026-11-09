/**
 * Command Core (spirit animal) painters. Every mote here is drawn with `drawMote` (`game/effects/motes.ts`),
 * so the ring, the cue and the unit aura read as one family.
 *
 * - `SpellCircleCommand` (see `game/spellCircles/spellCircles.ts`): a pine ring with a slowly turning lime
 *   rune band. Motes rise off the rim in mirrored pairs, more of them as the charge builds. At the cast the
 *   ring flares outward and the motes leap up and fade. Data: `ringColor`, `runeColor`, `moteColor`,
 *   `glowColor`, `moteCount`, plus the shared spell-circle fields.
 * - `CommandCue` (see `abilities/petCommands.ts`): the player commanding their spirit. A stream of motes
 *   arcs from the owner to the pet (following both live), then a ring of motes bursts round the pet.
 *   Data: `CommandCueEffectData` (`game/effects/commandCue.ts`).
 */
import { Graphics, type Container } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import { castBoundAlpha } from '../effects/castBound';
import { drawMote, moteFlicker, moteLifeAlpha } from '../effects/motes';
import type { CommandCueEffectData } from '../effects/commandCue';
import type { IEffectDef, IEffectRenderContext } from './types';
import { spellCirclePhase } from './spellCircleEffects';

export const COMMAND_SPELL_CIRCLE_EFFECT_TYPE = 'SpellCircleCommand';

const TAU = Math.PI * 2;
const TOP = -Math.PI / 2;

function num(data: Record<string, unknown> | undefined, key: string, fallback: number): number {
    const v = data?.[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function clamp01(v: number): number {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeOutCubic(t: number): number {
    const u = 1 - clamp01(t);
    return 1 - u * u * u;
}

/** Stable 0..1 hash of an integer, for per-slot phases. */
function hash01(n: number): number {
    let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
    x ^= x >>> 13;
    x = Math.imul(x, 0xc2b2ae35);
    x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------------------------------
// Spell circle
// ---------------------------------------------------------------------------------------------------

/** Seconds each rim mote takes to rise and fade (owner clock). */
const RING_MOTE_PERIOD = 1.1;
/** How far a rim mote climbs (px). */
const RING_MOTE_RISE = 20;
/** Rune band turns per second (owner clock). */
const RING_RUNE_TURNS_PER_SEC = 0.12;
const RING_RUNE_DASHES = 12;

/**
 * Rim slot for mote `k` (join order): the top, then mirrored pairs down both sides. Returns the angle and
 * the pair key (mirrored slots share it, so they rise in step).
 */
export function commandRingSlot(k: number, count: number): { angle: number; pair: number } {
    if (k === 0) return { angle: TOP, pair: 0 };
    const pair = Math.ceil(k / 2);
    const side = k % 2 === 1 ? 1 : -1;
    const pairs = Math.ceil((count - 1) / 2);
    const offset = (pair / (pairs + 1)) * Math.PI;
    return { angle: TOP + side * offset, pair };
}

export const commandSpellCircleEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const data = effect.effectData;
        const R = num(data, 'radius', 48);
        const ringColor = num(data, 'ringColor', 0x0f766e);
        const runeColor = num(data, 'runeColor', 0xd9f99d);
        const moteColor = num(data, 'moteColor', runeColor);
        const glowColor = num(data, 'glowColor', ringColor);
        const moteCount = Math.max(0, Math.floor(num(data, 'moteCount', 13)));
        const { charge, linger } = spellCirclePhase(effect.progress, num(data, 'castAt', 1));
        const t = effect.elapsed;
        visual.alpha = castBoundAlpha(effect);

        const form = easeOutCubic(charge / 0.35);
        const flare = easeOutCubic(linger);
        const strength = linger > 0 ? 1 - flare : form;
        const ringR = R * (linger > 0 ? 1 + 0.35 * flare : 0.85 + 0.15 * form);

        // Ground glow and the ring itself.
        g.circle(0, 0, ringR);
        g.fill({ color: ringColor, alpha: 0.12 * strength });
        g.circle(0, 0, ringR);
        g.stroke({ color: ringColor, width: 7, alpha: 0.25 * strength });
        g.circle(0, 0, ringR);
        g.stroke({ color: ringColor, width: 2.5, alpha: 0.85 * strength });

        // Rune band: short lime dashes just inside the ring, turning slowly (symmetric: an even count).
        const runeR = ringR * 0.82;
        const spin = t * RING_RUNE_TURNS_PER_SEC * TAU;
        const dash = (TAU / RING_RUNE_DASHES) * 0.32;
        for (let i = 0; i < RING_RUNE_DASHES; i++) {
            const a = TOP + spin + (i / RING_RUNE_DASHES) * TAU;
            // Start a fresh sub-path, or the arc joins the previous point with a straight line.
            g.moveTo(Math.cos(a - dash / 2) * runeR, Math.sin(a - dash / 2) * runeR);
            g.arc(0, 0, runeR, a - dash / 2, a + dash / 2);
            g.stroke({ color: runeColor, width: 1.6, alpha: 0.75 * strength, cap: 'round' });
        }

        // Rim motes: join as the charge builds, then rise and fade on a loop. At the cast they leap up.
        for (let k = 0; k < moteCount; k++) {
            const joinAt = 0.05 + (k / Math.max(1, moteCount)) * 0.55;
            const joined = linger > 0 ? 1 : clamp01((charge - joinAt) / 0.12);
            if (joined <= 0) continue;
            const { angle, pair } = commandRingSlot(k, moteCount);
            const phase = hash01(pair + 1);
            const life = ((t / RING_MOTE_PERIOD) + phase) % 1;
            const rise = RING_MOTE_RISE * life + (linger > 0 ? 26 * flare : 0);
            const x = Math.cos(angle) * ringR;
            const y = Math.sin(angle) * ringR - rise;
            const alpha = joined * strength * moteLifeAlpha(life) * moteFlicker(t, 2.2, phase * TAU);
            drawMote(g, x, y, 2 * (1 - 0.35 * life), moteColor, glowColor, alpha);
        }
    },
};

// ---------------------------------------------------------------------------------------------------
// Command cue
// ---------------------------------------------------------------------------------------------------

/** Share of the cue the stream takes to reach the pet; the rest is the burst. */
const CUE_STREAM_END = 0.6;
/** Arc lift as a share of the owner-to-pet distance (screen up). */
const CUE_ARC_LIFT = 0.3;
const CUE_BURST_MOTES = 8;

/** Point on the cue's arc at `s` (0 = owner, 1 = pet), relative to the owner. */
export function commandCueArcPoint(dx: number, dy: number, s: number): { x: number; y: number } {
    const lift = Math.hypot(dx, dy) * CUE_ARC_LIFT;
    const cx = dx / 2;
    const cy = dy / 2 - lift;
    const u = 1 - s;
    return { x: 2 * u * s * cx + s * s * dx, y: 2 * u * s * cy + s * s * dy };
}

export const commandCueEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const data = effect.effectData as Partial<CommandCueEffectData>;
        const from =
            (data.fromUnitId ? context.getUnitPosition?.(data.fromUnitId) : undefined) ??
            { x: data.fromX ?? effect.x, y: data.fromY ?? effect.y };
        const to =
            (data.toUnitId ? context.getUnitPosition?.(data.toUnitId) : undefined) ??
            { x: data.toX ?? effect.x, y: data.toY ?? effect.y };
        const color = data.moteColor ?? 0xd9f99d;
        const glow = data.glowColor ?? 0x0f766e;
        const count = Math.max(1, data.count ?? 7);
        const p = effect.progress;
        const ox = from.x - effect.x;
        const oy = from.y - effect.y;
        const dx = to.x - from.x;
        const dy = to.y - from.y;

        // The stream: motes leave the owner one after another and fly the arc to the pet.
        const stream = p / CUE_STREAM_END;
        for (let i = 0; i < count; i++) {
            const s = clamp01(stream * 1.5 - (i / count) * 0.5);
            if (s <= 0 || s >= 1) continue;
            const pt = commandCueArcPoint(dx, dy, s);
            const alpha = Math.min(1, s / 0.1) * (1 - s * 0.3) * moteFlicker(effect.elapsed, 3, i);
            drawMote(g, ox + pt.x, oy + pt.y, 1.6 - 0.5 * (i / count), color, glow, alpha);
        }

        // The burst: a ring of motes swells out round the pet and lifts away.
        if (p < CUE_STREAM_END) return;
        const b = (p - CUE_STREAM_END) / (1 - CUE_STREAM_END);
        const r = 6 + 14 * easeOutCubic(b);
        for (let i = 0; i < CUE_BURST_MOTES; i++) {
            const a = TOP + (i / CUE_BURST_MOTES) * TAU;
            const x = ox + dx + Math.cos(a) * r;
            const y = oy + dy + Math.sin(a) * r * 0.7 - 10 * b;
            drawMote(g, x, y, 1.4 * (1 - 0.4 * b), color, glow, 1 - b);
        }
    },
};
