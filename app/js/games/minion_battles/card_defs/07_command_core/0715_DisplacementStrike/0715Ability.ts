/**
 * Displacement Strike - player command card. The player picks a point round the spirit (an anchored select,
 * `anchorUnit: 'casterPet'`); the spirit splits there into three clones that dash through the enemy at that
 * point, then hunt on their own for a few seconds (pet ability 0716). Same pattern as Fling Thorns (0714 → 0705).
 * Only a free pet that owns 0716 (the real spirit, never a clone) is commanded; with none the cast fizzles.
 */

import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { resolveAbilitySourceUnits, commandPetAbility } from '../../../abilities/petCommands';
import { CAST_PRIORITY } from '../../../game/units/castPriority';
import type { Unit } from '../../../game/units/Unit';
import { type CardDef } from '../../types';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import type { AbilityRecoveryRule, PetAbilitySource } from '../../../abilities/Ability';
import { nullHitbox } from '../../../hitboxes';
import { createPetAnchoredAreaPreview } from '../../../abilities/previewHelpers';
import {
    DISPLACEMENT_STRIKE_CARD_ID,
    DISPLACEMENT_STRIKE_CLONE_COUNT,
    DISPLACEMENT_STRIKE_CLONE_RADIUS,
    DISPLACEMENT_STRIKE_CLONE_SECONDS,
    DISPLACEMENT_STRIKE_PET_ABILITY_ID,
} from '../0716_DisplacementStrikePet/0716Ability';
import { SPIRIT_FLURRY_AREA_RADIUS } from '../0711_SpiritFlurry/0711Ability';
import { kinshipCost, DISPLACEMENT_STRIKE_KINSHIP_COST } from '../commandKinshipCosts';

/** Max distance (px) from the spirit to the aim point. */
export const DISPLACEMENT_STRIKE_RANGE = 150;
export const DISPLACEMENT_STRIKE_AIM_LABEL = 'Strike point';

const MAX_USES = 1;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];
const CAST_DURATION = 0.1;
/** Recovery on the owner, so the spirit's split plays out during the command. */
const COOLDOWN_DURATION = 0.4;
/** Command Core lime, for the clone ring preview. */
const PREVIEW_COLOR = 0xd9f99d;

/** Nearest free pet that can split (owns 0716): clones are pets too, but never carry it. */
export const DISPLACEMENT_STRIKE_PET_SOURCE: PetAbilitySource = {
    type: 'pet',
    selector: 'nearest',
    requireFree: true,
    requiresAbilityId: DISPLACEMENT_STRIKE_PET_ABILITY_ID,
};

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    {
        id: 'active',
        start: 0,
        end: CAST_DURATION,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        targetDef: {
            kind: 'select',
            label: DISPLACEMENT_STRIKE_AIM_LABEL,
            hitbox: nullHitbox,
            filter: 'any',
            allowMiss: true,
            anchorUnit: 'casterPet',
            maxRangeFromAnchor: DISPLACEMENT_STRIKE_RANGE,
        },
        castBehaviours: [
            {
                timingStart: 'start',
                behaviour: CastBehaviours.Instant((ctx) => {
                    const targets = ctx.allTargets;
                    const t = targets[0];
                    const aimPoint = t?.type === 'pixel' && t.position ? t.position : undefined;
                    const pets = resolveAbilitySourceUnits(DisplacementStrikeAbility, ctx.caster, ctx.engine.units, aimPoint, ctx.engine);
                    if (pets.length === 0) return;
                    commandPetAbility(pets, DISPLACEMENT_STRIKE_PET_ABILITY_ID, targets, ctx.engine, {
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

/** A white spirit at the centre with three lime clones converging on it (Command Core palette). */
const DISPLACEMENT_STRIKE_IMAGE = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="28" fill="#0f766e"/>
  <path d="M14 18 L26 28 M50 18 L38 28 M32 54 L32 40" stroke="#d9f99d" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="3 3"/>
  <circle cx="13" cy="17" r="5" fill="none" stroke="#d9f99d" stroke-width="2.2"/>
  <circle cx="51" cy="17" r="5" fill="none" stroke="#d9f99d" stroke-width="2.2"/>
  <circle cx="32" cy="55" r="5" fill="none" stroke="#d9f99d" stroke-width="2.2"/>
  <path d="M32 24 L39 32 L32 40 L25 32 Z" fill="#ffffff"/>
</svg>`;

export const DisplacementStrikeAbility = defineAbility({
    id: DISPLACEMENT_STRIKE_CARD_ID,
    name: 'Displacement Strike',
    image: DISPLACEMENT_STRIKE_IMAGE,
    resourceCost: kinshipCost(DISPLACEMENT_STRIKE_KINSHIP_COST),
    rechargeTurns: 0,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    prefireTime: 0,
    targets: [],
    abilityTimings: ABILITY_TIMINGS,
    abilitySource: DISPLACEMENT_STRIKE_PET_SOURCE,

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: DISPLACEMENT_STRIKE_RANGE };
    },

    getTooltipText(): string[] {
        return [
            `Your spirit splits into {${DISPLACEMENT_STRIKE_CLONE_COUNT}} clones that strike the target, then hunt for {${DISPLACEMENT_STRIKE_CLONE_SECONDS}}s`,
        ];
    },

    // The ring the clones appear in, snapped onto the enemy the spirit would strike (the anchored select draws the aim line).
    renderTargetingPreviewSelectedTargets: createPetAnchoredAreaPreview({
        abilitySource: DISPLACEMENT_STRIKE_PET_SOURCE,
        maxRangeFromPet: DISPLACEMENT_STRIKE_RANGE,
        areaRadius: DISPLACEMENT_STRIKE_CLONE_RADIUS,
        snapRadius: SPIRIT_FLURRY_AREA_RADIUS,
        color: PREVIEW_COLOR,
    }),
});

export const DisplacementStrikeCard: CardDef = {
    abilityId: DISPLACEMENT_STRIKE_CARD_ID,
};
