/**
 * Gravity — the unit bends local gravitational fields, storing tidal energy.
 * This energy warps projectile paths, slams enemies downward,
 * or launches allies and foes into the air.
 *
 * Gravity builds passively from grazing — standing near enemy units and
 * projectiles fills the meter continuously, with projectiles paying out more.
 */

import { Resource } from './Resource';
import type { EventBus } from '../game/EventBus';
import type { Unit } from '../game/units/Unit';
import type { EngineContext } from '../game/EngineContext';
import { areEnemies } from '../game/teams';
import { ROUND_DURATION } from '../game/gameConstants';
import {
    GRAVITY_GRAZE_MAX_DISTANCE,
    GRAVITY_GRAZE_MIN_DISTANCE,
    GRAVITY_MAX_PER_ROUND_PROJECTILES,
    GRAVITY_MAX_PER_ROUND_UNITS,
    GRAVITY_MIN_PER_ROUND,
} from '../card_defs/09_gravity_core/gravityConstants';

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

function lerp(from: number, to: number, t: number): number {
    return from + (to - from) * t;
}

function edgeToEdgeDistance(
    ax: number,
    ay: number,
    aRadius: number,
    bx: number,
    by: number,
    bRadius: number,
): number {
    const centerDist = Math.hypot(bx - ax, by - ay);
    return Math.max(0, centerDist - aRadius - bRadius);
}

function grazeRatePerRound(grazeDistance: number, maxPerRound: number): number {
    const span = GRAVITY_GRAZE_MAX_DISTANCE - GRAVITY_GRAZE_MIN_DISTANCE;
    const t = span <= 0
        ? 1
        : clamp01((grazeDistance - GRAVITY_GRAZE_MIN_DISTANCE) / span);
    return lerp(maxPerRound, GRAVITY_MIN_PER_ROUND, t);
}

function nearestEnemyUnitGrazeDistance(owner: Unit, engine: EngineContext): number | null {
    let nearest: number | null = null;
    for (const other of engine.units) {
        if (other.id === owner.id || !other.isAlive() || !areEnemies(owner.teamId, other.teamId)) {
            continue;
        }
        const dist = edgeToEdgeDistance(owner.x, owner.y, owner.radius, other.x, other.y, other.radius);
        if (nearest === null || dist < nearest) nearest = dist;
    }
    return nearest;
}

function nearestEnemyProjectileGrazeDistance(owner: Unit, engine: EngineContext): number | null {
    let nearest: number | null = null;
    for (const projectile of engine.projectiles) {
        if (!projectile.active || !areEnemies(owner.teamId, projectile.sourceTeamId)) continue;
        const dist = edgeToEdgeDistance(
            owner.x,
            owner.y,
            owner.radius,
            projectile.x,
            projectile.y,
            projectile.radius,
        );
        if (nearest === null || dist < nearest) nearest = dist;
    }
    return nearest;
}

export function computeGravityGrazeRatePerRound(owner: Unit, engine: EngineContext): number {
    const unitDist = nearestEnemyUnitGrazeDistance(owner, engine);
    const projectileDist = nearestEnemyProjectileGrazeDistance(owner, engine);

    const rateUnits = unitDist === null
        ? 0
        : grazeRatePerRound(unitDist, GRAVITY_MAX_PER_ROUND_UNITS);
    const rateProjectiles = projectileDist === null
        ? 0
        : grazeRatePerRound(projectileDist, GRAVITY_MAX_PER_ROUND_PROJECTILES);

    return Math.max(rateUnits, rateProjectiles, GRAVITY_MIN_PER_ROUND);
}

/** Convert a per-round graze rate to gravity gained per second. */
export function gravityGrazeRatePerSecond(ratePerRound: number): number {
    return ratePerRound / ROUND_DURATION;
}

export class Gravity extends Resource {
    readonly id = 'gravity';
    readonly name = 'Gravity';
    readonly color = '#a855f7'; // purple-500
    readonly iconName = 'Atom';

    private _unit: Unit | null = null;
    private _engine: EngineContext | null = null;

    constructor() {
        super(0, 100);
    }

    /** Live per-second graze gain from current proximity. Used by the tooltip. */
    get perSecondGain(): number {
        if (!this._unit || !this._engine) return 0;
        return gravityGrazeRatePerSecond(computeGravityGrazeRatePerRound(this._unit, this._engine));
    }

    primeDisplayContext(unit: Unit, engine: EngineContext): void {
        this._unit = unit;
        this._engine = engine;
    }

    onTick(unit: Unit, engine: EngineContext, dt: number): void {
        this.primeDisplayContext(unit, engine);
        const ratePerRound = computeGravityGrazeRatePerRound(unit, engine);
        this.add(ratePerRound * dt / ROUND_DURATION);
    }

    protected subscribe(_unit: Unit, _eventBus: EventBus): void {
        // Grazing is handled via onTick (needs engine context for proximity lookups).
    }

    protected unsubscribe(_eventBus: EventBus): void {
        this._unit = null;
        this._engine = null;
    }
}
