/**
 * Step a loaded battle past order pauses and record a compact trace.
 *
 * Headless play-forward for a save. Clears the parallel order pause before each tick so an
 * `endTurn` order does not freeze the sim. Stops if a tick fails to advance (a select is
 * waiting for a pick, or the level has ended).
 */

import type { BattleOrder } from '../types';
import type { GameEngine } from '../GameEngine';
import '../../abilities/AbilityRegistry';

export interface ReplayOrder {
    atTick: number;
    order: BattleOrder;
}

export interface ReplayTickTrace {
    tick: number;
    gameTime: number;
    projectiles: { type: string; x: number; y: number; active: boolean }[];
    placedDeployables: { x: number; y: number; chargesRemaining: number }[];
    units: {
        id: string;
        x: number;
        y: number;
        hp: number;
        active: { abilityId: string; payload: string }[];
        resources: Record<string, number>;
    }[];
}

export interface ReplayPlayResult {
    traces: ReplayTickTrace[];
    /** Why the sim stopped before `untilTick`. Null when that tick was reached. */
    stalled: string | null;
    tick: number;
}

export interface PlayForwardOpts {
    untilTick: number;
    orders?: readonly ReplayOrder[];
    /** Record every Nth tick, plus the last tick. Default 1. */
    traceEvery?: number;
}

const PAYLOAD_SUMMARY_MAX = 180;

function payloadSummary(payload: unknown): string {
    if (payload == null) return '';
    let text: string;
    try {
        text = JSON.stringify(payload);
    } catch {
        return '';
    }
    return text.length > PAYLOAD_SUMMARY_MAX ? `${text.slice(0, PAYLOAD_SUMMARY_MAX)}…` : text;
}

export function captureReplayTick(engine: GameEngine): ReplayTickTrace {
    return {
        tick: engine.gameTick,
        gameTime: engine.gameTime,
        projectiles: engine.projectiles.map((projectile) => ({
            type: projectile.projectileType,
            x: projectile.x,
            y: projectile.y,
            active: projectile.active,
        })),
        placedDeployables: engine.state.fieldObjects.placedDeployables.map((deployable) => ({
            x: deployable.x,
            y: deployable.y,
            chargesRemaining: deployable.chargesRemaining,
        })),
        units: engine.units.filter((unit) => unit.active).map((unit) => ({
            id: unit.id,
            x: unit.x,
            y: unit.y,
            hp: unit.hp,
            active: unit.activeAbilities.map((cast) => ({
                abilityId: cast.abilityId,
                payload: payloadSummary(cast.castPayload),
            })),
            resources: Object.fromEntries(unit.resources.map((resource) => [resource.id, resource.current])),
        })),
    };
}

function stallReason(engine: GameEngine): string {
    if (engine.state.levelEventManager.isTerminal) return 'level ended';
    const waiting = engine.waitingForTargetInput;
    if (waiting) return `waiting for target "${waiting.label}" on ${waiting.unitId}`;
    if (engine.waitingForOrders) return `waiting for orders at tick ${engine.waitingForOrders.atTick}`;
    return 'tick did not advance';
}

/**
 * Queue `orders`, then step until `untilTick`. An order whose tick is already past is
 * queued for the current tick (`OrderManager.queueOrder`).
 */
export function playForward(engine: GameEngine, opts: PlayForwardOpts): ReplayPlayResult {
    const traceEvery = opts.traceEvery ?? 1;
    for (const row of opts.orders ?? []) {
        engine.state.orderMgr.queueOrder(row.atTick, row.order);
    }
    const traces: ReplayTickTrace[] = [];
    let stalled: string | null = null;
    let steps = 0;
    while (engine.gameTick < opts.untilTick) {
        engine.waitingForOrders = null;
        const tickBefore = engine.gameTick;
        engine.stepSimulationFixedTicks(1);
        if (engine.gameTick === tickBefore) {
            stalled = stallReason(engine);
            break;
        }
        steps += 1;
        if (steps % traceEvery === 0) traces.push(captureReplayTick(engine));
    }
    const last = traces[traces.length - 1];
    if (!last || last.tick !== engine.gameTick) traces.push(captureReplayTick(engine));
    return { traces, stalled, tick: engine.gameTick };
}
