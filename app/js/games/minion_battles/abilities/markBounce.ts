/**
 * Mark ladder: a hit that arcs **down** a mark's stack counts (Storm's Arc Bolt with Conductive). From an
 * enemy with N stacks the hit may leap to a less-marked enemy within reach, up to `maxBounces` times.
 * Stacks are rungs: nothing is spent climbing down them.
 *
 * - `stepDown: 'nextRung'` (default) leaps only to exactly N - 1 stacks; `'anyLower'` to anything below N;
 *   `'preferLower'` to any enemy, fewest stacks first.
 * - An unmarked enemy is the bottom rung: the hit never leaps from it.
 * - The last enemy the hit reaches gains `applyStacks` of the mark (an unmarked first target is tagged;
 *   a finished ladder grows a rung at its foot). With `markOnlyUnmarked`, an already-marked last enemy
 *   is left as it is.
 * - Ties for the next rung go to the nearest enemy, then the lowest id. The hit never revisits an enemy.
 * - `onBounce` deals the leap's damage and visuals; returning false (blocked, missed) ends the ladder
 *   without applying the mark.
 *
 * Deterministic and synchronous. Damage from `onBounce` should not re-fire the ability's ON_ATTACK_HIT
 * rules (`tryDamageOrBlock` with `fireAbilityEvents: false`), since this helper is usually called from one.
 */
import { applyMark, getMarkStacks } from '../buffs/MarkBuff';
import type { Unit } from '../game/units/Unit';
import { CircleHitbox, type HitboxEngineContext } from '../hitboxes';

export interface MarkBounceEngine extends HitboxEngineContext {
    gameTime: number;
    roundNumber: number;
}

export interface ResolveMarkBounceOpts {
    engine: MarkBounceEngine;
    caster: Unit;
    /** The enemy the original hit landed on. */
    first: Unit;
    markId: string;
    /** Max reach (px) of one leap; target radius is added by the hitbox. */
    jumpRange: number;
    /** Stacks applied to the last enemy the hit reaches. */
    applyStacks: number;
    /** Most leaps per hit (the mark's max stacks is the natural limit). */
    maxBounces: number;
    /** Which enemies a leap may reach. Default `'nextRung'` (exactly one stack fewer). */
    stepDown?: 'nextRung' | 'anyLower' | 'preferLower';
    /** Apply the mark to the last enemy only when it has none. Default false. */
    markOnlyUnmarked?: boolean;
    /** Deal one leap from `from` to `to`. Return whether it landed. */
    onBounce(from: Unit, to: Unit, index: number): boolean;
}

export interface MarkBounceResult {
    /** Enemies struck by leaps, in order (excludes `first`). */
    bounced: Unit[];
    /** The enemy the mark was applied to, if the ladder ended by marking. */
    markedUnit?: Unit;
}

function nextRung(opts: ResolveMarkBounceOpts, from: Unit, fromStacks: number, visited: ReadonlySet<string>): Unit | undefined {
    const { engine, markId } = opts;
    const stacksOf = (u: Unit): number => getMarkStacks(u, markId, engine.gameTime);
    const fits = opts.stepDown === 'anyLower'
        ? (stacks: number): boolean => stacks < fromStacks
        : opts.stepDown === 'preferLower'
            ? (): boolean => true
            : (stacks: number): boolean => stacks === fromStacks - 1;
    return CircleHitbox.getUnitsInHitbox(engine, opts.caster, from.x, from.y, opts.jumpRange)
        .filter((u) => !visited.has(u.id) && u.isAlive() && fits(stacksOf(u)))
        .sort((a, b) =>
            (opts.stepDown === 'preferLower' ? stacksOf(a) - stacksOf(b) : 0)
            || Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y)
            || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
}

export function resolveMarkBounce(opts: ResolveMarkBounceOpts): MarkBounceResult {
    const { engine, markId } = opts;
    const bounced: Unit[] = [];
    const visited = new Set<string>([opts.first.id]);
    let current = opts.first;
    while (bounced.length < opts.maxBounces) {
        const stacks = getMarkStacks(current, markId, engine.gameTime);
        if (stacks <= 0) break;
        const next = nextRung(opts, current, stacks, visited);
        if (!next) break;
        visited.add(next.id);
        if (!opts.onBounce(current, next, bounced.length)) return { bounced };
        bounced.push(next);
        current = next;
    }
    if (!current.isAlive()) return { bounced };
    if (opts.markOnlyUnmarked && getMarkStacks(current, markId, engine.gameTime) > 0) return { bounced };
    applyMark(current, markId, opts.applyStacks, engine.gameTime, engine.roundNumber);
    return { bounced, markedUnit: current };
}
