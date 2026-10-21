/**
 * Blood Mend — channel a wave of blood magic into an ally, mending their wounds at the
 * caster's own expense. See `../AGENTS.md` for the full Blood Mage design intent.
 */

import { AbilityPhase } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { payHpCost } from '../../../abilities/hpCost';
import { defineAbility } from '../../../abilities/defineAbility';
import { resolveTargetToPoint } from '../../../abilities/targeting';
import type { AbilityRecoveryRule } from '../../../abilities/Ability';
import type { EngineContext } from '../../../game/EngineContext';
import { ShieldBuff } from '../../../buffs/ShieldBuff';
import {
    BLOOD_MAGE_ALLY_SPLASH_RADIUS,
    unitRangeWithAllySplashHitbox,
} from '../../../abilities/bloodMageAllySplash';
import {
    BLOOD_MIST_TRAVEL_DEFAULT_DURATION,
    spawnBloodMistImpactFlash,
    spawnBloodMistTravel,
    spawnBloodMistWindupBurst,
    subduedBurstRadius,
    subduedImpactRadius,
} from '../../../abilities/bloodMageVfx';
import type { AbilityKeywordUse } from '../../../abilities/keywords/keywordTypes';
import { perRendHit } from '../../../abilities/keywords/rendRuntime';
import {
    formatKeywordUseTooltip,
    runAbilityKeywords,
} from '../../../abilities/keywords/runAbilityKeywords';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { type CardDef } from '../../types';

const CARD_ID = `${formatGroupId(AbilityGroupId.Mage)}01`;

export const BLOOD_MEND_HEAL_RANGE = 250;
export const BLOOD_MEND_SHIELD_HP = 30;
// Fades at the rate the old Protect did: an undamaged shield lasts ~7s, regardless of bonus shield.
export const BLOOD_MEND_SHIELD_DRAIN_PER_SECOND = 30 / 7;
export const BLOOD_MEND_REND = 4;
export const BLOOD_MEND_SHIELD_PER_REND_HIT = 4;
/** Fraction of shield lost to fading (not to damage) that heals the target. */
export const BLOOD_MEND_DECAY_HEAL_FRACTION = 0.5;
export const BLOOD_MEND_HP_COST = 5;
// Longer than the ~0.2-0.4s norm — this ability's windup is meant to expose the caster (see AGENTS.md).
export const BLOOD_MEND_WINDUP_DURATION = 1.0;
export const BLOOD_MEND_ACTIVE_DURATION = 0.05;
export const BLOOD_MEND_COOLDOWN_DURATION = 0.5;
const HEAL_RANGE = BLOOD_MEND_HEAL_RANGE;
const SHIELD_HP = BLOOD_MEND_SHIELD_HP;
const SHIELD_DRAIN_PER_SECOND = BLOOD_MEND_SHIELD_DRAIN_PER_SECOND;
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

// includeCaster: Blood Mend can shield the caster themselves, not just other allies.
// The circle drawn around the hovered ally is Rend's area.
const BLOOD_MEND_HITBOX = unitRangeWithAllySplashHitbox(HEAL_RANGE, BLOOD_MAGE_ALLY_SPLASH_RADIUS, true);

/**
 * Rend around the target; each enemy hit adds shield to `shield`. A factory because the effect needs
 * the buff granted this cast (the tooltip passes null).
 */
function rendShieldUse(shield: ShieldBuff | null): AbilityKeywordUse {
    return {
        keyword: 'rend',
        n: BLOOD_MEND_REND,
        effectText: `+{${BLOOD_MEND_SHIELD_PER_REND_HIT}} shield per enemy hit`,
        effect: perRendHit(BLOOD_MEND_SHIELD_PER_REND_HIT, (total) => {
            if (shield) shield.remainingHp += total;
        }),
    };
}

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
                        spawnBloodMistWindupBurst(eng, ctx.caster, {
                            variant: 'shield',
                            radius: subduedBurstRadius(ctx.caster.radius),
                        });

                        const fromPos = { x: ctx.caster.x, y: ctx.caster.y };
                        const toPos = resolveTargetToPoint(ctx.target, eng) ?? fromPos;
                        spawnBloodMistTravel(eng, fromPos, toPos, {
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
            end: WINDUP_DURATION + ACTIVE_DURATION,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
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

                payHpCost(ctx.caster, HP_COST, 'floorAtOne');
                const shield = new ShieldBuff(
                    SHIELD_HP,
                    SHIELD_DRAIN_PER_SECOND,
                    'blood',
                    BLOOD_MEND_DECAY_HEAL_FRACTION,
                );
                targetUnit.addBuff(shield, eng.gameTime, eng.roundNumber, eng.eventBus);
                runAbilityKeywords(
                    { engine: ctx.engine, caster: ctx.caster, abilityId: CARD_ID, center: { x: targetUnit.x, y: targetUnit.y } },
                    [rendShieldUse(shield)],
                );
                spawnBloodMistImpactFlash(eng, { x: targetUnit.x, y: targetUnit.y }, {
                    variant: 'shield',
                    radius: subduedImpactRadius(targetUnit.radius),
                });
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
            `Grant an ally a {${SHIELD_HP}} blood shield.`,
            formatKeywordUseTooltip(rendShieldUse(null)),
            'As it fades, heal half the lost shield.',
            `Costs {${HP_COST}} HP to cast — can never drop you below 1 HP.`,
        ];
    },
});

export const BloodMendCard_0301: CardDef = {
    abilityId: CARD_ID,
};
