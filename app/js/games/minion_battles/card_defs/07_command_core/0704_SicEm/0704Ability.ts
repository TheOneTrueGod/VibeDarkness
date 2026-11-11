/**
 * Sic 'em — player command card that triggers the dog's Pounce from a distance.
 * The player clicks a target point; the nearest living pet leaps at it using Pounce (0702).
 * Targeting preview draws from the pet's position using the same terrain-aware dash math as
 * Pounce's DashBehaviour. If there are no living pets, the cast fizzles (no order queued).
 */

import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { resolveAbilitySourceUnits, commandPetAbility } from '../../../abilities/petCommands';
import { CAST_PRIORITY } from '../../../game/units/castPriority';
import type { Unit } from '../../../game/units/Unit';
import { type CardDef } from '../../types';
import {
    MAX_DASH_DISTANCE as MAX_POUNCE_RANGE,
    POUNCE_COLLISION_STEP,
} from '../0702_Pounce/0702Ability';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import { createPetSourcedMovementPreview } from '../../../abilities/previewHelpers';
import type { AbilityRecoveryRule } from '../../../abilities/Ability';
import { nullHitbox } from '../../../hitboxes';

const CARD_ID = `${formatGroupId(AbilityGroupId.Command)}04`;
const MAX_USES = 2;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 2, usesRecovered: 1 },
];
const POUNCE_ABILITY_ID = `${formatGroupId(AbilityGroupId.Command)}02`;

const CAST_DURATION = 0.1;
const COOLDOWN_DURATION = 0.4;

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    {
        id: 'active',
        start: 0,
        end: CAST_DURATION,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        targetDef: { kind: 'select', label: 'Pounce target', hitbox: nullHitbox, filter: 'any', allowMiss: true },
        castBehaviours: [
            {
                timingStart: 'start',
                behaviour: CastBehaviours.Instant((ctx) => {
                    const targets = ctx.allTargets;
                    const t = targets[0];
                    const aimPoint = t?.type === 'pixel' && t.position ? t.position : undefined;

                    const eng = ctx.engine;
                    const sourcePets = resolveAbilitySourceUnits(SicEmAbility, ctx.caster, eng.units, aimPoint, eng);
                    if (sourcePets.length === 0) return;

                    commandPetAbility(sourcePets, POUNCE_ABILITY_ID, targets, eng, {
                        preGrantCharge: { chargeType: 'commandCharge', amount: 1 },
                        priority: CAST_PRIORITY.Major,
                        owner: ctx.caster,
                    });
                }),
            },
        ],
    },
    { id: 'cooldown', start: CAST_DURATION, end: CAST_DURATION + COOLDOWN_DURATION, abilityPhase: AbilityPhase.Cooldown },
];

/** Snarling jaws in the Command Core palette (teal disc, lime line art, white accent). */
const SICE_EM_IMAGE = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="28" fill="#0f766e"/>
  <path d="M15 22 Q32 15 49 22 L46 41 Q32 47 18 41 Z" fill="#042f2e"/>
  <path d="M13 21 Q32 13 51 21 L49 26 Q32 20 15 26 Z" fill="#d9f99d"/>
  <path d="M17 25 L20 36 L23 24 Z M24 23 L27 33 L30 22 Z M34 22 L37 33 L40 23 Z M41 24 L44 36 L47 25 Z" fill="#d9f99d"/>
  <path d="M15 42 Q32 50 49 42 L48 46 Q32 54 16 46 Z" fill="#d9f99d"/>
  <path d="M20 43 L23 35 L26 44 Z M28 45 L31 37 L34 45 Z M38 44 L41 35 L44 43 Z" fill="#d9f99d"/>
  <path d="M29 22 L32 38 L35 22 Z" fill="#ffffff"/>
</svg>`;

const SIC_EM_PET_SOURCE = { type: 'pet' as const, selector: 'nearest' as const, requireFree: true as const };

export const SicEmAbility = defineAbility({
    id: CARD_ID,
    name: "Sic 'em",
    image: SICE_EM_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    prefireTime: 0,
    targets: [],
    abilityTimings: ABILITY_TIMINGS,
    abilitySource: SIC_EM_PET_SOURCE,

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: MAX_POUNCE_RANGE };
    },

    getTooltipText(): string[] {
        return [`Command the nearest pet to {Pounce} through enemies at the target point (stops on the 4th hit).`];
    },

    renderTargetingPreviewSelectedTargets: createPetSourcedMovementPreview(
        { abilitySource: SIC_EM_PET_SOURCE },
        {
            maxDistance: MAX_POUNCE_RANGE,
            collisionStep: POUNCE_COLLISION_STEP,
            style: {
                lineStroke: { color: 0x3b82f6, width: 8, alpha: 0.6 },
                endpointRingStroke: { color: 0x3b82f6, width: 2, alpha: 0.8 },
                endpointRadiusScale: 1.1,
            },
        },
    ),
});

export const SicEmCard: CardDef = {
    abilityId: CARD_ID,
};
