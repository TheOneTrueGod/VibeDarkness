/**
 * Blood Pact — the caster binds their life to an ally's for two rounds, shown as two ethereal
 * blood tethers flowing from the ally back to the caster. Half of all life the ally loses is taken
 * by the caster instead (half of that can be soaked by the caster's shields). The 5 HP cost drains
 * away evenly over the pact rather than up front, so it rewards a Blood Mage who can stay healthy.
 */

import type { AbilityRecoveryRule } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import { resolveTargetToPoint } from '../../../abilities/targeting';
import { unitRangeHitbox } from '../../../hitboxes';
import { spawnBloodMistImpactFlash, spawnBloodMistTravel, spawnBloodMistWindupBurst } from '../../../abilities/bloodMageVfx';
import { DAMAGE_LINK_BUFF_TYPE, DamageLinkBuff } from '../../../buffs/DamageLinkBuff';
import { HpDrainBuff } from '../../../buffs/HpDrainBuff';
import { ROUND_DURATION } from '../../../game/gameConstants';
import type { EngineContext } from '../../../game/EngineContext';
import type { Unit } from '../../../game/units/Unit';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { type CardDef } from '../../types';

const CARD_ID = `${formatGroupId(AbilityGroupId.Mage)}05`;

export const BLOOD_PACT_RANGE = 250;
export const BLOOD_PACT_HP_COST = 5;
export const BLOOD_PACT_DURATION_ROUNDS = 2;
export const BLOOD_PACT_DURATION_SECONDS = BLOOD_PACT_DURATION_ROUNDS * ROUND_DURATION;
/** Share of the ally's life loss taken by the caster instead. */
export const BLOOD_PACT_REDIRECT_FRACTION = 0.5;
/** Share of the redirected loss the caster's shields may soak (rest hits the caster's life). */
export const BLOOD_PACT_CASTER_SHIELD_SHARE = 0.5;
// Longer than the ~0.2-0.4s norm — Blood Mage casts expose the caster (see AGENTS.md).
export const BLOOD_PACT_WINDUP_DURATION = 0.6;
export const BLOOD_PACT_ACTIVE_DURATION = 0.05;
export const BLOOD_PACT_COOLDOWN_DURATION = 0.5;
const WINDUP_DURATION = BLOOD_PACT_WINDUP_DURATION;
const ACTIVE_END = WINDUP_DURATION + BLOOD_PACT_ACTIVE_DURATION;
const TRAVEL_FLIGHT_DURATION = 0.3;
const TRAVEL_HANG_TIME = WINDUP_DURATION - TRAVEL_FLIGHT_DURATION;

const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

// Other allies only: a pact with yourself would redirect nothing.
const BLOOD_PACT_HITBOX = unitRangeHitbox(BLOOD_PACT_RANGE);

const BLOOD_PACT_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bloodPactMist" cx="0.5" cy="0.5" r="0.6">
      <stop offset="0%" stop-color="#7f1d1d" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="#1a0508" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="32" cy="32" r="30" fill="url(#bloodPactMist)"/>
  <circle cx="14" cy="46" r="7" fill="#450a0a" stroke="#fca5a5" stroke-width="1.5"/>
  <circle cx="50" cy="18" r="7" fill="#450a0a" stroke="#fca5a5" stroke-width="1.5"/>
  <path d="M19 41 C 28 26, 26 44, 36 30 S 42 26, 45 23" fill="none" stroke="#dc2626" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M19 41 C 24 32, 34 40, 34 32 S 40 22, 45 23" fill="none" stroke="#f87171" stroke-width="1.5" stroke-linecap="round" opacity="0.8"/>
</svg>`;

/** Re-pacting the same ally replaces this caster's previous link instead of stacking it. */
function removeExistingPact(target: Unit, casterId: string): void {
    target.buffs = target.buffs.filter(
        (b) => b._type !== DAMAGE_LINK_BUFF_TYPE || (b as DamageLinkBuff).linkedUnitId !== casterId,
    );
}

export const BloodPactAbility_0305 = defineAbility({
    id: CARD_ID,
    name: 'Blood Pact',
    image: BLOOD_PACT_IMAGE,
    resourceCost: null,
    hpCost: BLOOD_PACT_HP_COST,
    // Default 'requireSurplus' gate (hp > cost to cast), but paid over time by an HpDrainBuff.
    rechargeTurns: 1,
    maxUses: 1,
    recoveries: RECOVERIES,
    prefireTime: WINDUP_DURATION,
    aiSettings: { minRange: 0, maxRange: BLOOD_PACT_RANGE },
    clearMovementOnComplete: true,
    abilityTimings: [
        {
            id: 'windup',
            start: 0,
            end: WINDUP_DURATION,
            abilityPhase: AbilityPhase.Windup,
            castBehaviours: [
                {
                    timingStart: 'start',
                    behaviour: CastBehaviours.Instant((ctx) => {
                        const eng = ctx.engine as EngineContext;
                        spawnBloodMistWindupBurst(eng, ctx.caster, { variant: 'shield' });
                        // Mist flies from the ally to the caster, matching the tether's direction.
                        const casterPos = { x: ctx.caster.x, y: ctx.caster.y };
                        const allyPos = resolveTargetToPoint(ctx.target, eng) ?? casterPos;
                        spawnBloodMistTravel(eng, allyPos, casterPos, {
                            hangTime: TRAVEL_HANG_TIME,
                            flightDuration: TRAVEL_FLIGHT_DURATION,
                            variant: 'shield',
                        });
                    }),
                },
            ],
        },
        {
            id: 'active',
            start: WINDUP_DURATION,
            end: ACTIVE_END,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            targetDef: {
                kind: 'select',
                label: 'Ally',
                hitbox: BLOOD_PACT_HITBOX,
                filter: 'ally',
                allowMiss: false,
            },
            behaviour: CastBehaviours.Instant((ctx) => {
                const eng = ctx.engine as EngineContext;
                const target = ctx.target.type === 'unit' && ctx.target.unitId
                    ? eng.getUnit(ctx.target.unitId)
                    : null;
                if (!target?.isAlive() || target.id === ctx.caster.id) return;

                removeExistingPact(target, ctx.caster.id);
                target.addBuff(
                    new DamageLinkBuff({
                        linkedUnitId: ctx.caster.id,
                        redirectFraction: BLOOD_PACT_REDIRECT_FRACTION,
                        linkedShieldShare: BLOOD_PACT_CASTER_SHIELD_SHARE,
                        durationSeconds: BLOOD_PACT_DURATION_SECONDS,
                    }),
                    eng.gameTime,
                    eng.roundNumber,
                    eng.eventBus,
                );
                ctx.caster.addBuff(
                    new HpDrainBuff(BLOOD_PACT_HP_COST, BLOOD_PACT_DURATION_SECONDS),
                    eng.gameTime,
                    eng.roundNumber,
                    eng.eventBus,
                );
                spawnBloodMistImpactFlash(eng, { x: target.x, y: target.y }, { variant: 'shield' });
            }),
        },
        {
            id: 'cooldown',
            start: ACTIVE_END,
            end: ACTIVE_END + BLOOD_PACT_COOLDOWN_DURATION,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ],
    targets: [],

    getTooltipText(): string[] {
        return [
            `Bind your life to an ally's for {${BLOOD_PACT_DURATION_ROUNDS}} rounds.`,
            'Half of all life they lose is taken from you instead. Your shields can soak half of it.',
            `Lose {${BLOOD_PACT_HP_COST}} HP evenly over the pact.`,
        ];
    },
});

export const BloodPactCard_0305: CardDef = {
    abilityId: CARD_ID,
};
