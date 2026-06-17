/**
 * Sic 'em — player command card that triggers the dog's Pounce from a distance.
 * The player clicks a target point; the nearest living pet leaps at it using Pounce (0702).
 * Targeting preview draws from the pet's position using the same terrain-aware dash math as
 * Pounce's DashBehaviour. If there are no living pets, the cast fizzles (no order queued).
 */

import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { resolveAbilitySourceUnits, commandPetAbility } from '../../../abilities/petCommands';
import { DoubleDamageBuff, DOUBLE_DAMAGE_BUFF_TYPE } from '../../../buffs/DoubleDamageBuff';
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
import sicEmIconUrl from './sic_em.png';

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
        targetDef: { kind: 'select', label: 'Pounce target', hitbox: nullHitbox, filter: 'any', allowMiss: true },
        castBehaviours: [
            {
                timingStart: 'start',
                behaviour: CastBehaviours.Instant((ctx) => {
                    const targets = ctx.allTargets;
                    const t = targets[0];
                    const aimPoint = t?.type === 'pixel' && t.position ? t.position : undefined;

                    const eng = ctx.engine;
                    const sourcePets = resolveAbilitySourceUnits(SicEmAbility, ctx.caster, eng.units, aimPoint);
                    if (sourcePets.length === 0) return;

                    // Consume DoubleDamage buff from the player and transfer it to each pet as a Pounce buff.
                    const ddIdx = ctx.caster.buffs.findIndex(
                        (b) => b._type === DOUBLE_DAMAGE_BUFF_TYPE && (b as DoubleDamageBuff).abilityId === CARD_ID,
                    );
                    if (ddIdx >= 0) {
                        ctx.caster.buffs.splice(ddIdx, 1);
                        for (const pet of sourcePets) {
                            pet.addBuff(new DoubleDamageBuff(POUNCE_ABILITY_ID), eng.gameTime, 1);
                        }
                    }

                    commandPetAbility(sourcePets, POUNCE_ABILITY_ID, targets, eng, {
                        preGrantCharge: { chargeType: 'commandCharge', amount: 1 },
                    });
                }),
            },
        ],
    },
    { id: 'cooldown', start: CAST_DURATION, end: CAST_DURATION + COOLDOWN_DURATION, abilityPhase: AbilityPhase.Cooldown },
];

const SICE_EM_IMAGE = `<img src="${sicEmIconUrl}" width="56" height="56" alt="" style="object-fit: contain; display: block; margin: 0 auto;" />`;

const SIC_EM_PET_SOURCE = { type: 'pet' as const, selector: 'nearest' as const };

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
