/**
 * Effect / emitter time domain override.
 *
 * Effects and emitters ignore tempo and world pace by default (`'wall'`). They may opt in:
 * - `'wall'`  : unchanged behaviour; one unit of effect time per render frame / tick.
 * - `'world'` : effect time runs at `engine.worldPace` (slow-mo lengthens it, Time Stop pauses it).
 * - `'owner'` : effect time runs at the owner actor's step rate (`timeManager.getStepRate(owner, tempo)`).
 *
 * See `game/time/AGENTS.md` and `game/effects/AGENTS.md`.
 */

import type { EngineContext } from '../EngineContext';

export type EffectTimeDomain = 'wall' | 'world' | 'owner';

/**
 * Hook for per-actor tempo. Until unit tempo is wired through here it may be omitted (tempo 1).
 * Return the actor's current tempo (e.g. `getActorTempo(unit, engine)`); the Time Stop / world pace
 * part is applied by `TimeManager.getStepRate`.
 */
export type OwnerTempoResolver = (ownerId: string) => number;

/**
 * Multiplier applied to an effect's/emitter's elapsed time this step.
 * Exactly 1 for `'wall'` (and undefined), so default behaviour is byte-identical to before.
 * `'owner'` with no resolvable owner id falls back to world pace.
 */
export function resolveTimeDomainRate(
    domain: EffectTimeDomain | undefined,
    ownerId: string | undefined,
    ctx: Pick<EngineContext, 'worldPace' | 'timeManager'>,
    tempoResolver?: OwnerTempoResolver,
): number {
    if (domain === undefined || domain === 'wall') return 1;
    if (domain === 'world' || !ownerId || !ctx.timeManager) return ctx.worldPace;
    return ctx.timeManager.getStepRate({ id: ownerId }, tempoResolver ? tempoResolver(ownerId) : 1);
}
