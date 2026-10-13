/**
 * "Combos to <tag>" conditional-cancel preset.
 *
 * Attach `buildComboToTagCancelDef({ tag, condition })` as the `conditionalCancel` of the interval that
 * ends at the combo decision point. When the condition holds, the cast pauses: the player may pick an
 * ability carrying `tag` (cancelling the cast) or Wait (the cast resumes and eats its remaining cooldown).
 *
 * Hit-count condition: a cast records how many targets it hit with `recordCastHits` (stored on the
 * serialized `castPayload`, so it survives checkpoints), and `castHitAtLeast(n)` reads it back.
 */

import type { AbilityTag } from '../Ability';
import type { ConditionalCancelConditionContext, ConditionalCancelDef } from '../abilityTimings';
import type { Unit } from '../../game/units/Unit';

/** Serialized shape recorded on `ActiveAbility.castPayload` by `recordCastHits`. */
export interface CastHitPayload {
    castHitCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

/** Record how many targets the caster's active `abilityId` cast hit (adds to any earlier count). */
export function recordCastHits(caster: Unit, abilityId: string, count: number): void {
    const active = caster.activeAbilities.find((a) => a.abilityId === abilityId);
    if (!active) return;
    const base = isRecord(active.castPayload) ? active.castPayload : {};
    const prior = typeof base.castHitCount === 'number' ? base.castHitCount : 0;
    active.castPayload = { ...base, castHitCount: prior + count } satisfies CastHitPayload;
}

/** Number of targets recorded by `recordCastHits` for the caster's active `abilityId` cast (0 if none). */
export function getCastHitCount(caster: Unit, abilityId: string): number {
    const active = caster.activeAbilities.find((a) => a.abilityId === abilityId);
    const payload = active?.castPayload;
    return isRecord(payload) && typeof payload.castHitCount === 'number' ? payload.castHitCount : 0;
}

/** Condition helper: the cast has hit at least `min` targets. */
export function castHitAtLeast(min: number): (ctx: ConditionalCancelConditionContext) => boolean {
    return ({ caster, abilityId }) => getCastHitCount(caster, abilityId) >= min;
}

/** Build a conditional cancel that offers only abilities carrying `tag` when `condition` holds. */
export function buildComboToTagCancelDef(opts: {
    tag: AbilityTag;
    condition: (ctx: ConditionalCancelConditionContext) => boolean;
}): ConditionalCancelDef {
    return { condition: opts.condition, abilityTagFilter: [opts.tag] as const };
}
