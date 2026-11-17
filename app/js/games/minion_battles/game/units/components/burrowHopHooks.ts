/**
 * `burrowHop` component hooks (rules in `burrowHop.ts`). `tick` runs once per simulation tick in the nest phase: it
 * schedules the next hop, starts a due hop once any cast in progress has finished, and drives a hop in progress.
 */

import type { EngineContext } from '../../EngineContext';
import type { Unit } from '../Unit';
import type { UnitComponentHooks } from './unitComponentHooks';
import {
    BURROW_HOP_COMPONENT_ID,
    burrowHopDef,
    burrowHopOptionsOf,
    peekBurrowHopState,
    type BurrowHopOptions,
    type BurrowHopState,
} from './burrowHop';
import { advanceBurrow, beginBurrow } from './phaseBurrow';
import { peekPhaseState } from './phaseComponent';
import { peekNodeTreeState } from './nodeTree';
import { UnitTag, addUnitTag, hasUnitTag, removeUnitTag } from '../unitTag';

/** Random points tried per hop before giving up. */
const HOP_CANDIDATES = 16;

/** World seconds until the next hop, rolled to the millisecond between the interval's bounds. */
export function rollHopInterval(options: BurrowHopOptions, rng: (min: number, max: number) => number): number {
    const lo = Math.round(Math.max(0, options.intervalSeconds.min) * 1000);
    const hi = Math.max(lo, Math.round(options.intervalSeconds.max * 1000));
    return rng(lo, hi) / 1000;
}

function scheduleNextHop(state: BurrowHopState, options: BurrowHopOptions, gameTime: number, rng: (min: number, max: number) => number): void {
    state.nextHopAtGameTime = gameTime + rollHopInterval(options, rng);
}

/** True when standing at (x, y) keeps every tether this unit is part of within its leash. */
export function hopKeepsTethers(unit: Unit, x: number, y: number, engine: Pick<EngineContext, 'getUnit'>): boolean {
    const tree = peekNodeTreeState(unit);
    if (!tree) return true;
    if (tree.parentId !== null && tree.tetherMaxLength !== null) {
        const parent = engine.getUnit(tree.parentId);
        if (parent?.isAlive() && Math.hypot(parent.x - x, parent.y - y) > tree.tetherMaxLength) return false;
    }
    for (const childId of tree.childIds) {
        const child = engine.getUnit(childId);
        const leash = child ? peekNodeTreeState(child)?.tetherMaxLength : null;
        if (!child?.isAlive() || leash == null) continue;
        if (Math.hypot(child.x - x, child.y - y) > leash) return false;
    }
    return true;
}

/** A random open point for the hop, or null when none of the tries works. */
export function chooseHopPoint(
    unit: Unit,
    options: BurrowHopOptions,
    engine: EngineContext,
    rng: (min: number, max: number) => number,
): { x: number; y: number } | null {
    const maxD = Math.max(1, Math.floor(options.maxDistancePx));
    const minD = Math.min(maxD, Math.max(1, Math.floor(options.minDistancePx ?? maxD / 5)));
    const tm = engine.terrainManager;
    for (let i = 0; i < HOP_CANDIDATES; i++) {
        const angle = (rng(0, 359) * Math.PI) / 180;
        const dist = rng(minD, maxD);
        const x = unit.x + Math.cos(angle) * dist;
        const y = unit.y + Math.sin(angle) * dist;
        if (tm && !tm.isPassable(x, y)) continue;
        if (!hopKeepsTethers(unit, x, y, engine)) continue;
        const crowded = engine.units.some(
            (u) => u !== unit && u.isAlive() && Math.hypot(u.x - x, u.y - y) < u.radius + unit.radius,
        );
        if (crowded) continue;
        return { x, y };
    }
    return null;
}

function finishHop(unit: Unit, state: BurrowHopState, options: BurrowHopOptions, gameTime: number, rng: (min: number, max: number) => number): void {
    if (state.addedInvincibleTag) removeUnitTag(unit, UnitTag.Invincible);
    state.addedInvincibleTag = false;
    scheduleNextHop(state, options, gameTime, rng);
}

function tickUnit(unit: Unit, state: BurrowHopState, options: BurrowHopOptions, engine: EngineContext, gameTime: number, rng: (min: number, max: number) => number): void {
    if (state.burrow) {
        advanceBurrow(unit, state, burrowHopDef(options), engine);
        if (!state.burrow) finishHop(unit, state, options, gameTime, rng);
        return;
    }
    if (state.nextHopAtGameTime === null) {
        scheduleNextHop(state, options, gameTime, rng);
        return;
    }
    if (gameTime < state.nextHopAtGameTime) return;
    // Due: a cast in progress finishes first; held by something else (stun, a phase's burrow), wait too.
    if (unit.activeAbilities.length > 0 || unit.controlled || peekPhaseState(unit)?.burrow) return;

    const to = chooseHopPoint(unit, options, engine, rng);
    if (!to) {
        // Boxed in: stay, and try again after a fresh interval.
        scheduleNextHop(state, options, gameTime, rng);
        return;
    }
    if (!hasUnitTag(unit, UnitTag.Invincible)) {
        addUnitTag(unit, UnitTag.Invincible);
        state.addedInvincibleTag = true;
    }
    beginBurrow(unit, state, BURROW_HOP_COMPONENT_ID, burrowHopDef(options), to, engine);
    if (!state.burrow) finishHop(unit, state, options, gameTime, rng); // zero-length hop
}

export const BURROW_HOP_HOOKS: UnitComponentHooks = {
    tick(ctx) {
        const rng = (min: number, max: number): number => ctx.generateRandomInteger(min, max);
        for (const unit of [...ctx.units]) {
            const state = peekBurrowHopState(unit);
            const options = state ? burrowHopOptionsOf(unit) : undefined;
            if (!state || !options || !unit.isAlive()) continue;
            tickUnit(unit, state, options, ctx.engine, ctx.gameTime, rng);
        }
    },
};
