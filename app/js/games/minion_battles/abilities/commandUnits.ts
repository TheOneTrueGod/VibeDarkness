/**
 * Commanding other units: queue an ability on a list of units one after another (a boss sending its
 * crystals in, a commander staggering a volley). Each unit is first granted the use it needs, then
 * its order is queued `startDelaySec + i * staggerSec` from now. Delays are on the commander's clock:
 * a hasted commander's orders arrive in fewer ticks. Shared by Crystal Volley; the same shape as
 * Displacer clone mirroring and `commandPetAbility`.
 */

import type { Unit } from '../game/units/Unit';
import type { ResolvedTarget } from '../game/types';
import type { AbilityEngineContext } from './AbilityEngineContext';
import { grantAbilityUses } from './abilityUses';
import { getActorStepRate, type ActorClockEngine } from '../game/time/actorClock';
import { FIXED_DT } from '../game/gameConstants';
import type { EngineContext } from '../game/EngineContext';

export interface CommandSequenceOptions {
    /** Seconds before the first unit acts. Default 0 (next tick). */
    startDelaySec?: number;
    /** Seconds between consecutive units. */
    staggerSec: number;
    /** Targets for each unit (default: the same `targets` for all). */
    targetsFor?: (unit: Unit, index: number) => ResolvedTarget[];
}

/**
 * Make commanded units drop everything: cancel their casts, drop their queued orders, and stop any walk,
 * nudge or knockback, so a following move (e.g. an Arrange into formation) fully owns them. Use when a
 * commander takes its units back mid-sequence (Crystal Laser recalling crystals that are still ramming).
 */
export function haltCommandedUnits(engine: AbilityEngineContext, units: readonly Unit[]): void {
    const orderMgr = engine.state?.orderMgr;
    for (const unit of units) {
        if (!unit.isAlive()) continue;
        orderMgr?.dropPendingOrdersForUnit?.(unit.id);
        for (const active of [...unit.activeAbilities]) {
            unit.cancelActiveAbility(active.abilityId, engine as unknown as EngineContext);
        }
        unit.knockback = null;
        unit.nudge = null;
        unit.clearMovement();
    }
}

/** Queue `abilityId` on each unit in order. Returns the tick each order was queued for. */
export function commandUnitsInSequence(
    engine: AbilityEngineContext & { timeManager?: ActorClockEngine['timeManager'] },
    commander: Unit,
    units: readonly Unit[],
    abilityId: string,
    targets: ResolvedTarget[],
    opts: CommandSequenceOptions,
): number[] {
    const orderMgr = engine.state?.orderMgr;
    if (!orderMgr || engine.gameTick === undefined) return [];
    const rate = getActorStepRate(commander, { gameTime: engine.gameTime, timeManager: engine.timeManager });
    const scale = rate > 0 && rate !== 1 ? 1 / rate : 1;
    const start = opts.startDelaySec ?? 0;
    const ticks: number[] = [];
    units.forEach((unit, i) => {
        if (!unit.isAlive()) return;
        grantAbilityUses(unit, abilityId, 1);
        const delayTicks = Math.max(1, Math.round(((start + i * opts.staggerSec) / FIXED_DT) * scale));
        const atTick = engine.gameTick! + delayTicks;
        const unitTargets = opts.targetsFor ? opts.targetsFor(unit, i) : targets;
        orderMgr.queueOrder(atTick, { unitId: unit.id, abilityId, targets: unitTargets.map((t) => ({ ...t })) });
        ticks.push(atTick);
    });
    return ticks;
}
