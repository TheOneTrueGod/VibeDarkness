/**
 * Sic 'em — player command card that triggers the dog's Pounce from a distance.
 * The player clicks a target point; the nearest living pet leaps at it using Pounce (0702).
 * The targeting preview draws from the pet's position, not the caster, so the player can
 * see the actual dash line. If there are no living pets, the cast fizzles (no order queued).
 */

import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { resolveAbilitySourceUnits, commandPetAbility } from '../../../abilities/petCommands';
import { DoubleDamageBuff, DOUBLE_DAMAGE_BUFF_TYPE } from '../../../buffs/DoubleDamageBuff';
import type { Unit } from '../../../game/units/Unit';
import type { ResolvedTarget } from '../../../game/types';
import { type CardDef } from '../../types';
import { MAX_DASH_DISTANCE as MAX_POUNCE_RANGE } from '../0702_Pounce/0702Ability';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import type { AbilityRecoveryRule, IAbilityPreviewGraphics } from '../../../abilities/Ability';
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

export const SicEmAbility = defineAbility({
    id: CARD_ID,
    name: "Sic 'em",
    image: SICE_EM_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    prefireTime: 0,
    targets: [{ type: 'pixel', label: 'Pounce target' }],
    abilityTimings: ABILITY_TIMINGS,
    abilitySource: { type: 'pet', selector: 'nearest' },

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: MAX_POUNCE_RANGE };
    },

    getTooltipText(): string[] {
        return [`Command the nearest pet to {Pounce} through enemies at the target point (stops on the 4th hit).`];
    },

    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        currentTargets: ResolvedTarget[],
        mouseWorld: { x: number; y: number },
        units: readonly Unit[],
    ): void {
        // Draw from the nearest pet's position rather than the caster.
        const sourcePets = resolveAbilitySourceUnits(SicEmAbility, caster, units, mouseWorld);
        const pet = sourcePets[0];
        if (!pet) {
            // No pet — draw a faint X at the caster to signal fizzle.
            gr.moveTo(caster.x - 8, caster.y - 8);
            gr.lineTo(caster.x + 8, caster.y + 8);
            gr.moveTo(caster.x + 8, caster.y - 8);
            gr.lineTo(caster.x - 8, caster.y + 8);
            gr.stroke({ color: 0x888888, width: 2, alpha: 0.5 });
            return;
        }

        // Clamp the dash to max pounce range from the pet.
        const dx = mouseWorld.x - pet.x;
        const dy = mouseWorld.y - pet.y;
        const dist = Math.hypot(dx, dy);
        const clampedDist = Math.min(MAX_POUNCE_RANGE, dist);
        const endX = dist > 0 ? pet.x + (dx / dist) * clampedDist : pet.x;
        const endY = dist > 0 ? pet.y + (dy / dist) * clampedDist : pet.y;

        gr.moveTo(pet.x, pet.y);
        gr.lineTo(endX, endY);
        gr.stroke({ color: 0xff8800, width: 8, alpha: 0.6 });
        gr.circle(endX, endY, pet.radius * 1.1);
        gr.stroke({ color: 0xff8800, width: 2, alpha: 0.8 });

        // Suppress unused param lint.
        void currentTargets;
    },
});

export const SicEmCard: CardDef = {
    abilityId: CARD_ID,
};
