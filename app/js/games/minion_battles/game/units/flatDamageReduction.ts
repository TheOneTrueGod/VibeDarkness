import type { Unit } from './Unit';

/**
 * Per-hit flat damage reduction a unit can carry (e.g. the Garden Heart Shell).
 *
 * A hit under `floor` is unchanged; any other hit becomes `max(floor, hit - amount)`.
 * Applies only while the named `condition` is true (resolved from a registry so the data stays serializable).
 *
 * Pipeline order (see `applyDamageToUnitDetailed`): attacker-side percentage/flat modifiers
 * (`getModifiedAbilityDamage`) and the target's `exposed` multiplier run first, then this reduction,
 * then shields, then earth-core armour, then hp. So the reduction always sees the post-percentage hit,
 * and shields/armour only see what the reduction let through.
 */
export interface FlatDamageReduction {
    amount: number;
    floor: number;
    /** Registered condition id (see {@link registerFlatReductionCondition}). Omitted = always active. */
    condition?: string;
}

export type FlatReductionCondition = (unit: Unit) => boolean;

const conditionRegistry = new Map<string, FlatReductionCondition>();

/** Register (or replace) a named condition. Later steps register theirs at module load (e.g. `hasLivingChildren`). */
export function registerFlatReductionCondition(id: string, fn: FlatReductionCondition): void {
    conditionRegistry.set(id, fn);
}

export function isFlatReductionActive(reduction: FlatDamageReduction, unit: Unit): boolean {
    if (reduction.condition === undefined) return true;
    // Unknown condition id: treated as inactive (fail open for the player, never silently armour a unit).
    const fn = conditionRegistry.get(reduction.condition);
    return fn ? fn(unit) : false;
}

/** Pure per-hit formula: a hit under `floor` is unchanged, otherwise `max(floor, hit - amount)`. */
export function applyFlatReductionToHit(hit: number, reduction: Pick<FlatDamageReduction, 'amount' | 'floor'>): number {
    if (hit <= reduction.floor) return hit;
    return Math.max(reduction.floor, hit - reduction.amount);
}

export interface FlatReductionResult {
    /** Damage after all active reductions. */
    damage: number;
    /** How much the reductions took off (0 when none applied). */
    resisted: number;
}

/** Apply every active reduction on `unit` in order to `hit`. */
export function applyUnitFlatReductions(unit: Unit, hit: number): FlatReductionResult {
    const reductions = unit.flatDamageReductions;
    if (reductions.length === 0 || hit <= 0) return { damage: hit, resisted: 0 };
    let damage = hit;
    for (const r of reductions) {
        if (!isFlatReductionActive(r, unit)) continue;
        damage = applyFlatReductionToHit(damage, r);
    }
    return { damage, resisted: hit - damage };
}
