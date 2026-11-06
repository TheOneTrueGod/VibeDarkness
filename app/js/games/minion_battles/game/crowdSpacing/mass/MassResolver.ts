/**
 * Mass CrowdSpacing resolver: inverse-mass overlap split for every pair (players included),
 * bracing (infinite mass), a per-unit push budget tied to move speed, owner yield, and pusher-aware
 * team resistance + residuals:
 * - A unit is a pair's **pusher** when it moved toward its partner this tick (displacement since the
 *   manager's pre-movement snapshot, dotted with the pair normal, > `CROWD_MASS_PUSHER_EPSILON`).
 * - In a cross-team pair, each non-pusher's budget is divided by `CROWD_MASS_ENEMY_RESISTANCE`.
 * - The part of a share a unit could not take (budget / terrain) goes back only to partners that are
 *   pushers (uncapped: this is the wall pushback). When neither unit pushes it goes to the partner
 *   only up to that partner's spare budget; otherwise it is dropped and resolves on later ticks.
 *
 * One grid pass (shared `enumerateCrowdSpacingOverlaps`); pairs are stored so the residual sweep is
 * one more array loop with no grid queries. Per-unit records are built once per resolve.
 * Deterministic: sorted id order, deltas accumulated before any write, no randomness.
 */

import type { Unit } from '../../units/Unit';
import { areAllies } from '../../teams';
import {
    PERF_CROWD_SPACING_MASS_CLAMP,
    PERF_CROWD_SPACING_MASS_PAIRS,
    PERF_CROWD_SPACING_MASS_RESIDUAL,
    PERF_CROWD_SPACING_MASS_RESOLVE,
    tickPerformanceTracker,
} from '../../performance/tickPerformanceTracker';
import type { CrowdSpacingResolveArgs, CrowdSpacingResolver } from '../CrowdSpacingResolver';
import { applyClampedCrowdSpacingDelta, type Vec2 } from '../shared/applyClampedDelta';
import {
    enumerateCrowdSpacingOverlaps,
    indexCrowdSpacingParticipants,
} from '../shared/enumerateOverlaps';
import { isCrowdSpacingExempt } from '../shared/crowdSpacingParticipation';
import { getCrowdMass, isOwnPlayerCharacter } from './crowdMass';
import { isCrowdBraced } from './crowdBracing';
import {
    CROWD_MASS_ENEMY_RESISTANCE,
    CROWD_MASS_PUSHER_EPSILON,
    CROWD_MASS_PUSH_BUDGET_SPEED_FRACTION,
} from './massConstants';

const VERBOSE = { level: 'verbose' } as const;

export { isOwnPlayerCharacter };

/**
 * Max distance CrowdSpacing may move `unit` this tick before residuals:
 * `CROWD_MASS_PUSH_BUDGET_SPEED_FRACTION × speed × step`. `step` is the unit's local step when its
 * clock is running (hasted units shove back faster, frozen ones not at all), else the world `dt`.
 * Team resistance (non-pusher in a cross-team pair) divides this further inside the resolver.
 */
export function getCrowdPushBudget(unit: Unit, dt: number): number {
    const step = unit.localClockActive ? unit.localStep : dt;
    return Math.max(0, CROWD_MASS_PUSH_BUDGET_SPEED_FRACTION * unit.speed * step);
}

/** Per-unit data computed once per resolve. */
type MassRecord = {
    unit: Unit;
    radius: number;
    /** Size/override/boss mass (finite; bracing is tracked separately as infinite mass). */
    mass: number;
    braced: boolean;
    /** Push budget; divided by enemy resistance when `resisting`. */
    budget: number;
    /** Set when the unit is a non-pusher in at least one cross-team pair this tick. */
    resisting: boolean;
    ownPlayer: boolean;
    /** Displacement since the pre-movement snapshot (0 when there is none). */
    moveX: number;
    moveY: number;
    /** Raw requested CrowdSpacing delta (sum of pair shares). */
    dx: number;
    dy: number;
    /** Fraction of the requested delta actually applied after budget + terrain clamps, in [0, 1]. */
    scale: number;
    /** Budget left after the first application; consumed by hand-offs between two non-pushers. */
    spare: number;
    /** Residual handed over by partners (applied with one terrain clamp, no budget). */
    rx: number;
    ry: number;
};

/** One stored overlapping pair. A moves along −n by `shareA`, B along +n by `shareB`. */
type MassPair = {
    a: MassRecord;
    b: MassRecord;
    nx: number;
    ny: number;
    shareA: number;
    shareB: number;
    pusherA: boolean;
    pusherB: boolean;
};

export class MassResolver implements CrowdSpacingResolver {
    readonly mode = 'mass' as const;

    isParticipant(unit: Unit): boolean {
        return !isCrowdSpacingExempt(unit);
    }

    /**
     * Body radius only: mass mode has no player personal-space padding, so a player can close to
     * the same `radius + radius + MIN_FOLLOW_RADIUS` stop distance pursuit uses.
     */
    radius(unit: Unit): number {
        return unit.radius;
    }

    resolve(args: CrowdSpacingResolveArgs): void {
        tickPerformanceTracker.measure([PERF_CROWD_SPACING_MASS_RESOLVE], () => this.resolvePass(args));
    }

    private resolvePass(args: CrowdSpacingResolveArgs): void {
        const { participants, grid, terrainManager, dt, gameTime, tickStartPositions, onContact } = args;
        const { byId, sortedIds } = indexCrowdSpacingParticipants(participants);
        if (byId.size === 0) return;

        const engine = { gameTime };
        const records = new Map<string, MassRecord>();
        for (const id of sortedIds) {
            const unit = byId.get(id)!;
            const start = tickStartPositions?.get(id);
            records.set(id, {
                unit,
                radius: this.radius(unit),
                mass: getCrowdMass(unit),
                braced: isCrowdBraced(unit, engine),
                budget: getCrowdPushBudget(unit, dt),
                resisting: false,
                ownPlayer: isOwnPlayerCharacter(unit),
                moveX: start ? unit.x - start.x : 0,
                moveY: start ? unit.y - start.y : 0,
                dx: 0,
                dy: 0,
                scale: 1,
                spare: 0,
                rx: 0,
                ry: 0,
            });
        }

        const pairs: MassPair[] = [];
        tickPerformanceTracker.measure(
            [PERF_CROWD_SPACING_MASS_PAIRS],
            () =>
                enumerateCrowdSpacingOverlaps({
                    byId,
                    sortedIds,
                    grid,
                    radius: (u) => records.get(u.id)!.radius,
                    // Two walls never push each other.
                    considerPair: (a, b) => !(records.get(a.id)!.braced && records.get(b.id)!.braced),
                    visit: ({ a, b, nx, ny, overlap }) => {
                        onContact(a, b);
                        const recA = records.get(a.id)!;
                        const recB = records.get(b.id)!;
                        const [shareA, shareB] = splitOverlap(recA, recB, overlap);
                        // n points A → B: A pushes when it moved along +n, B when it moved along −n.
                        const pusherA = recA.moveX * nx + recA.moveY * ny > CROWD_MASS_PUSHER_EPSILON;
                        const pusherB = -(recB.moveX * nx + recB.moveY * ny) > CROWD_MASS_PUSHER_EPSILON;
                        if (!areAllies(a.teamId, b.teamId)) {
                            if (!pusherA) recA.resisting = true;
                            if (!pusherB) recB.resisting = true;
                        }
                        recA.dx -= nx * shareA;
                        recA.dy -= ny * shareA;
                        recB.dx += nx * shareB;
                        recB.dy += ny * shareB;
                        pairs.push({ a: recA, b: recB, nx, ny, shareA, shareB, pusherA, pusherB });
                    },
                }),
            VERBOSE,
        );
        if (pairs.length === 0) return;

        // Budget clamp, then terrain clamp; record the fraction each unit actually took.
        tickPerformanceTracker.measure(
            [PERF_CROWD_SPACING_MASS_CLAMP],
            () => {
                for (const id of sortedIds) {
                    const rec = records.get(id)!;
                    if (rec.braced) {
                        rec.scale = 0;
                        continue;
                    }
                    if (rec.resisting) rec.budget /= CROWD_MASS_ENEMY_RESISTANCE;
                    rec.spare = rec.budget;
                    const requested = Math.hypot(rec.dx, rec.dy);
                    if (requested <= 0) continue;
                    const budgetScale = requested > rec.budget ? rec.budget / requested : 1;
                    if (budgetScale <= 0) {
                        rec.scale = 0;
                        continue;
                    }
                    const applied = applyClampedCrowdSpacingDelta({
                        unit: rec.unit,
                        delta: { x: rec.dx * budgetScale, y: rec.dy * budgetScale },
                        grid,
                        radius: rec.radius,
                        terrainManager,
                    });
                    const appliedLen = Math.hypot(applied.x, applied.y);
                    rec.scale = Math.min(1, appliedLen / requested);
                    rec.spare = Math.max(0, rec.budget - appliedLen);
                }
            },
            VERBOSE,
        );

        // Residual sweep: what a unit could not take goes to a pusher partner (uncapped), or, when
        // neither unit pushes, into the partner's spare budget. Otherwise it is dropped (next tick).
        tickPerformanceTracker.measure(
            [PERF_CROWD_SPACING_MASS_RESIDUAL],
            () => {
                for (const pair of pairs) {
                    const { a, b, nx, ny } = pair;
                    const neitherPushes = !pair.pusherA && !pair.pusherB;
                    const toA = residualFor(a, (1 - b.scale) * pair.shareB, pair.pusherA, neitherPushes);
                    if (toA > 0) {
                        a.rx -= nx * toA;
                        a.ry -= ny * toA;
                    }
                    const toB = residualFor(b, (1 - a.scale) * pair.shareA, pair.pusherB, neitherPushes);
                    if (toB > 0) {
                        b.rx += nx * toB;
                        b.ry += ny * toB;
                    }
                }
                for (const id of sortedIds) {
                    const rec = records.get(id)!;
                    if (rec.rx === 0 && rec.ry === 0) continue;
                    const residual: Vec2 = { x: rec.rx, y: rec.ry };
                    applyClampedCrowdSpacingDelta({
                        unit: rec.unit,
                        delta: residual,
                        grid,
                        radius: rec.radius,
                        terrainManager,
                    });
                }
            },
            VERBOSE,
        );
    }
}

/**
 * How much of a partner's `leftover` the receiving unit takes: all of it when the receiver is the
 * pair's pusher; up to its remaining spare budget when neither unit pushes; otherwise none.
 * Braced units never receive.
 */
function residualFor(
    receiver: MassRecord,
    leftover: number,
    receiverPushes: boolean,
    neitherPushes: boolean,
): number {
    if (!(leftover > 0) || receiver.braced) return 0;
    if (receiverPushes) return leftover;
    if (!neitherPushes || receiver.spare <= 0) return 0;
    const taken = Math.min(leftover, receiver.spare);
    receiver.spare -= taken;
    return taken;
}

/**
 * How far each unit of an overlapping pair is asked to move, `[shareA, shareB]`.
 * Braced → infinite mass (the partner takes everything). A summon yields fully to its owner's
 * player character. Otherwise a size-only inverse-mass split (team resistance acts on budgets).
 */
function splitOverlap(a: MassRecord, b: MassRecord, overlap: number): [number, number] {
    if (a.braced) return [0, overlap];
    if (b.braced) return [overlap, 0];
    if (a.unit.ownerId === b.unit.ownerId && a.ownPlayer !== b.ownPlayer) {
        return a.ownPlayer ? [0, overlap] : [overlap, 0];
    }
    const sum = a.mass + b.mass;
    if (!(sum > 0)) return [overlap * 0.5, overlap * 0.5];
    // Inverse-mass split: the heavier unit moves less.
    return [overlap * (b.mass / sum), overlap * (a.mass / sum)];
}
