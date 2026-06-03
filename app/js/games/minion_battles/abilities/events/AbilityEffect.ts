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
        /**
         * When true, the ability currently being cast is excluded from the random recipient selection.
         * Maps to `excludeAbilityId: context.ability.id` at runtime.
         * Do NOT use `excludeSelf` — that would (incorrectly) exclude the caster unit.
         */
        excludeCurrentAbility?: boolean;
    }
    | {
        type: 'grantChargeToNearbyAllies';
        chargeType: RecoveryChargeType;
        /** Charges granted per qualifying ally. */
        amount: number;
        /** Max distance (px) from caster to qualify. */
        radius: number;
        /** If true, also grants to the caster itself. Default false. */
        includeSelf?: boolean;
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
    | {
        type: 'triggerAoEExplosion';
        /** EffectType string passed to the spawned Effect (controls the visual). */
        effectType: string;
        /** Blast radius in pixels. Units within this distance of the projectile's death position are hit. */
        effectRadius: number;
        /** Base damage dealt to each unit in the radius. */
        damage: number;
        /** Maximum number of units that can be hit (closest first). */
        maxTargets: number;
        /** Optional knockback tier applied to each hit unit (1 = light, 3 = heavy). */
        knockbackTier?: number;
        /** Duration of the spawned VFX effect in seconds. Default: 0.25. */
        effectDuration?: number;
    }
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
