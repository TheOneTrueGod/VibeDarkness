/**
 * `roundHop` component hooks (rules in `roundHop.ts`) and the destination-rule registry. `tick` rolls the unit's
 * moment, starts a due move once the unit is free, carries its node tree along, and drives a move in progress.
 */

import type { EngineContext } from '../../EngineContext';
import type { Unit } from '../Unit';
import type { UnitComponentHooks } from './unitComponentHooks';
import {
    ROUND_HOP_COMPONENT_ID,
    nextRoundMoment,
    peekRoundHopState,
    roundHopDef,
    roundHopOptionsOf,
    type RoundHopOptions,
    type RoundHopState,
} from './roundHop';
import { advanceBurrow, beginBurrow } from './phaseBurrow';
import { peekPhaseState } from './phaseComponent';
import { getNodeChildIds } from './nodeTree';
import { startBurrowMove } from './burrowEmergeHooks';
import { UnitTag, addUnitTag, hasUnitTag, removeUnitTag } from '../unitTag';
import { ROUND_DURATION } from '../../gameConstants';
import { nearestPassablePoint } from '../../geometry/nearestPassablePoint';

/** Picks where the unit goes this round, or null to stay. May use the engine RNG (it runs in the simulation). */
export type RoundHopDestinationRule = (unit: Unit, engine: EngineContext) => { x: number; y: number } | null;

const DESTINATION_RULES = new Map<string, RoundHopDestinationRule>();

/** Register a destination rule. Returns an unregister function (for tests). Re-registering an id replaces it. */
export function registerRoundHopDestinationRule(id: string, rule: RoundHopDestinationRule): () => void {
    DESTINATION_RULES.set(id, rule);
    return () => {
        if (DESTINATION_RULES.get(id) === rule) DESTINATION_RULES.delete(id);
    };
}

/** Everything under `root` in its node tree that is alive, parents before their children. */
function livingDescendants(root: Unit, engine: EngineContext): Unit[] {
    const out: Unit[] = [];
    const walk = (unit: Unit): void => {
        for (const id of getNodeChildIds(unit)) {
            const child = engine.getUnit(id);
            if (!child?.isAlive()) continue;
            out.push(child);
            walk(child);
        }
    };
    walk(root);
    return out;
}

/** Move the unit's tree by the same offset, on the same stage lengths, so every Stem keeps its length. */
function carryTree(unit: Unit, to: { x: number; y: number }, options: RoundHopOptions, engine: EngineContext): void {
    const dx = to.x - unit.x;
    const dy = to.y - unit.y;
    const b = options.burrow;
    for (const node of livingDescendants(unit, engine)) {
        if (node.controlled) continue; // already burrowing (a hop of its own) or held: it stays
        startBurrowMove(node, engine, {
            to: nearestPassablePoint(engine.terrainManager ?? null, node.x + dx, node.y + dy),
            closeSeconds: b.closeSeconds,
            sinkSeconds: b.sinkSeconds,
            travelSeconds: b.travelSeconds,
            riseSeconds: b.riseSeconds,
            ...(options.carryEruption ? { eruption: options.carryEruption } : {}),
        });
    }
}

function finishMove(unit: Unit, state: RoundHopState): void {
    if (state.addedInvincibleTag) removeUnitTag(unit, UnitTag.Invincible);
    state.addedInvincibleTag = false;
}

function schedule(state: RoundHopState, gameTime: number): void {
    state.nextAtGameTime = nextRoundMoment(gameTime, state.offsetSeconds ?? 0, ROUND_DURATION);
}

function tickUnit(
    unit: Unit,
    state: RoundHopState,
    options: RoundHopOptions,
    engine: EngineContext,
    gameTime: number,
    rng: (min: number, max: number) => number,
): void {
    // A phase's burrow overrides a move: drop ours (the phase burrow holds the unit now) and try again next round.
    if (peekPhaseState(unit)?.burrow) {
        if (state.burrow) {
            state.burrow = null;
            finishMove(unit, state);
        }
        schedule(state, gameTime);
        return;
    }
    if (state.burrow) {
        advanceBurrow(unit, state, roundHopDef(options), engine);
        if (!state.burrow) {
            finishMove(unit, state);
            schedule(state, gameTime);
        }
        return;
    }
    if (state.offsetSeconds === null) {
        const lo = Math.round(Math.max(0, options.window.min) * 1000);
        const hi = Math.max(lo, Math.round(Math.min(ROUND_DURATION, options.window.max) * 1000));
        state.offsetSeconds = rng(lo, hi) / 1000;
    }
    if (state.nextAtGameTime === null) schedule(state, gameTime);
    if (gameTime < state.nextAtGameTime!) return;
    // Due: a cast in progress finishes first; held by something else, wait too.
    if (unit.activeAbilities.length > 0 || unit.controlled) return;

    const rule = DESTINATION_RULES.get(options.destinationRule);
    if (!rule) console.warn(`[roundHop] unknown destination rule "${options.destinationRule}"`);
    const to = rule?.(unit, engine) ?? null;
    if (!to) {
        schedule(state, gameTime);
        return;
    }
    if (options.carryNodeTree) carryTree(unit, to, options, engine);
    if (!hasUnitTag(unit, UnitTag.Invincible)) {
        addUnitTag(unit, UnitTag.Invincible);
        state.addedInvincibleTag = true;
    }
    beginBurrow(unit, state, ROUND_HOP_COMPONENT_ID, roundHopDef(options), to, engine);
    if (!state.burrow) {
        finishMove(unit, state); // zero-length move
        schedule(state, gameTime);
    }
}

export const ROUND_HOP_HOOKS: UnitComponentHooks = {
    tick(ctx) {
        const rng = (min: number, max: number): number => ctx.generateRandomInteger(min, max);
        for (const unit of [...ctx.units]) {
            const state = peekRoundHopState(unit);
            const options = state ? roundHopOptionsOf(unit) : undefined;
            if (!state || !options || !unit.isAlive()) continue;
            tickUnit(unit, state, options, ctx.engine, ctx.gameTime, rng);
        }
    },
};
