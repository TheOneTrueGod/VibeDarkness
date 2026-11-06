/**
 * Ability rotation: a scripted attack order for boss AI, replayed every slice of a round.
 *
 * A rotation splits each round into `windowsPerRound` equal windows. At the start of each window the AI
 * builds a queue from `steps`: a plain step is one ability, an `anyOrder` step is a group cast in a
 * random order (engine RNG, so every client agrees). The AI then casts the queue front to back, each
 * cast as soon as the previous one has finished. Whatever is left when the window ends is dropped and
 * the next window starts fresh.
 *
 * - `firstRoundSteps` replaces `steps` for every window of the unit's first engaged round (the round the
 *   rotation first ran in), e.g. a fixed teaching order before the shuffling starts.
 * - `skipWindowIfEnteredAfter`: a window the AI first reaches this late (fraction of the window) gets an
 *   empty queue, so a long cast that runs into a window does not cram a full sequence into its tail.
 * - A step that cannot be cast right now (no use left yet, out of range, its `canUse` false) is retried
 *   every tick; the queue never skips it. A step is consumed when its order is queued.
 *
 * Rotation abilities still go through normal eligibility (`pickBestAbility`) minus their own priority, so
 * uses, tags, range and `canUse` apply. State is plain JSON on the unit's AI context.
 */

import type { Unit } from '../Unit';
import type { AIContext } from './types';
import { ROUND_DURATION } from '../../gameConstants';
import { tryQueueAbilityOrder } from './utils';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { canUseAbilityNow } from '../../../abilities/abilityUses';

export type RotationStep = { abilityId: string } | { anyOrder: readonly string[] };

export interface AbilityRotationDef {
    windowsPerRound: number;
    steps: readonly RotationStep[];
    firstRoundSteps?: readonly RotationStep[];
    skipWindowIfEnteredAfter?: number;
}

/** Fields a tree's AI context carries for its rotation. */
export interface AbilityRotationState {
    /** Global index of the window the queue belongs to. */
    rotationWindow?: number;
    /** Abilities still to cast this window, front first. */
    rotationQueue?: string[];
    /** Round the rotation first ran in (its "first round"). */
    rotationFirstRound?: number;
}

/** Draw span for shuffles (2^30): high bits of the engine LCG are well mixed. */
const RNG_SPAN = 0x40000000;

export function rotationWindowLength(def: AbilityRotationDef): number {
    return ROUND_DURATION / Math.max(1, def.windowsPerRound);
}

/** Every ability id the rotation can cast. */
export function rotationAbilityIds(def: AbilityRotationDef): string[] {
    const ids = new Set<string>();
    for (const s of [...def.steps, ...(def.firstRoundSteps ?? [])]) {
        if ('abilityId' in s) ids.add(s.abilityId);
        else s.anyOrder.forEach((id) => ids.add(id));
    }
    return [...ids];
}

/** Expand steps into a cast queue, shuffling each `anyOrder` group with `randomInt` (inclusive bounds). */
export function buildRotationQueue(steps: readonly RotationStep[], randomInt: (min: number, max: number) => number): string[] {
    const out: string[] = [];
    for (const s of steps) {
        if ('abilityId' in s) {
            out.push(s.abilityId);
            continue;
        }
        const group = [...s.anyOrder];
        for (let i = group.length - 1; i > 0; i--) {
            // Scale a wide draw instead of `randomInt(0, i)`: the engine LCG's low bits cycle with a short
            // period (its lowest bit alternates every draw), so a small modulus repeats the same order.
            const j = Math.floor((randomInt(0, RNG_SPAN - 1) / RNG_SPAN) * (i + 1));
            [group[i], group[j]] = [group[j]!, group[i]!];
        }
        out.push(...group);
    }
    return out;
}

/** Bring the queue up to date with `gameTime` (new window = new queue). Returns the live queue. */
export function syncRotation(
    state: AbilityRotationState,
    def: AbilityRotationDef,
    gameTime: number,
    randomInt: (min: number, max: number) => number,
): string[] {
    const len = rotationWindowLength(def);
    const window = Math.floor(gameTime / len + 1e-9);
    if (state.rotationWindow !== window || !state.rotationQueue) {
        const round = Math.floor(gameTime / ROUND_DURATION + 1e-9);
        state.rotationFirstRound ??= round;
        const progress = (gameTime - window * len) / len;
        const late = def.skipWindowIfEnteredAfter !== undefined && progress > def.skipWindowIfEnteredAfter;
        const steps = round === state.rotationFirstRound && def.firstRoundSteps ? def.firstRoundSteps : def.steps;
        state.rotationWindow = window;
        state.rotationQueue = late ? [] : buildRotationQueue(steps, randomInt);
    }
    return state.rotationQueue;
}

/**
 * Queue the rotation's next ability if it can be cast now. Returns true when an order was queued (the
 * step is then consumed). Call after any higher-priority checks (escapes, supers).
 */
export function tryQueueRotationAbility(
    unit: Unit,
    context: AIContext,
    enemies: Unit[],
    state: AbilityRotationState,
    def: AbilityRotationDef,
): boolean {
    const queue = syncRotation(state, def, context.gameTime, (a, b) => context.generateRandomInteger(a, b));
    const next = queue[0];
    if (next === undefined) return false;
    // Not on 0 uses: an order for an exhausted ability is dropped when applied, and the step would be lost
    // (e.g. the tick before round-start refills). Retry next tick instead.
    const ability = getAbility(next);
    if (!ability || !canUseAbilityNow(unit, ability)) return false;
    if (!tryQueueAbilityOrder(unit, context, enemies, undefined, { only: [next] })) return false;
    queue.shift();
    return true;
}
