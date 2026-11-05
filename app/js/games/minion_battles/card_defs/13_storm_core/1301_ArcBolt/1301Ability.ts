/**
 * Arc Bolt - the Storm Core's free poke. A flick of the wrist throws a fast, crackling spark that
 * strikes the first enemy in its path. From a Conductive enemy the bolt arcs down the ladder of charge:
 * to a nearby enemy with one stack fewer, and on until it reaches an unmarked enemy, dealing extra damage
 * with each leap. The last enemy it reaches becomes Conductive. It costs no Static: tag between moves.
 */

import { AbilityEventType, type AttackBlockedInfo } from '../../../abilities/Ability';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import { deactivateProjectileOnBlock } from '../../../abilities/effectHelpers';
import { tryDamageOrBlock } from '../../../abilities/blockingHelpers';
import type { AbilityEventRuntimeContext } from '../../../abilities/events/AbilityEventRuntime';
import { resolveMarkBounce } from '../../../abilities/markBounce';
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
    ARC_BOLT_BOUNCE_BONUS_DAMAGE,
    ARC_BOLT_BOUNCE_DELAY,
    ARC_BOLT_BOUNCE_RANGE,
    ARC_BOLT_CONDUCTIVE_STACKS,
    ARC_BOLT_DAMAGE,
    ARC_BOLT_MAX_BOUNCES,
    ARC_BOLT_MAX_USES,
    ARC_BOLT_RADIUS,
    ARC_BOLT_SPEED_MULT,
    CONDUCTIVE_MARK_ID,
    STORM_SECONDARY,
} from '../stormConstants';
import { spawnStormBolt, spawnStormSpark, stormSparkOnHit } from '../stormVfx';
import ARC_BOLT_IMAGE from './arcBolt.svg?raw';

const CARD_ID = ARC_BOLT_ABILITY_ID;
export const ARC_BOLT_RANGE = THROW_RANGE;
export const ARC_BOLT_SPEED = THROW_PROJECTILE_SPEED * ARC_BOLT_SPEED_MULT;
export const ARC_BOLT_PROFILE = QUICK_THROW_PROFILE;

const ARC_BOLT_BOUNCE_EFFECT_ID = 'arcBoltConductiveBounce';
export const ARC_BOLT_BOUNCE_DAMAGE = ARC_BOLT_DAMAGE + ARC_BOLT_BOUNCE_BONUS_DAMAGE;

/**
 * On a landed hit: arc down the Conductive ladder (N stacks to N - 1, ending on an unmarked enemy), then
 * mark the last enemy reached. Custom because the leap's damage and bolt visual are Arc Bolt's own; the
 * rule is `resolveMarkBounce`.
 */
function arcBoltBounce(_params: Record<string, unknown> | undefined, ctx: unknown): void {
    const runtime = ctx as AbilityEventRuntimeContext;
    const eng = runtime.engine as unknown as EngineContext;
    const first = runtime.primaryTarget;
    if (!first) return;
    resolveMarkBounce({
        engine: eng,
        caster: runtime.caster,
        first,
        markId: CONDUCTIVE_MARK_ID,
        jumpRange: ARC_BOLT_BOUNCE_RANGE,
        applyStacks: ARC_BOLT_CONDUCTIVE_STACKS,
        maxBounces: ARC_BOLT_MAX_BOUNCES,
        onBounce(from, to, index) {
            const delay = index * ARC_BOLT_BOUNCE_DELAY;
            spawnStormBolt(eng, from, to, { fromUnitId: from.id, toUnitId: to.id, delay, duration: 0.26, width: 2, forks: 1 });
            spawnStormSpark(eng, to, { radius: to.radius + 12, count: 7, delay });
            return tryDamageOrBlock(to, {
                engine: eng,
                gameTime: eng.gameTime,
                eventBus: eng.eventBus,
                attackerX: from.x,
                attackerY: from.y,
                attackerId: runtime.caster.id,
                abilityId: CARD_ID,
                damage: ARC_BOLT_BOUNCE_DAMAGE,
                attackType: 'ranged' as 'melee' | 'charging',
                fireAbilityEvents: false,
            }).hit;
        },
    });
}

const arcBoltLaunch = CastBehaviours.ProjectileLaunch()
    .withSpeed(ARC_BOLT_SPEED)
    .withMaxRange(ARC_BOLT_RANGE)
    .withRadius(ARC_BOLT_RADIUS)
    .withBaseDamage(ARC_BOLT_DAMAGE)
    .withProjectileType(ARC_BOLT_PROJECTILE_TYPE);

const TOOLTIP_LINES = [
    'Throw a crackling bolt, dealing {{DAMAGE}} damage to the first enemy hit.',
    'If the enemy is {Conductive}, the bolt leaps to a nearby enemy with {1} fewer stack for {{BOUNCE}} damage, and on down until it reaches an enemy that is not {Conductive}.',
    'The last enemy it reaches becomes {Conductive}.',
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: ARC_BOLT_DAMAGE },
    BOUNCE: { kind: 'damage', base: ARC_BOLT_BOUNCE_DAMAGE },
};

export const ArcBoltAbility_1301 = defineAbility({
    id: CARD_ID,
    name: 'Arc Bolt',
    image: ARC_BOLT_IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    maxUses: ARC_BOLT_MAX_USES,
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

    // The projectile fires ON_ATTACK_HIT for the enemy it strikes; leaps deal damage without re-firing it.
    abilityEvents: {
        [AbilityEventType.ON_ATTACK_HIT]: [
            {
                conditions: [{ type: 'hitResultIs', result: 'hit' }],
                effects: [{
                    type: 'custom',
                    effectId: ARC_BOLT_BOUNCE_EFFECT_ID,
                    comment: 'Arc down the Conductive ladder (resolveMarkBounce), then mark the last enemy reached.',
                }],
            },
        ],
    },
    customEffectHandlers: { [ARC_BOLT_BOUNCE_EFFECT_ID]: arcBoltBounce },

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
