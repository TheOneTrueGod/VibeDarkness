/**
 * Fling Thorns — player command card. The player picks an aim point round the spirit (an anchored select,
 * `anchorUnit: 'casterPet'`), and the spirit flings its thorns (0705) that way. Same pattern as
 * Sic 'em (0704 → Pounce 0702) and Bramble Patch (0707 → 0706). With no living spirit the cast fizzles.
 * Mimic Thorn research grants this card and the spirit's 0705.
 */

import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { resolveAbilitySourceUnits, commandPetAbility } from '../../../abilities/petCommands';
import { CAST_PRIORITY } from '../../../game/units/castPriority';
import type { Unit } from '../../../game/units/Unit';
import type { ResolvedTarget } from '../../../game/types';
import { type CardDef } from '../../types';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import type { AbilityRecoveryRule, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { resolveCasterPetAnchor } from '../../../abilities/targeting';
import { nullHitbox } from '../../../hitboxes';
import {
    drawFlingThornsCone,
    FLING_THORN_ABILITY_ID,
    FLING_THORN_COUNT,
    FLING_THORN_DAMAGE,
    FLING_THORN_MAX_DISTANCE,
} from '../0705_FlingThorn/0705Ability';

export const FLING_THORN_COMMAND_ID = `${formatGroupId(AbilityGroupId.Command)}14`;
export const FLING_THORN_AIM_LABEL = 'Thorn aim';

const MAX_USES = 2;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];
const CAST_DURATION = 0.1;
/** Recovery on the owner, so the spirit's windup and thorns play out during the command. */
const COOLDOWN_DURATION = 0.6;

const FLING_THORN_PET_SOURCE = { type: 'pet' as const, selector: 'nearest' as const, requireFree: true as const };

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    {
        id: 'active',
        start: 0,
        end: CAST_DURATION,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        targetDef: {
            kind: 'select',
            label: FLING_THORN_AIM_LABEL,
            hitbox: nullHitbox,
            filter: 'any',
            allowMiss: true,
            anchorUnit: 'casterPet',
            maxRangeFromAnchor: FLING_THORN_MAX_DISTANCE,
        },
        castBehaviours: [
            {
                timingStart: 'start',
                behaviour: CastBehaviours.Instant((ctx) => {
                    const targets = ctx.allTargets;
                    const t = targets[0];
                    const aimPoint = t?.type === 'pixel' && t.position ? t.position : undefined;
                    const pets = resolveAbilitySourceUnits(FlingThornCommandAbility_0714, ctx.caster, ctx.engine.units, aimPoint, ctx.engine);
                    if (pets.length === 0) return;
                    commandPetAbility(pets, FLING_THORN_ABILITY_ID, targets, ctx.engine, {
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

const FLING_THORN_IMAGE = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="28" fill="#0f766e"/>
  <circle cx="18" cy="40" r="4" fill="#ffffff"/>
  <path d="M21 38 L48 18 M22 39 L52 28 M22 41 L52 40 M21 42 L48 50 M20 43 L40 56" stroke="#d9f99d" stroke-width="2.2" stroke-linecap="round"/>
  <path d="M48 18 l-5 1 l2 3 Z M52 28 l-5 -1 l1 3 Z M52 40 l-5 -2 l0 3 Z M48 50 l-4 -3 l-1 3 Z" fill="#d9f99d"/>
</svg>`;

export const FlingThornCommandAbility_0714 = defineAbility({
    id: FLING_THORN_COMMAND_ID,
    name: 'Fling Thorns',
    image: FLING_THORN_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    prefireTime: 0,
    targets: [],
    abilityTimings: ABILITY_TIMINGS,
    abilitySource: FLING_THORN_PET_SOURCE,

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: FLING_THORN_MAX_DISTANCE };
    },

    getTooltipText(): string[] {
        return [
            `Order your spirit to fling {${FLING_THORN_COUNT}} thorns in quick succession toward the target point, each dealing {${FLING_THORN_DAMAGE}} damage.`,
        ];
    },

    // The thorn cone from the spirit toward the pointer (the anchored select draws the clamped aim line).
    renderTargetingPreviewSelectedTargets(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        _currentTargets: ResolvedTarget[],
        mouseWorld: { x: number; y: number },
        _units: Unit[],
        engine?: unknown,
    ): void {
        const pet = engine ? resolveCasterPetAnchor(caster, engine, { requireFree: true }) : null;
        if (!pet) return;
        drawFlingThornsCone(gr, pet, mouseWorld, 0.7);
    },
});

export const FlingThornCommandCard_0714: CardDef = {
    abilityId: FLING_THORN_COMMAND_ID,
};
