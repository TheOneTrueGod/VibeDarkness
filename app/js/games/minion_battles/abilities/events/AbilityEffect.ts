import type { RecoveryChargeType } from '../abilityUses';

/**
 * Declarative effect variants for ability event rules.
 * Effects are executed in order when a rule matches.
 */
export type AbilityEffect =
    | {
        type: 'recoverCharge';
        chargeType: RecoveryChargeType;
        amount: number;
        recipient?: 'randomAbility';
        /** When true, the caster's own ability is excluded from the random selection. */
        excludeSelf?: boolean;
    }
    | { type: 'setFlag'; flag: string; value: boolean }
    | {
        type: 'applyKnockbackToPrimaryTarget';
        /** Knockback tier (1 = light, 3 = heavy). Unit knockbackResistance subtracts before applying. */
        tier: number;
        sourceAbilityId: string;
    }
    | {
        type: 'applyKnockbackToAllTargets';
        /** Knockback tier (1 = light, 3 = heavy). Applied to every unit in context.targets. */
        tier: number;
        sourceAbilityId: string;
    }
    | { type: 'applyStunnedToPrimaryTarget'; duration: number }
    | { type: 'interruptPrimaryTargetAbilities' }
    | { type: 'setAbilityNote'; abilityId: string; note: Record<string, unknown> }
    | AbilityCustomEffect;

/**
 * Escape hatch for effects that need bespoke runtime logic.
 * `comment` is required so intent is clear in data-first ability definitions.
 */
export interface AbilityCustomEffect {
    type: 'custom';
    effectId: string;
    comment: string;
    params?: Record<string, unknown>;
}
