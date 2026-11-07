/**
 * Unit stacks: one token (`Unit.stackSize` > 1) stands for several creatures of the same kind.
 *
 * - `hp`/`maxHp` belong to the front member; damage that kills it carries into the next one
 *   (`applyDamageToUnitDetailed` in `unitDamage.ts`), and each death lowers `stackSize` by one.
 * - A stack is one target: multi-target attacks hit it at most once (`assignHitSlots`) and knockback
 *   moves the whole token.
 * - Damage dealt scales with the count through {@link getStackDamageMultiplier}.
 *
 * Tuning lives here so the curve can change without touching combat code.
 */

/** Stack damage curve. Each member after the first adds `bonusPerExtraMember` × base damage. */
export const STACK_DAMAGE_SCALING = {
    /** 0.2 → a stack of 2 deals 1.2×, 5 deals 1.8×, 6 deals 2×. */
    bonusPerExtraMember: 0.2,
} as const;

/** Damage multiplier for a stack of `stackSize` (1 for a lone unit; never below 1). */
export function getStackDamageMultiplier(stackSize: number): number {
    const extraMembers = Math.max(0, Math.floor(stackSize) - 1);
    return 1 + extraMembers * STACK_DAMAGE_SCALING.bonusPerExtraMember;
}
