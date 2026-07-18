/**
 * Protect — weave a shielding lattice of blood over an ally at the caster's own expense. See
 * `../AGENTS.md` for the full Blood Mage design intent.
 */

import { AbilityPhase } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import { resolveTargetToPoint } from '../../../abilities/targeting';
import { unitRangeHitbox } from '../../../hitboxes';
import type { AbilityRecoveryRule } from '../../../abilities/Ability';
import type { EngineContext } from '../../../game/EngineContext';
import { ShieldBuff } from '../../../buffs/ShieldBuff';
import {
    BLOOD_MIST_TRAVEL_DEFAULT_DURATION,
    spawnBloodMistImpactFlash,
    spawnBloodMistTravel,
    spawnBloodMistWindupBurst,
} from '../../../abilities/bloodMageVfx';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { type CardDef } from '../../types';

const CARD_ID = `${formatGroupId(AbilityGroupId.Mage)}03`;

export const PROTECT_RANGE = 250;
export const PROTECT_SHIELD_HP = 30;
// ShieldBuff drains passively rather than expiring on a fixed timer — this rate is derived
// so an undamaged shield fades to 0 in ~7s, matching the original duration-based feel.
export const PROTECT_SHIELD_DRAIN_PER_SECOND = PROTECT_SHIELD_HP / 7;
export const PROTECT_HP_COST = 5;
// Same "expose the caster" feel as Blood Mend, but a shorter total cast (see AGENTS.md).
export const PROTECT_WINDUP_DURATION = 0.7;
export const PROTECT_ACTIVE_DURATION = 0.05;
export const PROTECT_COOLDOWN_DURATION = 0.4;
const RANGE = PROTECT_RANGE;
const SHIELD_HP = PROTECT_SHIELD_HP;
const SHIELD_DRAIN_PER_SECOND = PROTECT_SHIELD_DRAIN_PER_SECOND;
const HP_COST = PROTECT_HP_COST;
const WINDUP_DURATION = PROTECT_WINDUP_DURATION;
const ACTIVE_DURATION = PROTECT_ACTIVE_DURATION;
const COOLDOWN_DURATION = PROTECT_COOLDOWN_DURATION;
const TRAVEL_FLIGHT_DURATION = BLOOD_MIST_TRAVEL_DEFAULT_DURATION;
// Mist hangs at the caster, then flies, landing exactly as the active frame opens.
const TRAVEL_HANG_TIME = WINDUP_DURATION - TRAVEL_FLIGHT_DURATION;
const TARGET_LABEL = 'Ally';

const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

// includeCaster: Protect can shield the caster themselves, not just other allies.
const PROTECT_HITBOX = unitRangeHitbox(RANGE, 0, true);

const PROTECT_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="protectGlow" cx="0.5" cy="0.4" r="0.6">
      <stop offset="0%" stop-color="#f87171"/>
      <stop offset="55%" stop-color="#7f1d1d"/>
      <stop offset="100%" stop-color="#1a0508" stop-opacity="0.9"/>
    </radialGradient>
  </defs>
  <path d="M32 10 L50 18 L50 32 C50 46 42 54 32 58 C22 54 14 46 14 32 L14 18 Z"
        fill="url(#protectGlow)" stroke="#fca5a5" stroke-width="2.5" opacity="0.9"/>
  <path d="M32 10 L50 18 L50 32 C50 46 42 54 32 58 C22 54 14 46 14 32 L14 18 Z"
        fill="none" stroke="#fff5f5" stroke-width="1.5" opacity="0.6"/>
</svg>`;

export const ProtectAbility_0303 = defineAbility({
    id: CARD_ID,
    name: 'Protect',
    image: PROTECT_IMAGE,
    resourceCost: null,
    hpCost: HP_COST,
    // No hpCostGate override — default 'requireSurplus' (must have hp > HP_COST to cast).
    rechargeTurns: 1,
    maxUses: 2,
    recoveries: RECOVERIES,
    prefireTime: WINDUP_DURATION,
    aiSettings: { minRange: 0, maxRange: RANGE },
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
                hitbox: PROTECT_HITBOX,
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

                // Gated by hpCost's default 'requireSurplus' (hp > HP_COST to cast), so a flat
                // deduction is safe — no floorAtOne clamp needed (contrast with Blood Mend 0301).
                ctx.caster.hp -= HP_COST;
                targetUnit.addBuff(
                    new ShieldBuff(SHIELD_HP, SHIELD_DRAIN_PER_SECOND),
                    eng.gameTime,
                    eng.roundNumber,
                    eng.eventBus,
                );
                spawnBloodMistImpactFlash(eng, { x: targetUnit.x, y: targetUnit.y }, { variant: 'shield' });
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
            'Weave a shielding lattice of blood magic over an ally at your own expense.',
            `Grants a shield absorbing the next {${SHIELD_HP}} damage. Fades over time if not fully used.`,
            `Costs {${HP_COST}} HP to cast.`,
        ];
    },
});

export const ProtectCard_0303: CardDef = {
    abilityId: CARD_ID,
};
