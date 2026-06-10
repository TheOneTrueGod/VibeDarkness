/**
 * Sic 'em — player command card that triggers the dog's Pounce from a distance.
 * The player clicks a target point; the nearest living pet leaps at it using Pounce (0702).
 * The targeting preview draws from the pet's position, not the caster, so the player can
 * see the actual dash line. If there are no living pets, the cast fizzles (no order queued).
 */

import type { AbilityRecoveryRule, AbilityStatic, AbilityStateEntry, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { resolveAbilitySourceUnits, commandPetAbility } from '../../../abilities/petCommands';
import type { Unit } from '../../../game/units/Unit';
import type { ResolvedTarget } from '../../../game/types';
import { type CardDef } from '../../types';
import sicEmIconUrl from './sic_em.png';

const CARD_ID = `${formatGroupId(AbilityGroupId.Command)}04`;
const MAX_USES = 2;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 2, usesRecovered: 1 },
];
const POUNCE_ABILITY_ID = `${formatGroupId(AbilityGroupId.Command)}02`;
const MAX_POUNCE_RANGE = 180;

const CAST_DURATION = 0.1;
const COOLDOWN_DURATION = 2.0;

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    { id: 'active', start: 0, end: CAST_DURATION, abilityPhase: AbilityPhase.Active },
    { id: 'cooldown', start: CAST_DURATION, end: CAST_DURATION + COOLDOWN_DURATION, abilityPhase: AbilityPhase.Cooldown },
];

interface SicEmEngineLike {
    gameTime: number;
    gameTick: number;
    units: Unit[];
    state: {
        orderMgr: {
            queueOrder(atTick: number, order: { unitId: string; abilityId: string; targets: ResolvedTarget[] }): void;
        };
    };
}

const SICE_EM_IMAGE = `<img src="${sicEmIconUrl}" width="56" height="56" alt="" style="object-fit: contain; display: block; margin: 0 auto;" />`;

export const SicEmAbility: AbilityStatic = {
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

    getTooltipText(): string[] {
        return [`Command the nearest pet to {Pounce} through enemies at the target point (stops on the 4th hit).`];
    },

    getAbilityStates(): AbilityStateEntry[] {
        return [];
    },

    doCardEffect(
        engine: unknown,
        caster: Unit,
        targets: ResolvedTarget[],
        prevTime: number,
    ): void {
        if (prevTime > 0) return;

        const t = targets[0];
        const aimPoint = t?.type === 'pixel' && t.position ? t.position : undefined;

        const eng = engine as SicEmEngineLike;
        const sourcePets = resolveAbilitySourceUnits(SicEmAbility, caster, eng.units, aimPoint);
        if (sourcePets.length === 0) return;

        commandPetAbility(sourcePets, POUNCE_ABILITY_ID, targets, eng);
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

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: MAX_POUNCE_RANGE };
    },

    onAttackBlocked(): void {},
};

export const SicEmCard: CardDef = {
    abilityId: CARD_ID,
};
