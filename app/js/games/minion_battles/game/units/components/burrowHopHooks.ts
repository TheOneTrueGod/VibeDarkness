/**
 * `burrowHop` component hooks (rules in `burrowHop.ts`). `tick` runs once per simulation tick in the nest phase: it
 * counts casts, holds the rest after each cast, starts a due hop, and drives a hop in progress.
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

/** Count casts that started since the last one counted; roll the next hop's cast count when it is not set. */
function countCasts(unit: Unit, state: BurrowHopState, options: BurrowHopOptions, rng: (min: number, max: number) => number): void {
    for (const active of unit.activeAbilities) {
        if (state.lastCountedCastStart !== null && active.startTime <= state.lastCountedCastStart) continue;
        state.lastCountedCastStart = active.startTime;
        state.casts++;
        if (state.castsNeeded === 0) state.castsNeeded = rng(options.usesPerHop.min, options.usesPerHop.max);
    }
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

function finishHop(unit: Unit, state: BurrowHopState): void {
    if (state.addedInvincibleTag) removeUnitTag(unit, UnitTag.Invincible);
    state.addedInvincibleTag = false;
    state.casts = 0;
    state.castsNeeded = 0;
}

function tickUnit(unit: Unit, state: BurrowHopState, options: BurrowHopOptions, engine: EngineContext, gameTime: number, rng: (min: number, max: number) => number): void {
    if (state.burrow) {
        advanceBurrow(unit, state, burrowHopDef(options), engine);
        if (!state.burrow) finishHop(unit, state);
        return;
    }
    countCasts(unit, state, options, rng);
    if (unit.activeAbilities.length > 0) {
        state.restUntilGameTime = gameTime + options.restSeconds;
        return;
    }
    if (state.castsNeeded === 0 || state.casts < state.castsNeeded) return;
    if (gameTime < state.restUntilGameTime) return;
    // Held by something else (stun, a phase's burrow): wait.
    if (unit.controlled || peekPhaseState(unit)?.burrow) return;

    const to = chooseHopPoint(unit, options, engine, rng);
    if (!to) {
        // Boxed in: give up this hop and count again.
        state.casts = 0;
        state.castsNeeded = 0;
        return;
    }
    if (!hasUnitTag(unit, UnitTag.Invincible)) {
        addUnitTag(unit, UnitTag.Invincible);
        state.addedInvincibleTag = true;
    }
    beginBurrow(unit, state, BURROW_HOP_COMPONENT_ID, burrowHopDef(options), to, engine);
    if (!state.burrow) finishHop(unit, state); // zero-length hop
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
