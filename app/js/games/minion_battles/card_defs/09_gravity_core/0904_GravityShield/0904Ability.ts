/**
 * Gravity Shield — wrap an ally in a short-lived crush of compressed space.
 *
 * Point-and-click peel: pick a nearby ally (including yourself) and grant a fat absorb
 * shield that dumps its armour in one round. High starting pool, fast fade — spend it
 * on the hit that is coming now, not as a standing wall.
 */

import { AbilityPhase } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import { spawnCasterChargeUpEffect } from '../../../abilities/casterChargeUpVisual';
import { ShieldBuff } from '../../../buffs/ShieldBuff';
import { Effect } from '../../../game/effects/Effect';
import type { EngineContext } from '../../../game/EngineContext';
import type { Unit } from '../../../game/units/Unit';
import type { ActiveAbility, ResolvedTarget } from '../../../game/types';
import { unitRangeHitbox } from '../../../hitboxes';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { type CardDef } from '../../types';
import { GRAVITY_VIOLET } from '../../../game/effect_defs/aoeEffects';
import { DescriptiveValue } from '../../../../../researchTrees/descriptiveValue';
import {
    GRAVITY_INVERSION_SHOCKWAVE_COLORS,
    GRAVITY_SHIELD_ACTIVE_DURATION,
    GRAVITY_SHIELD_COOLDOWN_DURATION,
    GRAVITY_SHIELD_DRAIN_PER_SECOND,
    GRAVITY_SHIELD_DURATION_ROUNDS,
    GRAVITY_SHIELD_GRAVITY_COST,
    GRAVITY_SHIELD_HP,
    GRAVITY_SHIELD_IMPACT_SHOCKWAVE_SCALE,
    GRAVITY_SHIELD_MAX_RANGE,
    GRAVITY_SHIELD_PREFIRE_TIME,
    GRAVITY_SHIELD_TARGET_LABEL,
} from '../gravityConstants';

const CARD_ID = `${formatGroupId(AbilityGroupId.Gravity)}04`;
const MAX_USES = 1;
const HOWL_SHOCKWAVE_EFFECT_TYPE = 'HowlShockwave';

const GRAVITY_SHIELD_HITBOX = unitRangeHitbox(GRAVITY_SHIELD_MAX_RANGE, 0, true);

const GRAVITY_SHIELD_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="gsGlow" cx="0.5" cy="0.4" r="0.65">
      <stop offset="0%" stop-color="#c084fc"/>
      <stop offset="55%" stop-color="#a855f7"/>
      <stop offset="100%" stop-color="#1e1033" stop-opacity="0.9"/>
    </radialGradient>
  </defs>
  <path d="M32 8 L50 16 L50 32 C50 46 42 54 32 58 C22 54 14 46 14 32 L14 16 Z"
        fill="url(#gsGlow)" stroke="#c084fc" stroke-width="2.5" opacity="0.95"/>
  <circle cx="32" cy="30" r="8" fill="#1e1033" opacity="0.85"/>
  <circle cx="32" cy="30" r="3" fill="#a855f7"/>
</svg>`;

function spawnGravityShieldImpact(engine: EngineContext, position: { x: number; y: number }): void {
    engine.addEffect(new Effect({
        x: position.x,
        y: position.y,
        duration: 0.4,
        effectType: HOWL_SHOCKWAVE_EFFECT_TYPE,
        effectData: {
            colors: [...GRAVITY_INVERSION_SHOCKWAVE_COLORS],
            scale: GRAVITY_SHIELD_IMPACT_SHOCKWAVE_SCALE,
        },
    }));
}

export const GravityShieldAbility = defineAbility({
    id: CARD_ID,
    name: 'Gravity Shield',
    image: GRAVITY_SHIELD_IMAGE,
    resourceCost: { resourceId: 'gravity', amount: GRAVITY_SHIELD_GRAVITY_COST },
    rechargeTurns: 1,
    maxUses: MAX_USES,
    recoveries: [{ chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 }],
    prefireTime: GRAVITY_SHIELD_PREFIRE_TIME,
    aiSettings: { minRange: 0, maxRange: GRAVITY_SHIELD_MAX_RANGE },
    clearMovementOnComplete: true,
    abilityTimings: [
        {
            id: 'windup',
            start: 0,
            end: GRAVITY_SHIELD_PREFIRE_TIME,
            abilityPhase: AbilityPhase.Windup,
        },
        {
            id: 'active',
            start: GRAVITY_SHIELD_PREFIRE_TIME,
            end: GRAVITY_SHIELD_PREFIRE_TIME + GRAVITY_SHIELD_ACTIVE_DURATION,
            abilityPhase: AbilityPhase.Active,
            tags: ['juggernaut'] as const,
            doNotRefund: true,
            targetDef: {
                kind: 'select',
                label: GRAVITY_SHIELD_TARGET_LABEL,
                hitbox: GRAVITY_SHIELD_HITBOX,
                filter: 'ally',
                allowMiss: false,
                includeSelf: true,
            },
            behaviour: CastBehaviours.Instant((ctx) => {
                const eng = ctx.engine as EngineContext;
                const targetUnit = ctx.target.type === 'unit' && ctx.target.unitId
                    ? eng.getUnit(ctx.target.unitId)
                    : null;
                if (!targetUnit?.isAlive()) return;

                targetUnit.addBuff(
                    new ShieldBuff(GRAVITY_SHIELD_HP, GRAVITY_SHIELD_DRAIN_PER_SECOND, 'gravity'),
                    eng.gameTime,
                    eng.roundNumber,
                    eng.eventBus,
                );
                spawnGravityShieldImpact(eng, { x: targetUnit.x, y: targetUnit.y });
            }),
        },
        {
            id: 'cooldown',
            start: GRAVITY_SHIELD_PREFIRE_TIME + GRAVITY_SHIELD_ACTIVE_DURATION,
            end: GRAVITY_SHIELD_PREFIRE_TIME + GRAVITY_SHIELD_ACTIVE_DURATION + GRAVITY_SHIELD_COOLDOWN_DURATION,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ],
    targets: [],

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: GRAVITY_SHIELD_MAX_RANGE };
    },

    beginActiveCast(engine: unknown, caster: Unit, _targets: ResolvedTarget[], _active: ActiveAbility): void {
        spawnCasterChargeUpEffect(
            engine as { addEffect(effect: Effect): void },
            caster,
            GRAVITY_SHIELD_PREFIRE_TIME + GRAVITY_SHIELD_ACTIVE_DURATION,
            { color: GRAVITY_VIOLET },
        );
    },

    getTooltipText(): string[] {
        return [
            'Wrap an ally in compressed gravity.',
            `Grants a {${DescriptiveValue.Large}} shield absorbing {${GRAVITY_SHIELD_HP}} damage.`,
            `The shield drains over {${GRAVITY_SHIELD_DURATION_ROUNDS}} round.`,
        ];
    },
});

export const GravityShieldCard: CardDef = {
    abilityId: CARD_ID,
};
