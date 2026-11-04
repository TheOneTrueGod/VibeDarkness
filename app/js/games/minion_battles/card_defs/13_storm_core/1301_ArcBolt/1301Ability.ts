/**
 * Arc Bolt - the Storm Core's free poke. A flick of the wrist throws a fast, crackling spark that
 * strikes the first enemy in its path and leaves it Conductive. It costs no Static, so it is what the
 * Storm player does between moves: tag targets now, cash the marks in with Chain Lightning later.
 */

import { AbilityEventType, type AbilityRecoveryRule, type AttackBlockedInfo } from '../../../abilities/Ability';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import { deactivateProjectileOnBlock } from '../../../abilities/effectHelpers';
import { drawClampedLine } from '../../../abilities/previewHelpers';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import type { EngineContext } from '../../../game/EngineContext';
import { ARC_BOLT_PROJECTILE_TYPE } from '../../../game/projectiles/projectile_defs/arcBoltDef';
import {
    buildThrowBaseTimings,
    ONE_PIXEL_TARGET,
    QUICK_THROW_PROFILE,
    THROW_PROJECTILE_SPEED,
    THROW_RANGE,
    throwMovementPenaltyStates,
} from '../../throwSharedTimings';
import { type CardDef } from '../../types';
import {
    ARC_BOLT_ABILITY_ID,
    ARC_BOLT_CONDUCTIVE_STACKS,
    ARC_BOLT_DAMAGE,
    ARC_BOLT_MAX_USES,
    ARC_BOLT_RADIUS,
    ARC_BOLT_SPEED_MULT,
    CONDUCTIVE_MARK_ID,
    STORM_SECONDARY,
} from '../stormConstants';
import { spawnStormSpark, stormSparkOnHit } from '../stormVfx';
import ARC_BOLT_IMAGE from './arcBolt.svg?raw';

const CARD_ID = ARC_BOLT_ABILITY_ID;
export const ARC_BOLT_RANGE = THROW_RANGE;
export const ARC_BOLT_SPEED = THROW_PROJECTILE_SPEED * ARC_BOLT_SPEED_MULT;
export const ARC_BOLT_PROFILE = QUICK_THROW_PROFILE;

const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: ARC_BOLT_MAX_USES },
];


const arcBoltLaunch = CastBehaviours.ProjectileLaunch()
    .withSpeed(ARC_BOLT_SPEED)
    .withMaxRange(ARC_BOLT_RANGE)
    .withRadius(ARC_BOLT_RADIUS)
    .withBaseDamage(ARC_BOLT_DAMAGE)
    .withProjectileType(ARC_BOLT_PROJECTILE_TYPE);

const TOOLTIP_LINES = [
    'Throw a crackling bolt, dealing {{DAMAGE}} damage to the first enemy hit.',
    `{Conductive ${ARC_BOLT_CONDUCTIVE_STACKS}}`,
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: ARC_BOLT_DAMAGE },
};

export const ArcBoltAbility_1301 = defineAbility({
    id: CARD_ID,
    name: 'Arc Bolt',
    image: ARC_BOLT_IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    maxUses: ARC_BOLT_MAX_USES,
    recoveries: RECOVERIES,
    prefireTime: ARC_BOLT_PROFILE.prefireTime,
    aiSettings: { minRange: 0, maxRange: ARC_BOLT_RANGE },
    abilityTimings: buildThrowBaseTimings({
        profile: ARC_BOLT_PROFILE,
        launchBehaviour: arcBoltLaunch,
        windupBehaviours: [
            // Charge gathers at the hand: a small spark burst on the caster as the flick starts.
            CastBehaviours.Instant((ctx) => {
                spawnStormSpark(ctx.engine as EngineContext, ctx.caster, {
                    radius: ctx.caster.radius + 6,
                    count: 5,
                    duration: ARC_BOLT_PROFILE.windupEnd + 0.05,
                });
            }),
        ],
        onProjectileHit: [stormSparkOnHit(18, 7)],
        windupLabel: 'Startup',
        activeLabel: 'Release',
    }),
    targets: ONE_PIXEL_TARGET,

    // The projectile fires ON_ATTACK_HIT for the enemy it strikes.
    abilityEvents: {
        [AbilityEventType.ON_ATTACK_HIT]: [
            {
                conditions: [{ type: 'hitResultIs', result: 'hit' }],
                effects: [{ type: 'applyMarkToPrimaryTarget', markId: CONDUCTIVE_MARK_ID, stacks: ARC_BOLT_CONDUCTIVE_STACKS }],
            },
        ],
    },

    getAbilityStates(currentTime) {
        return throwMovementPenaltyStates(currentTime, ARC_BOLT_PROFILE);
    },

    onAttackBlocked(_engine, _defender, attackInfo: AttackBlockedInfo): void {
        deactivateProjectileOnBlock(attackInfo);
    },

    renderTargetingPreviewSelectedTargets(gr, caster, _currentTargets, mouseWorld): void {
        drawClampedLine(gr, caster, mouseWorld, ARC_BOLT_RANGE, { color: STORM_SECONDARY, width: 2, alpha: 0.75 });
    },

    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: CARD_ID } }),
        );
    },
});

export const ArcBoltCard_1301: CardDef = {
    abilityId: CARD_ID,
};
