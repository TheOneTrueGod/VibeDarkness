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
    }
    | { type: 'setFlag'; flag: string; value: boolean }
    | {
        type: 'applyKnockbackToPrimaryTarget';
        poiseDamage: number;
        magnitude: number;
        airTime: number;
        slideTime: number;
        sourceAbilityId: string;
    }
    | { type: 'applyStunnedToPrimaryTarget'; duration: number }
    | { type: 'interruptPrimaryTargetAbilities' }
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
