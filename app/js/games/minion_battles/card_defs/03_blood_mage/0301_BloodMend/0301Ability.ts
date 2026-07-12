/**
 * Blood Mend — channel a wave of blood magic into an ally, mending their wounds at the
 * caster's own expense. See `../AGENTS.md` for the full Blood Mage design intent.
 */

import { AbilityPhase } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import { resolveTargetToPoint } from '../../../abilities/targeting';
import { unitRangeHitbox } from '../../../hitboxes';
import type { AbilityRecoveryRule } from '../../../abilities/Ability';
import type { Unit } from '../../../game/units/Unit';
import type { EngineContext } from '../../../game/EngineContext';
import { applyHeal } from '../../../game/units/unitHeal';
import {
    BLOOD_MIST_TRAVEL_DEFAULT_DURATION,
    spawnBloodMistImpactFlash,
    spawnBloodMistTravel,
    spawnBloodMistWindupBurst,
} from '../../../abilities/bloodMageVfx';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { type CardDef } from '../../types';

const CARD_ID = `${formatGroupId(AbilityGroupId.Mage)}01`;

export const BLOOD_MEND_HEAL_RANGE = 250;
export const BLOOD_MEND_HEAL_AMOUNT = 20;
export const BLOOD_MEND_HP_COST = 5;
// Longer than the ~0.2-0.4s norm — this ability's windup is meant to expose the caster (see AGENTS.md).
export const BLOOD_MEND_WINDUP_DURATION = 1.0;
export const BLOOD_MEND_ACTIVE_DURATION = 0.05;
export const BLOOD_MEND_COOLDOWN_DURATION = 0.5;
const HEAL_RANGE = BLOOD_MEND_HEAL_RANGE;
const HEAL_AMOUNT = BLOOD_MEND_HEAL_AMOUNT;
const HP_COST = BLOOD_MEND_HP_COST;
const WINDUP_DURATION = BLOOD_MEND_WINDUP_DURATION;
const ACTIVE_DURATION = BLOOD_MEND_ACTIVE_DURATION;
const COOLDOWN_DURATION = BLOOD_MEND_COOLDOWN_DURATION;
const TRAVEL_FLIGHT_DURATION = BLOOD_MIST_TRAVEL_DEFAULT_DURATION;
// Mist hangs at the caster, then flies, landing exactly as the active frame opens.
const TRAVEL_HANG_TIME = WINDUP_DURATION - TRAVEL_FLIGHT_DURATION;
const TARGET_LABEL = 'Ally';

const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

// includeCaster: Blood Mend can heal the caster themselves, not just other allies.
const BLOOD_MEND_HITBOX = unitRangeHitbox(HEAL_RANGE, 0, true);

const BLOOD_MEND_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bloodMendGlow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#f87171"/>
      <stop offset="55%" stop-color="#7f1d1d"/>
      <stop offset="100%" stop-color="#1a0508" stop-opacity="0.85"/>
    </radialGradient>
  </defs>
  <circle cx="32" cy="32" r="26" fill="url(#bloodMendGlow)"/>
  <path d="M32 14 C22 26, 16 34, 16 42 C16 50 23 56 32 56 C41 56 48 50 48 42 C48 34 42 26 32 14 Z"
        fill="none" stroke="#fca5a5" stroke-width="2.5" opacity="0.85"/>
  <path d="M32 24 L32 44 M23 34 L41 34" stroke="#fff5f5" stroke-width="3" stroke-linecap="round"/>
</svg>`;

/**
 * Deducts `hpCost` from the caster, clamped so it can never drop them below 1 HP (this
 * ability's `hpCostGate: 'floorAtOne'`). Must run *before* the heal so a full-HP self-cast
 * still nets the intended amount, rather than the cost being wasted by applyHeal's max-HP clamp.
 */
function payHpCostFloorAtOne(caster: Unit, cost: number): void {
    const deduction = Math.max(0, Math.min(cost, caster.hp - 1));
    caster.hp -= deduction;
}

export const BloodMendAbility_0301 = defineAbility({
    id: CARD_ID,
    name: 'Blood Mend',
    image: BLOOD_MEND_IMAGE,
    resourceCost: null,
    hpCost: HP_COST,
    hpCostGate: 'floorAtOne',
    rechargeTurns: 1,
    maxUses: 1,
    recoveries: RECOVERIES,
    prefireTime: WINDUP_DURATION,
    aiSettings: { minRange: 0, maxRange: HEAL_RANGE },
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
                        spawnBloodMistWindupBurst(eng, ctx.caster, { variant: 'heal' });

                        const fromPos = { x: ctx.caster.x, y: ctx.caster.y };
                        const toPos = resolveTargetToPoint(ctx.target, eng) ?? fromPos;
                        spawnBloodMistTravel(eng, fromPos, toPos, {
                            hangTime: TRAVEL_HANG_TIME,
                            flightDuration: TRAVEL_FLIGHT_DURATION,
                            variant: 'heal',
                        });
                    }),
                },
            ],
        },
        {
            id: 'active',
            start: WINDUP_DURATION,
            end: WINDUP_DURATION + ACTIVE_DURATION,
            abilityPhase: AbilityPhase.Active,
            targetDef: {
                kind: 'select',
                label: TARGET_LABEL,
                hitbox: BLOOD_MEND_HITBOX,
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

                // Order matters: pay the HP cost before healing (see payHpCostFloorAtOne doc).
                payHpCostFloorAtOne(ctx.caster, HP_COST);
                applyHeal(targetUnit, HEAL_AMOUNT);
                spawnBloodMistImpactFlash(eng, { x: targetUnit.x, y: targetUnit.y }, { variant: 'heal' });
            }),
        },
        {
            id: 'cooldown',
            start: WINDUP_DURATION + ACTIVE_DURATION,
            end: WINDUP_DURATION + ACTIVE_DURATION + COOLDOWN_DURATION,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ],
    targets: [],

    getTooltipText(): string[] {
        return [
            'Channel a wave of blood magic into an ally, mending their wounds at your own expense.',
            `Heals the target for {${HEAL_AMOUNT}} HP.`,
            `Costs {${HP_COST}} HP to cast — can never drop you below 1 HP.`,
        ];
    },
});

export const BloodMendCard_0301: CardDef = {
    abilityId: CARD_ID,
};
