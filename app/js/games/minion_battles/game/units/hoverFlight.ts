/**
 * Low hover flight: a unit rises a short way, holds that height, then travels in a straight
 * line until its distance runs out or it hits something solid. Force Push is the first user.
 * The body stays serializable; hit reactions are registered by ability id so a checkpoint
 * mid-flight still damages and bounces.
 */

import type { EventBus } from '../EventBus';
import type { Effect } from '../effects/Effect';
import type { TerrainManager } from '../../terrain/TerrainManager';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { computeForcedDisplacement } from '../forceMove';
import { areAllies, type TeamId } from '../teams';
import type { Unit } from './Unit';
import { hasUnitTag, isImmuneToForcedMovement, UnitTag } from './unitTag';
import type { KnockbackSource } from './unitTypes';
import { reflectVectorOffTerrain, sweepCircleSegmentAgainstCircle } from './unitKnockback';

export type HoverFlightPhase = 'lift' | 'flight' | 'fall';

export interface HoverFlightState {
    phase: HoverFlightPhase;
    /** Render height while held (px). Lift eases up to this; fall eases back to 0. */
    hoverHeight: number;
    phaseElapsed: number;
    liftDuration: number;
    fallDuration: number;
    vx: number;
    vy: number;
    speed: number;
    distanceRemaining: number;
    distanceTraveled: number;
    /** Sweep radius for unit hits. */
    collisionRadius: number;
    /** Px of travel before unit hits count, so a lift next to the caster does not instantly collide. */
    collisionGrace: number;
    source: KnockbackSource;
    casterTeamId: TeamId;
    /** Enemies already passed through this flight. */
    passedUnitIds: string[];
}

export interface HoverFlightEngine {
    gameTime: number;
    roundNumber?: number;
    eventBus: EventBus;
    units?: readonly Unit[];
    terrainManager?: TerrainManager | null;
    addEffect?: (effect: Effect) => void;
    interruptUnitAndRefundAbilities?: (unit: Unit) => void;
    getUnit?: (id: string) => Unit | undefined;
}

export interface HoverFlightUnitContact {
    mover: Unit;
    other: Unit;
    response: 'pass' | 'ricochet';
    impact: { x: number; y: number };
    /** Unit vector of the mover's velocity at the moment of contact. */
    travelDir: { x: number; y: number };
}

export interface HoverFlightWallContact {
    mover: Unit;
    impact: { x: number; y: number };
    tile: { col: number; row: number };
    /** Unit vector the body should bounce along. */
    reflectedDir: { x: number; y: number };
    kind: 'terrain' | 'structure';
}

export interface HoverFlightHandler {
    onUnit(contact: HoverFlightUnitContact, engine: HoverFlightEngine): void;
    onWall(contact: HoverFlightWallContact, engine: HoverFlightEngine): void;
}

const handlers = new Map<string, HoverFlightHandler>();

/** Register the ability that should react when a flight it started hits something. */
export function registerHoverFlightHandler(abilityId: string, handler: HoverFlightHandler): void {
    handlers.set(abilityId, handler);
}

export interface BeginHoverLiftParams {
    hoverHeight: number;
    liftDuration: number;
    fallDuration: number;
    collisionRadius: number;
    collisionGrace: number;
    source: KnockbackSource;
    casterTeamId: TeamId;
}

/** Start the rise. Structures never leave the ground. Replaces any flight already on the unit. */
export function beginHoverLift(unit: Unit, params: BeginHoverLiftParams): boolean {
    if (isImmuneToForcedMovement(unit)) return false;
    unit.knockback = null;
    unit.hoverFlight = {
        phase: 'lift',
        hoverHeight: params.hoverHeight,
        phaseElapsed: 0,
        liftDuration: params.liftDuration,
        fallDuration: params.fallDuration,
        vx: 0,
        vy: 0,
        speed: 0,
        distanceRemaining: 0,
        distanceTraveled: 0,
        collisionRadius: params.collisionRadius,
        collisionGrace: params.collisionGrace,
        source: { ...params.source },
        casterTeamId: params.casterTeamId,
        passedUnitIds: [],
    };
    unit.invalidateMovementPath();
    return true;
}

/** Point a held lift along `direction` and start the fast carry. */
export function launchHoverFlight(
    unit: Unit,
    direction: { x: number; y: number },
    speed: number,
    maxDistance: number,
): boolean {
    const state = unit.hoverFlight;
    if (!state || state.phase !== 'lift') return false;
    const len = Math.hypot(direction.x, direction.y);
    if (len < 1e-6 || speed <= 0 || maxDistance <= 0) return false;
    state.phase = 'flight';
    state.phaseElapsed = 0;
    state.speed = speed;
    state.vx = (direction.x / len) * speed;
    state.vy = (direction.y / len) * speed;
    state.distanceRemaining = maxDistance;
    return true;
}

/** Drop in place. Used when the cast is interrupted before the fling. */
export function cancelHoverFlight(unit: Unit): void {
    const state = unit.hoverFlight;
    if (!state || state.phase === 'fall') return;
    beginFall(state);
}

export function getHoverFlightRenderHeight(state: HoverFlightState): number {
    if (state.phase === 'lift') {
        const progress = state.liftDuration > 0
            ? Math.min(1, state.phaseElapsed / state.liftDuration)
            : 1;
        return state.hoverHeight * progress;
    }
    if (state.phase === 'flight') return state.hoverHeight;
    const progress = state.fallDuration > 0
        ? Math.min(1, state.phaseElapsed / state.fallDuration)
        : 1;
    return state.hoverHeight * (1 - progress);
}

export function serializeHoverFlight(state: HoverFlightState): HoverFlightState {
    return {
        ...state,
        source: { ...state.source },
        passedUnitIds: [...state.passedUnitIds],
    };
}

export function hoverFlightFromJSON(raw: unknown): HoverFlightState | null {
    if (!raw || typeof raw !== 'object') return null;
    const data = raw as Partial<HoverFlightState>;
    if (data.phase !== 'lift' && data.phase !== 'flight' && data.phase !== 'fall') return null;
    if (!data.source || typeof data.source.unitId !== 'string' || typeof data.source.abilityId !== 'string') {
        return null;
    }
    return {
        phase: data.phase,
        hoverHeight: num(data.hoverHeight),
        phaseElapsed: num(data.phaseElapsed),
        liftDuration: num(data.liftDuration),
        fallDuration: num(data.fallDuration),
        vx: num(data.vx),
        vy: num(data.vy),
        speed: num(data.speed),
        distanceRemaining: num(data.distanceRemaining),
        distanceTraveled: num(data.distanceTraveled),
        collisionRadius: num(data.collisionRadius),
        collisionGrace: num(data.collisionGrace),
        source: { unitId: data.source.unitId, abilityId: data.source.abilityId },
        casterTeamId: (data.casterTeamId ?? 'player') as TeamId,
        passedUnitIds: Array.isArray(data.passedUnitIds)
            ? data.passedUnitIds.filter((id): id is string => typeof id === 'string')
            : [],
    };
}

/** Advance lift, flight, or fall. Flight reactions run through the registered ability handler. */
export function updateHoverFlight(unit: Unit, dt: number, engine: HoverFlightEngine): void {
    const state = unit.hoverFlight;
    if (!state) return;
    if (!unit.isAlive() || dt <= 0) {
        unit.hoverFlight = null;
        return;
    }

    if (state.phase === 'lift') {
        state.phaseElapsed += dt;
        return;
    }

    if (state.phase === 'fall') {
        state.phaseElapsed += dt;
        if (state.phaseElapsed >= state.fallDuration) unit.hoverFlight = null;
        return;
    }

    const step = Math.min(state.speed * dt, state.distanceRemaining);
    if (step <= 1e-6) {
        beginFall(state);
        return;
    }

    const speed = Math.hypot(state.vx, state.vy);
    if (speed < 1e-6) {
        beginFall(state);
        return;
    }
    const ux = state.vx / speed;
    const uy = state.vy / speed;
    const startX = unit.x;
    const startY = unit.y;
    const destX = startX + ux * step;
    const destY = startY + uy * step;
    const terrainManager = engine.terrainManager ?? null;
    const grid = terrainManager?.grid ?? null;
    const disp = computeForcedDisplacement(startX, startY, destX, destY, step, {
        terrainManager,
        grid,
        forced: true,
        // Match the probe to this tick's step. The default 4px probe reports a short
        // move on open ground and was read as a wall hit.
        step,
    });
    const blocked = disp.distance < step - 1e-3;
    const endX = startX + ux * disp.distance;
    const endY = startY + uy * disp.distance;

    // Resolve every body this segment reaches. A pass keeps going; a ricochet or a solid body stops it.
    for (let i = 0; i < 4; i++) {
        const contact = findUnitContact(unit, state, endX, endY, engine);
        if (!contact) break;
        if (contact.kind === 'pass') {
            state.passedUnitIds.push(contact.other.id);
            handlers.get(state.source.abilityId)?.onUnit({
                mover: unit,
                other: contact.other,
                response: 'pass',
                impact: { x: contact.contactX, y: contact.contactY },
                travelDir: { x: ux, y: uy },
            }, engine);
            if (!unit.hoverFlight || unit.hoverFlight.phase !== 'flight') return;
            continue;
        }
        const travel = Math.hypot(contact.contactX - startX, contact.contactY - startY);
        state.distanceTraveled += travel;
        state.distanceRemaining = Math.max(0, state.distanceRemaining - travel);
        if (contact.kind === 'stop') {
            unit.x = contact.contactX;
            unit.y = contact.contactY;
            finishOnSolid(unit, state, engine, {
                impact: { x: contact.contactX, y: contact.contactY },
                reflectedDir: reflectOffNormal(state.vx, state.vy, contact.nx, contact.ny),
                kind: 'structure',
                tile: tileOf(contact.contactX, contact.contactY),
            });
            return;
        }
        const gap = state.collisionRadius + contact.other.radius + 0.5;
        unit.x = contact.other.x + contact.nx * gap;
        unit.y = contact.other.y + contact.ny * gap;
        const reflected = reflectVelocity(state.vx, state.vy, contact.nx, contact.ny);
        state.vx = reflected.x;
        state.vy = reflected.y;
        state.speed = Math.hypot(state.vx, state.vy);
        handlers.get(state.source.abilityId)?.onUnit({
            mover: unit,
            other: contact.other,
            response: 'ricochet',
            impact: { x: contact.contactX, y: contact.contactY },
            travelDir: { x: ux, y: uy },
        }, engine);
        return;
    }

    if (!unit.hoverFlight || unit.hoverFlight.phase !== 'flight') return;

    unit.x = endX;
    unit.y = endY;
    state.distanceTraveled += disp.distance;
    state.distanceRemaining = Math.max(0, state.distanceRemaining - disp.distance);

    if (blocked) {
        finishOnSolid(unit, state, engine, {
            impact: { x: unit.x, y: unit.y },
            reflectedDir: reflectedTerrainDir(state.vx, state.vy, ux * step, uy * step),
            kind: 'terrain',
            tile: blockingTile(startX, startY, ux, uy, disp.distance),
        });
        return;
    }

    if (state.distanceRemaining <= 1e-3) beginFall(state);
}

function beginFall(state: HoverFlightState): void {
    state.phase = 'fall';
    state.phaseElapsed = 0;
    state.vx = 0;
    state.vy = 0;
    state.speed = 0;
    state.distanceRemaining = 0;
}

function finishOnSolid(
    unit: Unit,
    state: HoverFlightState,
    engine: HoverFlightEngine,
    contact: Omit<HoverFlightWallContact, 'mover'>,
): void {
    handlers.get(state.source.abilityId)?.onWall({ mover: unit, ...contact }, engine);
    if (unit.hoverFlight === state) unit.hoverFlight = null;
}

interface UnitContact {
    other: Unit;
    kind: 'pass' | 'ricochet' | 'stop';
    contactX: number;
    contactY: number;
    nx: number;
    ny: number;
    t: number;
}

function findUnitContact(
    mover: Unit,
    state: HoverFlightState,
    endX: number,
    endY: number,
    engine: HoverFlightEngine,
): UnitContact | null {
    const units = engine.units;
    if (!units) return null;
    let best: UnitContact | null = null;
    for (const other of units) {
        const kind = classifyHit(mover, other, state, engine.gameTime);
        if (kind === 'ignore') continue;
        if (kind === 'pass' && state.passedUnitIds.includes(other.id)) continue;
        const t = sweepCircleSegmentAgainstCircle(
            mover.x,
            mover.y,
            endX,
            endY,
            state.collisionRadius,
            other.x,
            other.y,
            other.radius,
        );
        if (t === null) continue;
        // Already inside someone at the start of the carry: skip that overlap so the lift
        // doesn't detonate on a neighbour. A real crossing (t > 0) still counts.
        if (t === 0 && state.distanceTraveled < state.collisionGrace) continue;
        if (!best || t < best.t) {
            const dx = endX - mover.x;
            const dy = endY - mover.y;
            const contactX = mover.x + dx * t;
            const contactY = mover.y + dy * t;
            const nxRaw = contactX - other.x;
            const nyRaw = contactY - other.y;
            const nLen = Math.hypot(nxRaw, nyRaw);
            const nx = nLen < 1e-6 ? 1 : nxRaw / nLen;
            const ny = nLen < 1e-6 ? 0 : nyRaw / nLen;
            best = { other, kind, contactX, contactY, nx, ny, t };
        }
    }
    return best;
}

function classifyHit(
    mover: Unit,
    other: Unit,
    state: HoverFlightState,
    gameTime: number,
): 'ignore' | 'pass' | 'ricochet' | 'stop' {
    if (other === mover || !other.isAlive()) return 'ignore';
    if (other.id === state.source.unitId) return 'ignore';
    if (other.hasIFrames(gameTime)) return 'ignore';
    if (isImmuneToForcedMovement(other) || hasUnitTag(other, UnitTag.Structure)) return 'stop';
    if (areAllies(state.casterTeamId, other.teamId)) return 'ricochet';
    return 'pass';
}

function reflectVelocity(vx: number, vy: number, nx: number, ny: number): { x: number; y: number } {
    const dot = vx * nx + vy * ny;
    return { x: vx - 2 * dot * nx, y: vy - 2 * dot * ny };
}

function reflectOffNormal(vx: number, vy: number, nx: number, ny: number): { x: number; y: number } {
    const reflected = reflectVelocity(vx, vy, nx, ny);
    return normalize(reflected.x, reflected.y);
}

function reflectedTerrainDir(vx: number, vy: number, segmentDx: number, segmentDy: number): { x: number; y: number } {
    const reflected = reflectVectorOffTerrain(vx, vy, 0, 0, () => true, segmentDx, segmentDy);
    return normalize(reflected.x, reflected.y);
}

function normalize(x: number, y: number): { x: number; y: number } {
    const len = Math.hypot(x, y);
    if (len < 1e-6) return { x: 1, y: 0 };
    return { x: x / len, y: y / len };
}

function tileOf(x: number, y: number): { col: number; row: number } {
    return { col: Math.floor(x / CELL_SIZE), row: Math.floor(y / CELL_SIZE) };
}

/** The cell just past the last passable point, which is the wall that stopped the body. */
function blockingTile(
    startX: number,
    startY: number,
    ux: number,
    uy: number,
    safeDistance: number,
): { col: number; row: number } {
    return tileOf(startX + ux * (safeDistance + 1), startY + uy * (safeDistance + 1));
}

function num(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
