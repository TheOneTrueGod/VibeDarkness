/**
 * What an effect or emitter does while the simulation is halted (pause plane: waiting for orders, waiting for
 * target input, explicit pause, host catch-up). See `GameEngine.isSimulationHalted` and `./AGENTS.md`.
 *
 * - `'continue'`: keeps running on wall time. An effect keeps ageing/animating; an emitter keeps emitting from the
 *   render loop. Use for visuals that describe ongoing state (fields, auras, ability windups) so a paused
 *   battlefield stays readable.
 * - `'hold'`: freezes in place. An effect stops ageing (holds its current pose); an emitter stops emitting and its
 *   timers stay put. Use for motion snapshots (dash afterimages) that would mislead if they kept animating.
 * - `'stop'`: removed as soon as the simulation halts.
 *
 * Defaults keep the pre-existing behaviour: effects `'continue'` (they always aged on wall time), except
 * `timeDomain` `'world'` / `'owner'` effects, which `'hold'` (world time does not pass while halted); emitters
 * `'hold'` (they only emitted on game ticks), or `'continue'` when the legacy `emitWhilePaused` flag is set.
 *
 * Emission while halted is purely visual and runs a frame-rate-dependent number of times per client, so emitter
 * factories must never consume engine RNG or mutate serialized emitter state there.
 */

import type { EffectTimeDomain } from './timeDomain';

export type PauseBehaviour = 'continue' | 'hold' | 'stop';

export function resolveEffectPauseBehaviour(effect: {
    pauseBehaviour?: PauseBehaviour;
    timeDomain?: EffectTimeDomain;
}): PauseBehaviour {
    if (effect.pauseBehaviour) return effect.pauseBehaviour;
    return effect.timeDomain === undefined || effect.timeDomain === 'wall' ? 'continue' : 'hold';
}
