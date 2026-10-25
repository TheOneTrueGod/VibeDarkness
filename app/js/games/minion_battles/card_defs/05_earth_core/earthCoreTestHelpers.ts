/**
 * Shared helpers for the Earth Core ability tests (test-only; nothing in the game imports this).
 *
 * `castToEnd` drives a real tiny-battle engine through one cast. `enterInterval` runs one timing
 * interval's cast behaviours once, against a hand-built engine stub, for tests that need to observe
 * terrain calls without real terrain.
 */

import type { AbilityStatic } from '../../abilities/Ability';
import type { AbilityEngineContext } from '../../abilities/AbilityEngineContext';
import type { CastBehaviourTickContext } from '../../abilities/castBehaviourTypes';
import {
    getEffectiveCastBehaviours,
    isAbilityTimingInterval,
    type AbilityTimingInterval,
} from '../../abilities/abilityTimings';
import type { GameEngine } from '../../game/GameEngine';
import type { ResolvedTarget } from '../../game/types';
import type { Unit } from '../../game/units/Unit';
import { resolveParallelOrderPause } from '../../testing/runner/SimulationRunner';

/** Applies the order, then steps the engine until the unit's casts have all ended (or `maxTicks`). */
export function castToEnd(
    engine: GameEngine,
    caster: Unit,
    abilityId: string,
    targets: ResolvedTarget[],
    maxTicks = 400,
): void {
    engine.state.orderMgr.applyOrder({ unitId: caster.id, abilityId, targets });
    engine.stepSimulationFixedTicks(1);
    for (let i = 0; i < maxTicks && caster.activeAbilities.length > 0; i++) {
        resolveParallelOrderPause(engine);
        engine.stepSimulationFixedTicks(1);
    }
}

/** The ability's timings for this caster, as the engine resolves them (research variants included). */
export function timingsFor(ability: AbilityStatic, caster?: Unit, engine?: unknown): AbilityTimingInterval[] {
    const entries = ability.getAbilityTimings?.(caster, engine) ?? ability.abilityTimings;
    return entries.filter((e): e is AbilityTimingInterval => isAbilityTimingInterval(e));
}

/**
 * Runs the cast behaviours of one interval as the engine does when the window is entered: `onSetup`,
 * then a single tick that is both the first and the last of the window (progress 0 to 1).
 */
export function enterInterval(
    ability: AbilityStatic,
    intervalId: string,
    engine: AbilityEngineContext,
    caster: Unit,
    targets: ResolvedTarget[],
    opts: { castPayload?: unknown } = {},
): void {
    const interval = timingsFor(ability, caster, engine).find((i) => i.id === intervalId);
    if (!interval) throw new Error(`${ability.name} has no interval "${intervalId}"`);
    for (const entry of getEffectiveCastBehaviours(interval) ?? []) {
        let payload: unknown;
        const base = {
            caster,
            abilityId: ability.id,
            target: targets[0] ?? { type: 'pixel', position: { x: caster.x, y: caster.y } },
            allTargets: targets,
            castPayload: opts.castPayload ?? {},
            setBehaviourPayload: (data: unknown) => { payload = data; },
            engine,
        };
        entry.behaviour.onSetup?.({ ...base, behaviourPayload: undefined });
        const tick: CastBehaviourTickContext = {
            ...base,
            behaviourPayload: payload,
            windowProgress: 1,
            prevWindowProgress: 0,
            isFirstTick: true,
            isLastTick: true,
        };
        entry.behaviour.onTick?.(tick);
    }
}
