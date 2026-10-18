/**
 * Ease Burdens - lighten an ally's weight so they move and act at double speed.
 *
 * Point-and-click ally buff (self allowed). The ability only applies a focal TimeDilationBuff; the
 * speed-up, the world slow-down and the expiry all come from the engine's time system.
 */

import { AbilityPhase } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import { spawnCasterChargeUpEffect } from '../../../abilities/casterChargeUpVisual';
import {
    TIME_DILATION_PRESETS,
    TimeDilationBuff,
    applyTimeDilationBuff,
} from '../../../buffs/TimeDilationBuff';
import type { Effect } from '../../../game/effects/Effect';
import type { EngineContext } from '../../../game/EngineContext';
import type { Unit } from '../../../game/units/Unit';
import type { ActiveAbility, ResolvedTarget } from '../../../game/types';
import { unitRangeHitbox } from '../../../hitboxes';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { type CardDef } from '../../types';
import { GRAVITY_VIOLET } from '../../../game/effect_defs/aoeEffects';
import {
    EASE_BURDENS_ACTIVE_DURATION,
    EASE_BURDENS_COOLDOWN_DURATION,
    EASE_BURDENS_GRAVITY_COST,
    EASE_BURDENS_MAX_RANGE,
    EASE_BURDENS_MAX_USES,
    EASE_BURDENS_PREFIRE_TIME,
    EASE_BURDENS_SOURCE_ID,
    EASE_BURDENS_TARGET_LABEL,
} from '../gravityConstants';

const CARD_ID = `${formatGroupId(AbilityGroupId.Gravity)}06`;
const EASE_BURDENS_HITBOX = unitRangeHitbox(EASE_BURDENS_MAX_RANGE, 0, true);
const EASE_BURDENS_PRESET = TIME_DILATION_PRESETS.focalHaste2x;

const EASE_BURDENS_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="22" fill="#1e1033" stroke="#c084fc" stroke-width="2.5" opacity="0.95"/>
  <path d="M20 22 L34 32 L20 42 Z" fill="#a855f7"/>
  <path d="M34 22 L48 32 L34 42 Z" fill="#c084fc"/>
</svg>`;

export const EaseBurdensAbility = defineAbility({
    id: CARD_ID,
    name: 'Ease Burdens',
    image: EASE_BURDENS_IMAGE,
    resourceCost: { resourceId: 'gravity', amount: EASE_BURDENS_GRAVITY_COST },
    rechargeTurns: 1,
    maxUses: EASE_BURDENS_MAX_USES,
    recoveries: [{ chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 }],
    prefireTime: EASE_BURDENS_PREFIRE_TIME,
    aiSettings: { minRange: 0, maxRange: EASE_BURDENS_MAX_RANGE },
    clearMovementOnComplete: true,
    abilityTimings: [
        {
            id: 'windup',
            start: 0,
            end: EASE_BURDENS_PREFIRE_TIME,
            abilityPhase: AbilityPhase.Windup,
        },
        {
            id: 'active',
            start: EASE_BURDENS_PREFIRE_TIME,
            end: EASE_BURDENS_PREFIRE_TIME + EASE_BURDENS_ACTIVE_DURATION,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            targetDef: {
                kind: 'select',
                label: EASE_BURDENS_TARGET_LABEL,
                hitbox: EASE_BURDENS_HITBOX,
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

                applyTimeDilationBuff(
                    targetUnit,
                    TimeDilationBuff.fromPreset(EASE_BURDENS_PRESET, EASE_BURDENS_SOURCE_ID),
                    eng.gameTime,
                    eng.roundNumber,
                    eng.eventBus,
                );
            }),
        },
        {
            id: 'cooldown',
            start: EASE_BURDENS_PREFIRE_TIME + EASE_BURDENS_ACTIVE_DURATION,
            end: EASE_BURDENS_PREFIRE_TIME + EASE_BURDENS_ACTIVE_DURATION + EASE_BURDENS_COOLDOWN_DURATION,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ],
    targets: [],

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: EASE_BURDENS_MAX_RANGE };
    },

    beginActiveCast(engine: unknown, caster: Unit, _targets: ResolvedTarget[], _active: ActiveAbility): void {
        spawnCasterChargeUpEffect(
            engine as { addEffect(effect: Effect): void },
            caster,
            EASE_BURDENS_PREFIRE_TIME + EASE_BURDENS_ACTIVE_DURATION,
            { color: GRAVITY_VIOLET },
        );
    },

    getTooltipText(): string[] {
        return [
            `Target ally moves and acts twice as fast for {${EASE_BURDENS_PRESET.durationSeconds}} seconds.`,
            'Everything else slows to match, so the ally looks normal speed while the world drags.',
        ];
    },
});

export const EaseBurdensCard: CardDef = {
    abilityId: CARD_ID,
};
