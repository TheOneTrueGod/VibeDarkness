/**
 * Beam — reusable CastBehaviour for a sustained laser: one or more parallel rays that each stop at
 * the FIRST thing in their path (a wall, or any unit, friend or foe) and hurt what they stop on in
 * pulses (boss lasers, a held flamethrower, a turret's focusing beam).
 *
 * - Rays: one per point from `origins` (re-read every pulse, so the emitters may move), all pointing the
 *   same way. Each ray is a thin capsule of `rayRadius`; it stops at walls (projectile-obstructing
 *   terrain, or the map edge) and at the first unit it touches. `passThrough` lists units rays ignore
 *   (default: the caster); units with iFrames (dodging) or `UnitTag.Invincible` are always ignored.
 * - Aim: the direction is taken from the rays' centre toward `aim` when the window opens. With
 *   `turnRateDegPerSec` it then keeps turning toward `aim` at that rate (a slow sweep that follows a
 *   target); without it the beam stays locked. The angle lives in the behaviour payload (serialized).
 * - Pulses: same schedule maths as `Pulse` (`everySeconds`, `firstPulseAt`, default 0 = fire on entry).
 *   Each pulse, every unit some ray stopped on is attacked ONCE through `tryDamageOrBlock` with the
 *   attack coming from that ray's origin, so a facing shield blocks it, and because the ray stopped
 *   on the shield-bearer, everyone behind is covered too. Allies of the caster block rays but take no
 *   damage. A landed hit nudges the victim `pushPx` along the beam without interrupting it
 *   (`applyNudgeToUnit`); a blocked hit nudges `pushOnBlockPx` (default 0).
 * - `rockHitsToBreak` makes rays chip the rock they stop on (once per rock cell per pulse).
 * - `onPulse` receives the resolved rays (for VFX), whether or not anything was hit.
 *
 * Give the ability `hitImpact: { hitstopSeconds: 0, hitstunSeconds: 0 }` unless every pulse should
 * freeze its victim.
 */

import type { Unit } from '../../game/units/Unit';
import { hasUnitTag, UnitTag } from '../../game/units/unitTag';
import { applyNudgeToUnit } from '../../game/units/unitNudge';
import type { CastBehaviour, CastBehaviourTickContext } from '../castBehaviourTypes';
import { tryDamageOrBlock, type DamageOutcome } from '../blockingHelpers';
import { pulsesLandedBy, type PulseConfig } from './PulseBehaviour';
import { FIXED_DT } from '../../game/gameConstants';

type Point = { x: number; y: number };

export interface BeamRay {
    origin: Point;
    /** Where the ray stopped (wall, unit edge, or full length). */
    end: Point;
    /** The unit the ray stopped on, if any. */
    hitUnitId?: string;
    /** The obstructing terrain cell the ray stopped at (not set for the map edge or a unit). */
    wallCell?: { col: number; row: number };
}

export interface BeamConfig {
    /** Seconds between damage pulses. */
    everySeconds: number;
    /** Length of the timing window this behaviour runs in, in seconds. */
    windowSeconds: number;
    /** Seconds into the window of the first pulse (default 0: fire on entry). */
    firstPulseAt?: number;
    /** One ray starts at each of these points. */
    origins: (ctx: CastBehaviourTickContext) => Point[];
    /** What the beam points (and, with a turn rate, turns) toward. Null holds the current angle. */
    aim: (ctx: CastBehaviourTickContext) => Point | null;
    /** Max turn speed while tracking `aim`; omit to lock the beam when the window opens. */
    turnRateDegPerSec?: number;
    /** Ray length (px). */
    length: number;
    /** Ray half-thickness (px) for touching units. Default 3. */
    rayRadius?: number;
    /** Damage per pulse to each enemy a ray stops on. */
    damage: number | ((ctx: CastBehaviourTickContext, unit: Unit) => number);
    /** Push (px) along the beam on a landed pulse. Default 0. */
    pushPx?: number;
    /** Push (px) along the beam on a blocked pulse. Default 0. */
    pushOnBlockPx?: number;
    /** Seconds each push takes. Default `everySeconds`. */
    pushSeconds?: number;
    /** Units the rays pass straight through (default: only the caster). */
    passThrough?: (unit: Unit, ctx: CastBehaviourTickContext) => boolean;
    /**
     * Rays stopped by intact rock chip it so a full-health rock breaks after this many pulses (each rock
     * cell is chipped once per pulse however many rays end on it). Omit: rock only blocks.
     */
    rockHitsToBreak?: number;
    onHit?: (ctx: CastBehaviourTickContext, unit: Unit, outcome: DamageOutcome) => void;
    onPulse?: (ctx: CastBehaviourTickContext, rays: BeamRay[]) => void;
}

export interface BeamPayload {
    /** Current beam direction, radians. */
    angle: number;
}

const WALL_STEP_PX = 4;

function centroid(points: readonly Point[], fallback: Point): Point {
    if (points.length === 0) return fallback;
    let x = 0;
    let y = 0;
    for (const p of points) {
        x += p.x;
        y += p.y;
    }
    return { x: x / points.length, y: y / points.length };
}

function shortestAngleDelta(from: number, to: number): number {
    let d = to - from;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
}

/** Distance along a ray (unit dir) to where it first touches a circle, or null if it never does. */
export function rayCircleEntry(o: Point, dir: Point, c: Point, r: number, maxLen: number): number | null {
    const fx = o.x - c.x;
    const fy = o.y - c.y;
    const b = fx * dir.x + fy * dir.y;
    const cc = fx * fx + fy * fy - r * r;
    if (cc <= 0) return 0; // starts inside
    const disc = b * b - cc;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    if (t < 0 || t > maxLen) return null;
    return t;
}

/**
 * Distance along a ray to the first projectile-obstructing sample (or the map edge), capped at maxLen,
 * plus the obstructing cell (null for the edge or a clear ray).
 */
function wallHit(
    ctx: CastBehaviourTickContext,
    o: Point,
    dir: Point,
    maxLen: number,
): { dist: number; cell: { col: number; row: number } | null } {
    const tm = ctx.engine.terrainManager;
    if (!tm) return { dist: maxLen, cell: null };
    const { width, height, cellSize } = tm.getGridSize();
    const W = width * cellSize;
    const H = height * cellSize;
    for (let d = WALL_STEP_PX; d <= maxLen; d += WALL_STEP_PX) {
        const x = o.x + dir.x * d;
        const y = o.y + dir.y * d;
        const edge = x < 0 || y < 0 || x >= W || y >= H;
        if (edge || tm.isProjectileObstructedAt(x, y)) {
            return {
                dist: Math.max(0, d - WALL_STEP_PX),
                cell: edge ? null : { col: Math.floor(x / cellSize), row: Math.floor(y / cellSize) },
            };
        }
    }
    return { dist: maxLen, cell: null };
}

export class BeamBehaviour implements CastBehaviour {
    constructor(private readonly config: BeamConfig) {}

    private pulseConfig(): PulseConfig {
        return {
            everySeconds: this.config.everySeconds,
            windowSeconds: this.config.windowSeconds,
            firstPulseAt: this.config.firstPulseAt ?? 0,
        };
    }

    /** Resolve where each ray stops right now. Pure read of the engine (exported for previews/tests). */
    resolveRays(ctx: CastBehaviourTickContext, angle: number): BeamRay[] {
        const dir = { x: Math.cos(angle), y: Math.sin(angle) };
        const rayR = this.config.rayRadius ?? 3;
        const gameTime = ctx.engine.gameTime;
        const blockers = ctx.engine.units.filter(
            (u) =>
                u.isAlive() &&
                u.id !== ctx.caster.id &&
                !hasUnitTag(u, UnitTag.Invincible) &&
                !u.hasIFrames(gameTime) &&
                !(this.config.passThrough?.(u, ctx) ?? false),
        );
        return this.config.origins(ctx).map((origin) => {
            const wall = wallHit(ctx, origin, dir, this.config.length);
            let best = wall.dist;
            let hitUnitId: string | undefined;
            for (const u of blockers) {
                const t = rayCircleEntry(origin, dir, u, u.radius + rayR, best);
                if (t !== null && t < best) {
                    best = t;
                    hitUnitId = u.id;
                }
            }
            return {
                origin: { x: origin.x, y: origin.y },
                end: { x: origin.x + dir.x * best, y: origin.y + dir.y * best },
                ...(hitUnitId ? { hitUnitId } : {}),
                ...(!hitUnitId && wall.cell ? { wallCell: wall.cell } : {}),
            };
        });
    }

    /** Current beam angle from the payload (null before the window opens). */
    static readAngle(behaviourPayload: unknown): number | null {
        const p = behaviourPayload as Partial<BeamPayload> | undefined;
        return typeof p?.angle === 'number' ? p.angle : null;
    }

    onTick(ctx: CastBehaviourTickContext): void {
        let angle = BeamBehaviour.readAngle(ctx.behaviourPayload);
        const aim = this.config.aim(ctx);
        if (angle === null) {
            const c = centroid(this.config.origins(ctx), ctx.caster);
            angle = aim ? Math.atan2(aim.y - c.y, aim.x - c.x) : 0;
        } else if (aim && this.config.turnRateDegPerSec !== undefined) {
            const c = centroid(this.config.origins(ctx), ctx.caster);
            const want = Math.atan2(aim.y - c.y, aim.x - c.x);
            const maxStep = ((this.config.turnRateDegPerSec * Math.PI) / 180) * (ctx.localDt ?? FIXED_DT);
            const delta = shortestAngleDelta(angle, want);
            angle += Math.max(-maxStep, Math.min(maxStep, delta));
        }
        ctx.setBehaviourPayload({ angle } satisfies BeamPayload);

        const pc = this.pulseConfig();
        const landedBefore = ctx.isFirstTick ? 0 : pulsesLandedBy(ctx.prevWindowProgress * pc.windowSeconds, pc);
        const landedNow = pulsesLandedBy(ctx.windowProgress * pc.windowSeconds, pc);
        for (let k = landedBefore; k < landedNow; k++) this.firePulse(ctx, angle);
    }

    private firePulse(ctx: CastBehaviourTickContext, angle: number): void {
        const rays = this.resolveRays(ctx, angle);
        const dir = { x: Math.cos(angle), y: Math.sin(angle) };
        const struck = new Map<string, Point>();
        for (const ray of rays) {
            if (ray.hitUnitId && !struck.has(ray.hitUnitId)) struck.set(ray.hitUnitId, ray.origin);
        }
        const pushSec = this.config.pushSeconds ?? this.config.everySeconds;
        for (const [unitId, origin] of struck) {
            const unit = ctx.engine.getUnit(unitId);
            if (!unit?.isAlive() || unit.teamId === ctx.caster.teamId) continue;
            const damage = typeof this.config.damage === 'function' ? this.config.damage(ctx, unit) : this.config.damage;
            const outcome = tryDamageOrBlock(unit, {
                engine: ctx.engine,
                gameTime: ctx.engine.gameTime,
                eventBus: ctx.engine.eventBus,
                attackerX: origin.x,
                attackerY: origin.y,
                attackerId: ctx.caster.id,
                abilityId: ctx.abilityId,
                damage,
                attackType: 'melee',
            });
            const push = outcome.hit ? (this.config.pushPx ?? 0) : (this.config.pushOnBlockPx ?? 0);
            if (push > 0 && unit.isAlive()) applyNudgeToUnit(unit, { x: dir.x * push, y: dir.y * push }, pushSec);
            this.config.onHit?.(ctx, unit, outcome);
        }
        this.chipRock(ctx, rays);
        this.config.onPulse?.(ctx, rays);
    }

    private chipRock(ctx: CastBehaviourTickContext, rays: readonly BeamRay[]): void {
        const hits = this.config.rockHitsToBreak;
        const tm = ctx.engine.terrainManager;
        if (hits === undefined || !tm) return;
        const seen = new Set<string>();
        for (const ray of rays) {
            const cell = ray.wallCell;
            if (!cell) continue;
            const key = `${cell.col},${cell.row}`;
            if (seen.has(key)) continue;
            seen.add(key);
            tm.damageRockByHits(cell.col, cell.row, hits, ctx.caster.id);
        }
    }
}

export function Beam(config: BeamConfig): BeamBehaviour {
    return new BeamBehaviour(config);
}
