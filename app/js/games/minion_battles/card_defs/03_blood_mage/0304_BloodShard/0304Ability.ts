/**
 * Blood Shard — the caster flicks a diamond-shaped shard of their own blood at a target point,
 * striking the first enemy in its path. It is the Blood Mage's cheap, snappy poke: a small HP
 * price, two uses per round, and a quicker windup and faster flight than Throw Rock / Throw
 * Knife, so the mage can chip at enemies between the slower, riskier Mend / Burst / Protect casts.
 */

import type { AbilityRecoveryRule, AttackBlockedInfo } from '../../../abilities/Ability';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import { deactivateProjectileOnBlock } from '../../../abilities/effectHelpers';
import { payHpCostBehaviour } from '../../../abilities/hpCost';
import { drawClampedLine } from '../../../abilities/previewHelpers';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import { spawnBloodMistWindupBurst, bloodMistVariantColor } from '../../../abilities/bloodMageVfx';
import { BLOOD_MIST_IMPACT_EFFECT_TYPE } from '../../../game/effect_defs/bloodMageEffects';
import type { EngineContext } from '../../../game/EngineContext';
import {
    buildThrowBaseTimings,
    ONE_PIXEL_TARGET,
    QUICK_THROW_PROFILE,
    THROW_PROJECTILE_SPEED,
    THROW_RANGE,
    throwMovementPenaltyStates,
} from '../../throwSharedTimings';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { type CardDef } from '../../types';

const CARD_ID = `${formatGroupId(AbilityGroupId.Mage)}04`;

export const BLOOD_SHARD_DAMAGE = 10;
export const BLOOD_SHARD_HP_COST = 2;
export const BLOOD_SHARD_MAX_USES = 2;
export const BLOOD_SHARD_RANGE = THROW_RANGE;
/** A third faster than thrown rocks and knives. */
export const BLOOD_SHARD_PROJECTILE_SPEED = THROW_PROJECTILE_SPEED * (4 / 3);
export const BLOOD_SHARD_PROFILE = QUICK_THROW_PROFILE;
const IMPACT_DURATION = 0.25;
const WINDUP_MIST_DURATION = BLOOD_SHARD_PROFILE.windupEnd + 0.1;
const PREVIEW_COLOR = 0xdc2626;

const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: BLOOD_SHARD_MAX_USES },
];

const BLOOD_SHARD_PROJECTILE_URL = new URL('../../../assets/projectiles/blood_shard.svg', import.meta.url).href;

const BLOOD_SHARD_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bloodShardCardMist" cx="0.5" cy="0.55" r="0.6">
      <stop offset="0%" stop-color="#7f1d1d" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#1a0508" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bloodShardCardBody" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fca5a5"/>
      <stop offset="45%" stop-color="#dc2626"/>
      <stop offset="100%" stop-color="#450a0a"/>
    </linearGradient>
  </defs>
  <circle cx="32" cy="34" r="28" fill="url(#bloodShardCardMist)"/>
  <polygon points="44,10 50,26 26,52 20,40" fill="url(#bloodShardCardBody)" stroke="#1a0508" stroke-width="1.5"/>
  <polygon points="44,12 47,24 40,26" fill="#fecaca" opacity="0.6"/>
  <circle cx="16" cy="50" r="2.5" fill="#b91c1c"/>
  <circle cx="11" cy="56" r="1.5" fill="#7f1d1d"/>
</svg>`;

const shardLaunch = CastBehaviours.ProjectileLaunch()
    .withSpeed(BLOOD_SHARD_PROJECTILE_SPEED)
    .withMaxRange(BLOOD_SHARD_RANGE)
    .withBaseDamage(BLOOD_SHARD_DAMAGE)
    .withSpriteConfig({
        sprite: { frameFiles: [BLOOD_SHARD_PROJECTILE_URL] },
        loop: false,
        animations: [{ type: 'rotation', mode: 'velocity-facing' }],
    });

const TOOLTIP_LINES = [
    'Fling a shard of your own blood, dealing {{DAMAGE}} damage to the first enemy hit.',
    'Costs {{HP_COST}} HP to cast.',
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: BLOOD_SHARD_DAMAGE },
    HP_COST: { kind: 'plain', value: BLOOD_SHARD_HP_COST },
};

export const BloodShardAbility_0304 = defineAbility({
    id: CARD_ID,
    name: 'Blood Shard',
    image: BLOOD_SHARD_IMAGE,
    resourceCost: null,
    hpCost: BLOOD_SHARD_HP_COST,
    // No hpCostGate override — default 'requireSurplus' (must have hp > HP_COST to cast).
    rechargeTurns: 1,
    maxUses: BLOOD_SHARD_MAX_USES,
    recoveries: RECOVERIES,
    prefireTime: BLOOD_SHARD_PROFILE.prefireTime,
    aiSettings: { minRange: 0, maxRange: BLOOD_SHARD_RANGE },
    abilityTimings: buildThrowBaseTimings({
        profile: BLOOD_SHARD_PROFILE,
        launchBehaviour: shardLaunch,
        windupBehaviours: [
            CastBehaviours.Instant((ctx) => {
                spawnBloodMistWindupBurst(ctx.engine as EngineContext, ctx.caster, {
                    variant: 'shard',
                    duration: WINDUP_MIST_DURATION,
                    radius: ctx.caster.radius + 8,
                });
            }),
        ],
        // Paid at release (the doNotRefund frame), so a cast cancelled during windup is free.
        releaseBehaviours: [payHpCostBehaviour(BLOOD_SHARD_HP_COST)],
        onProjectileHit: [
            {
                type: 'effect',
                effectType: BLOOD_MIST_IMPACT_EFFECT_TYPE,
                effectData: { variant: 'shard', color: bloodMistVariantColor('shard') },
                duration: IMPACT_DURATION,
                position: 'target',
            },
        ],
        windupLabel: 'Startup',
        activeLabel: 'Fling',
    }),
    targets: ONE_PIXEL_TARGET,

    getAbilityStates(currentTime) {
        return throwMovementPenaltyStates(currentTime, BLOOD_SHARD_PROFILE);
    },

    onAttackBlocked(_engine, _defender, attackInfo: AttackBlockedInfo): void {
        deactivateProjectileOnBlock(attackInfo);
    },

    renderTargetingPreviewSelectedTargets(gr, caster, _currentTargets, mouseWorld): void {
        drawClampedLine(gr, caster, mouseWorld, BLOOD_SHARD_RANGE, { color: PREVIEW_COLOR, width: 2, alpha: 0.75 });
    },

    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: CARD_ID } }),
        );
    },
});

export const BloodShardCard_0304: CardDef = {
    abilityId: CARD_ID,
};
