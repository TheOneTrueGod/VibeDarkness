/**
 * Buff particle auras - render-only particles emitted from a unit while it holds a buff that declares
 * `Buff.particleAura`. Two states, chosen each render frame:
 *
 * - **idle**: tiny orbs spawned just inside the unit's radius, drifting outward.
 * - **moving**: short speed lines spawned behind the unit, drifting backward (opposite the travel direction).
 *
 * Driven from `GameEngine.doRenderTick(realDt)`, so emission runs on wall time and keeps going while the game is
 * paused (order phases, ITS). "Moving" also counts a unit that still has a movement path, so a paused unit with
 * a queued move keeps showing speed lines in its travel direction.
 *
 * Purely visual: nothing here is serialized or touches engine RNG. Spawn jitter uses a small per-unit hash RNG
 * (Math.random is not used in game/). State is derived from buffs every frame, so it is reconnect-safe.
 */

import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { Effect } from './Effect';
import type { Unit } from '../units/Unit';

export const TEMPO_ORB_EFFECT_TYPE = 'TempoOrb';
export const TEMPO_SPEED_LINE_EFFECT_TYPE = 'TempoSpeedLine';

/** Idle state: orbs that spawn just inside the radius and drift outward. */
export interface BuffAuraIdleSpec {
    ratePerSec: number;
    /** Spawn distance from the unit centre as a fraction of its radius (just under 1 = slightly inside). */
    spawnRadiusFrac: number;
    /** How far an orb drifts outward over its life (px). */
    travelPx: number;
    durationSec: number;
    /** Orb core radius (px). */
    sizePx: number;
}

/** Moving state: speed lines that spawn behind the unit and drift backward while fading. */
export interface BuffAuraMovingSpec {
    ratePerSec: number;
    /** Spawn distance behind the centre, as a fraction of the radius. */
    behindFrac: number;
    /** Sideways spread either side of the travel axis, as a fraction of the radius. */
    spreadFrac: number;
    /** How far a line drifts backward over its life (px). */
    travelPx: number;
    durationSec: number;
    lengthPx: number;
    widthPx: number;
}

export interface BuffParticleAuraDef {
    color: number;
    idle?: BuffAuraIdleSpec;
    moving?: BuffAuraMovingSpec;
}

/** Named presets. */
export const BUFF_PARTICLE_AURA_PRESETS = {
    /** Purple tempo aura (time dilation / haste): orbs at rest, speed lines in motion. */
    tempo: (color: number): BuffParticleAuraDef => ({
        color,
        idle: { ratePerSec: 12, spawnRadiusFrac: 0.8, travelPx: 14, durationSec: 0.6, sizePx: 1.6 },
        moving: {
            ratePerSec: 22,
            behindFrac: 0.55,
            spreadFrac: 0.75,
            travelPx: 16,
            durationSec: 0.32,
            lengthPx: 11,
            widthPx: 1.5,
        },
    }),
} as const;

/** Data stored on a TempoOrb effect. */
export interface TempoOrbEffectData {
    color: number;
    size: number;
}

/** Data stored on a TempoSpeedLine effect. `dir` is the unit's travel direction (unit vector). */
export interface TempoSpeedLineEffectData {
    color: number;
    dirX: number;
    dirY: number;
    length: number;
    width: number;
}

/** Below this per-frame displacement (px) a unit with no path counts as standing still. */
const MOVE_EPSILON_PX = 0.05;
/** Path waypoints closer than this are skipped when picking a travel direction. */
const WAYPOINT_MIN_DIST_PX = 3;
/** Never emit more than this many particles of one aura per frame (long frames / tab refocus). */
const MAX_EMITS_PER_FRAME = 4;

export interface AuraMotion {
    moving: boolean;
    dirX: number;
    dirY: number;
}

/**
 * Resolve whether a unit is moving and its travel direction. Uses the displacement since the last render
 * frame when there is one, else the direction toward its next path waypoint (so a paused unit with a queued
 * move still reads as moving).
 */
export function resolveAuraMotion(
    unit: Pick<Unit, 'x' | 'y' | 'movement'>,
    last: { x: number; y: number } | undefined,
): AuraMotion {
    if (last) {
        const dx = unit.x - last.x;
        const dy = unit.y - last.y;
        const d = Math.hypot(dx, dy);
        if (d > MOVE_EPSILON_PX) return { moving: true, dirX: dx / d, dirY: dy / d };
    }
    const path = unit.movement?.path;
    if (path && path.length > 0) {
        for (let i = 0; i < path.length; i++) {
            const cell = path[i]!;
            const isLast = i === path.length - 1;
            const tp = isLast ? unit.movement?.targetPixel : undefined;
            const tx = tp ? tp.x : cell.col * CELL_SIZE + CELL_SIZE / 2;
            const ty = tp ? tp.y : cell.row * CELL_SIZE + CELL_SIZE / 2;
            const dx = tx - unit.x;
            const dy = ty - unit.y;
            const d = Math.hypot(dx, dy);
            if (d > WAYPOINT_MIN_DIST_PX) return { moving: true, dirX: dx / d, dirY: dy / d };
        }
    }
    return { moving: false, dirX: 0, dirY: 0 };
}

interface AuraState {
    lastX: number;
    lastY: number;
    accum: number;
    rng: number;
    /** Frame stamp; states not touched this frame are dropped. */
    seen: number;
}

function hashSeed(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/** mulberry32 step on the state's seed; returns [0, 1). */
function nextRandom(state: AuraState): number {
    state.rng = (state.rng + 0x6d2b79f5) >>> 0;
    let t = state.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Traveling effects are constructed at their end point; place them at the start for their first draw. */
function startAtOrigin(fx: Effect, x: number, y: number): Effect {
    fx.x = x;
    fx.y = y;
    return fx;
}

function firstAura(unit: Unit): BuffParticleAuraDef | undefined {
    for (const b of unit.buffs) {
        if (b.particleAura) return b.particleAura;
    }
    return undefined;
}

/** Per-engine render-side system. Owned by `GameEngine`; never serialized. */
export class BuffParticleAuraSystem {
    private readonly states = new Map<string, AuraState>();
    private frame = 0;

    update(units: readonly Unit[], realDt: number, emit: (fx: Effect) => void): void {
        this.frame++;
        if (realDt <= 0) return;
        for (const unit of units) {
            if (!unit.active || !unit.isAlive() || unit.buffs.length === 0) continue;
            const aura = firstAura(unit);
            if (!aura) continue;
            let state = this.states.get(unit.id);
            const last = state ? { x: state.lastX, y: state.lastY } : undefined;
            if (!state) {
                state = { lastX: unit.x, lastY: unit.y, accum: 0, rng: hashSeed(unit.id), seen: this.frame };
                this.states.set(unit.id, state);
            }
            state.seen = this.frame;
            const motion = resolveAuraMotion(unit, last);
            state.lastX = unit.x;
            state.lastY = unit.y;

            const rate = motion.moving ? aura.moving?.ratePerSec ?? 0 : aura.idle?.ratePerSec ?? 0;
            if (rate <= 0) continue;
            state.accum += rate * realDt;
            let n = 0;
            while (state.accum >= 1 && n < MAX_EMITS_PER_FRAME) {
                state.accum -= 1;
                n++;
                emit(motion.moving
                    ? this.spawnSpeedLine(unit, aura, aura.moving!, motion, state)
                    : this.spawnOrb(unit, aura, aura.idle!, state));
            }
            if (state.accum >= 1) state.accum = state.accum % 1;
        }
        for (const [id, s] of this.states) {
            if (s.seen !== this.frame) this.states.delete(id);
        }
    }

    private spawnOrb(unit: Unit, aura: BuffParticleAuraDef, spec: BuffAuraIdleSpec, state: AuraState): Effect {
        const angle = nextRandom(state) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const r0 = unit.radius * spec.spawnRadiusFrac;
        const r1 = r0 + spec.travelPx * (0.7 + 0.6 * nextRandom(state));
        const data: TempoOrbEffectData = { color: aura.color, size: spec.sizePx * (0.75 + 0.5 * nextRandom(state)) };
        return startAtOrigin(new Effect({
            startX: unit.x + cos * r0,
            startY: unit.y + sin * r0,
            x: unit.x + cos * r1,
            y: unit.y + sin * r1,
            duration: spec.durationSec * (0.8 + 0.4 * nextRandom(state)),
            effectType: TEMPO_ORB_EFFECT_TYPE,
            effectData: { ...data },
        }), unit.x + cos * r0, unit.y + sin * r0);
    }

    private spawnSpeedLine(
        unit: Unit,
        aura: BuffParticleAuraDef,
        spec: BuffAuraMovingSpec,
        motion: AuraMotion,
        state: AuraState,
    ): Effect {
        const { dirX, dirY } = motion;
        const perpX = -dirY;
        const perpY = dirX;
        const side = (nextRandom(state) * 2 - 1) * unit.radius * spec.spreadFrac;
        const behind = unit.radius * spec.behindFrac * (0.8 + 0.4 * nextRandom(state));
        const sx = unit.x - dirX * behind + perpX * side;
        const sy = unit.y - dirY * behind + perpY * side;
        const travel = spec.travelPx * (0.7 + 0.6 * nextRandom(state));
        const data: TempoSpeedLineEffectData = {
            color: aura.color,
            dirX,
            dirY,
            length: spec.lengthPx * (0.7 + 0.6 * nextRandom(state)),
            width: spec.widthPx,
        };
        return startAtOrigin(new Effect({
            startX: sx,
            startY: sy,
            x: sx - dirX * travel,
            y: sy - dirY * travel,
            duration: spec.durationSec * (0.8 + 0.4 * nextRandom(state)),
            effectType: TEMPO_SPEED_LINE_EFFECT_TYPE,
            effectData: { ...data },
        }), sx, sy);
    }
}
