/**
 * `SpellCircleMoteRing`: a data-driven spell circle (see `game/spellCircles/spellCircles.ts`). A ring with a
 * turning band of rune dashes (short, long, short, long, ...) just inside it, shedding motes off its rim. Which
 * motes, and how many, is data: `rimMotes` lists one {@link MoteSpec} per kind with a count, so a style can
 * throw any mix of `motes.ts` shapes (sparks, frost, shards, droplets with `gravityPx`). Each kind is spaced
 * evenly round the rim and the kinds interleave, so the ring stays roughly symmetrical.
 *
 * As the charge builds the ring settles in and the motes join one by one; each then loops at its rim slot,
 * moving exactly as a spawned mote of that spec would (`loopingMotePose`). At the cast the ring flares
 * outward and fades while the motes burst away from it.
 *
 * Data (plus the shared spell-circle fields): `ringColor`, `runeColor`, `runeTurnsPerSec`, `runePairs`,
 * `rimMotes: RimMoteKind[]`.
 */
import { Graphics, type Container } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import { castBoundAlpha } from '../effects/castBound';
import { drawMote, hashMoteSeed, loopingMotePose, type MoteSpec } from '../effects/motes';
import type { IEffectDef, IEffectRenderContext } from './types';
import { spellCirclePhase } from './spellCircleEffects';

export const MOTE_RING_SPELL_CIRCLE_EFFECT_TYPE = 'SpellCircleMoteRing';

/** One kind of rim mote: what it looks like and how many sit round the ring. */
export interface RimMoteKind {
    spec: MoteSpec;
    count: number;
}

/** One rim slot: which kind it is, where on the rim, its per-slot seed and when it joins (charge share). */
export interface RimMoteSlot {
    kind: number;
    angle: number;
    seed: number;
    joinAt: number;
}

const TAU = Math.PI * 2;
const TOP = -Math.PI / 2;
/** Max rim-angle jitter either way (radians), as in the particle studio's ring. */
const SLOT_JITTER = 0.15;
/** Charge share over which the motes join (after a short gap for the ring to form). */
const JOIN_START = 0.05;
const JOIN_SPAN = 0.55;
/** Pixels the motes burst outward over the linger. */
const CAST_BURST_PX = 18;

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

function isRimMoteKind(v: unknown): v is RimMoteKind {
    if (!v || typeof v !== 'object') return false;
    const k = v as Partial<RimMoteKind>;
    return typeof k.count === 'number' && !!k.spec && typeof k.spec === 'object';
}

/** The `rimMotes` list from effect data, ignoring malformed entries. */
export function readRimMotes(data: Record<string, unknown> | undefined): RimMoteKind[] {
    const raw = data?.rimMotes;
    return Array.isArray(raw) ? raw.filter(isRimMoteKind) : [];
}

/**
 * Rim slots for `kinds`. Kind `i` has `count` slots spaced evenly from the top, offset by `i / kinds.length`
 * of a step so the kinds interleave, each nudged by a stable jitter. Join order is a stable shuffle, so the
 * ring fills in all round rather than sweeping.
 */
export function moteRingSlots(kinds: readonly RimMoteKind[]): RimMoteSlot[] {
    const slots: RimMoteSlot[] = [];
    kinds.forEach((kind, i) => {
        const count = Math.max(0, Math.floor(kind.count));
        for (let k = 0; k < count; k++) {
            const seed = hashMoteSeed(`rim:${i}:${k}`);
            const jitter = ((seed % 1000) / 1000 - 0.5) * 2 * SLOT_JITTER;
            const angle = TOP + ((k + i / kinds.length) / count) * TAU + jitter;
            const order = (hashMoteSeed(`join:${i}:${k}`) % 10007) / 10007;
            slots.push({ kind: i, angle, seed, joinAt: JOIN_START + order * JOIN_SPAN });
        }
    });
    return slots;
}

/** Slots per `rimMotes` array (style data is shared by every circle of a style, so this is a handful). */
const slotCache = new WeakMap<object, { kinds: RimMoteKind[]; slots: RimMoteSlot[] }>();

function cachedSlots(data: Record<string, unknown> | undefined): { kinds: RimMoteKind[]; slots: RimMoteSlot[] } {
    const raw = data?.rimMotes;
    if (raw && typeof raw === 'object') {
        const hit = slotCache.get(raw);
        if (hit) return hit;
    }
    const kinds = readRimMotes(data);
    const entry = { kinds, slots: moteRingSlots(kinds) };
    if (raw && typeof raw === 'object') slotCache.set(raw, entry);
    return entry;
}

export const moteRingSpellCircleEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const data = effect.effectData;
        const R = num(data, 'radius', 48);
        const ringColor = num(data, 'ringColor', 0x1e3a8a);
        const runeColor = num(data, 'runeColor', 0x5eead4);
        const runeTurns = num(data, 'runeTurnsPerSec', 0.25);
        const runePairs = Math.max(1, Math.floor(num(data, 'runePairs', 10)));
        const { kinds, slots } = cachedSlots(data);
        const { charge, linger } = spellCirclePhase(effect.progress, num(data, 'castAt', 1));
        const t = effect.elapsed;
        visual.alpha = castBoundAlpha(effect);

        const form = easeOutCubic(charge / 0.35);
        const flare = easeOutCubic(linger);
        const strength = linger > 0 ? 1 - flare : form;
        const ringR = R * (linger > 0 ? 1 + 0.3 * flare : 0.85 + 0.15 * form);

        // Ground tint, a soft outer band and the ring line.
        g.circle(0, 0, ringR);
        g.fill({ color: ringColor, alpha: 0.15 * strength });
        g.circle(0, 0, ringR);
        g.stroke({ color: ringColor, width: 7, alpha: 0.3 * strength });
        g.circle(0, 0, ringR);
        g.stroke({ color: ringColor, width: 2.5, alpha: 0.9 * strength });

        // Rune band: a short dash then a long one per pair (the studio's "2 5 7 5" dash), turning.
        const runeR = ringR * 0.78;
        const spin = t * runeTurns * TAU;
        const step = TAU / runePairs;
        const dashes: [number, number][] = [
            [0, 2 / 19],
            [7 / 19, 14 / 19],
        ];
        for (let i = 0; i < runePairs; i++) {
            const base = TOP + spin + i * step;
            for (const [a0, a1] of dashes) {
                const s = base + a0 * step;
                const e = base + a1 * step;
                // Start a fresh sub-path, or the arc joins the previous point with a straight line.
                g.moveTo(Math.cos(s) * runeR, Math.sin(s) * runeR);
                g.arc(0, 0, runeR, s, e);
            }
        }
        g.stroke({ color: runeColor, width: 1.4, alpha: 0.8 * strength, cap: 'round' });

        // Rim motes: each joins as the charge builds, then loops at its slot; at the cast they burst outward.
        for (const slot of slots) {
            const spec = kinds[slot.kind]!.spec;
            const joined = linger > 0 ? 1 : clamp01((charge - slot.joinAt) / 0.12);
            if (joined <= 0) continue;
            const pose = loopingMotePose(spec, slot.seed, t);
            const out = ringR + CAST_BURST_PX * flare;
            const x = Math.cos(slot.angle) * out + pose.dx;
            const y = Math.sin(slot.angle) * out + pose.dy;
            drawMote(g, x, y, pose.size, spec.color, spec.glowColor, joined * strength * pose.alpha, {
                shape: spec.shape,
                angle: pose.angle,
            });
        }
    },
};
