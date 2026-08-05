/**
 * Light Imbuement — 2-second charge that infuses the caster's next Swing Bat with light energy.
 *
 * Self-cast with no targets. After a long windup, applies a LightImbueBuff to the caster and
 * generates Light. The buff fires the swap-network trigger which replaces Swing Bat (0115) with
 * Imbued Bat (0803) for one use. Free to cast. Recovers once per round.
 */

import { AbilityPhase } from '../../../abilities/abilityTimings';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import { LightImbueBuff } from '../../../buffs/LightImbueBuff';
import { spawnCasterChargeUpEffect } from '../../../abilities/casterChargeUpVisual';
import { spawnGatherLightWindupRing, type EngineWithGatherLight } from '../../../abilities/gatherLightHelpers';
import { Effect } from '../../../game/effects/Effect';
import type { Unit } from '../../../game/units/Unit';
import type { ActiveAbility, ResolvedTarget } from '../../../game/types';

const CARD_ID = `${formatGroupId(AbilityGroupId.Light)}02`;
const MAX_USES = 1;
const PREFIRE_TIME = 1.5;
const ACTIVE_DURATION = 0.05;
const COOLDOWN_DURATION = 0.05;
export const LIGHT_IMBUEMENT_LIGHT_GENERATED = 1;
const LIGHT_IMBUEMENT_MOVEMENT_PENALTY = 0.9;

const LIGHT_IMBUEMENT_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="imbuementGlow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="50%" stop-color="#ffe066"/>
      <stop offset="100%" stop-color="#ff9900" stop-opacity="0.0"/>
    </radialGradient>
  </defs>
  <circle cx="32" cy="32" r="20" fill="url(#imbuementGlow)" opacity="0.9"/>
  <path d="M32 8 L36 24 L32 20 L28 24 Z" fill="#ffe066"/>
  <path d="M32 56 L36 40 L32 44 L28 40 Z" fill="#ffe066"/>
  <path d="M8 32 L24 28 L20 32 L24 36 Z" fill="#ffe066"/>
  <path d="M56 32 L40 28 L44 32 L40 36 Z" fill="#ffe066"/>
  <circle cx="32" cy="32" r="6" fill="#ffffff" opacity="0.95"/>
</svg>`;

export const LightImbuementAbility = defineAbility({
    id: CARD_ID,
    name: 'Light Imbuement',
    image: LIGHT_IMBUEMENT_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    maxUses: MAX_USES,
    recoveries: [{ chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 }],
    prefireTime: PREFIRE_TIME,
    targets: [],
		movementLock: { until: LIGHT_IMBUEMENT_MOVEMENT_PENALTY },
    abilityTimings: [
        {
            id: 'windup',
            start: 0,
            end: PREFIRE_TIME,
            abilityPhase: AbilityPhase.Windup,
						
        },
        {
            id: 'active',
            start: PREFIRE_TIME,
            end: PREFIRE_TIME + ACTIVE_DURATION,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            castBehaviours: [
                {
                    timingStart: 'start',
                    behaviour: CastBehaviours.Instant((ctx) => {
                        ctx.caster.addBuff(
                            new LightImbueBuff(),
                            ctx.engine.gameTime,
                            ctx.engine.roundNumber ?? 1,
                            ctx.engine.eventBus,
                        );
                        ctx.caster.getResource('light')?.add(LIGHT_IMBUEMENT_LIGHT_GENERATED);
                        spawnGatherLightWindupRing(ctx.engine as EngineWithGatherLight, ctx.caster);
                    }),
                },
            ],
        },
        {
            id: 'cooldown',
            start: PREFIRE_TIME + ACTIVE_DURATION,
            end: PREFIRE_TIME + ACTIVE_DURATION + COOLDOWN_DURATION,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ],

    getRange: () => ({ minRange: 0, maxRange: 0 }),

    beginActiveCast(engine: unknown, caster: Unit, _targets: ResolvedTarget[], _active: ActiveAbility): void {
        spawnCasterChargeUpEffect(
            engine as { addEffect(effect: Effect): void },
            caster,
            PREFIRE_TIME + ACTIVE_DURATION,
        );
    },

    getTooltipText(): string[] {
        return [
            `Generates {${LIGHT_IMBUEMENT_LIGHT_GENERATED} Light} and imbues your weapon with light.`,
        ];
    },

    /** Quest Prep: Imbued Bat comes free with Light Imbuement (does not occupy a slot). */
    attachedAbilityIds: ['0803'],

    renderTargetingPreviewSelectedTargets(): void {
        // No targeting preview needed for a self-cast ability.
    },
});
