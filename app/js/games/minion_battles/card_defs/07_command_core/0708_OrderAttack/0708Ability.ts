/**
 * Order: Attack — special action. Zero-frame command that locks the nearest pet onto
 * an enemy with sticky focus until the target dies or another order arrives.
 */

import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import {
    resolveAbilitySourceUnits,
    commandPetOrderAttack,
} from '../../../abilities/petCommands';
import type { Unit } from '../../../game/units/Unit';
import type { ResolvedTarget } from '../../../game/types';
import { type CardDef } from '../../types';
import { defineAbility } from '../../../abilities/defineAbility';
import { createUnitTargetPreview } from '../../../abilities/previewHelpers';
import type { AbilityStatic, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import type { TargetDef } from '../../../abilities/targeting';

export const ORDER_ATTACK_ABILITY_ID = `${formatGroupId(AbilityGroupId.Command)}08`;
/** Command range from the player caster (px). */
export const ORDER_ATTACK_MAX_RANGE = 2000;

const SPECIAL_TIMINGS: AbilityTimingInterval[] = [
    {
        id: 'special',
        start: 0,
        end: 0.001,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
    },
];

const ORDER_ATTACK_PET_SOURCE = { type: 'pet' as const, selector: 'nearest' as const };

const ORDER_ATTACK_IMAGE = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="22" fill="#1a0808" stroke="#5a1010" stroke-width="2"/>
  <path d="M32 14 L36 28 L50 28 L38 36 L42 50 L32 40 L22 50 L26 36 L14 28 L28 28 Z" fill="#e04444" stroke="#ff8888" stroke-width="1"/>
</svg>`;

export const OrderAttackAbility: AbilityStatic = defineAbility({
    id: ORDER_ATTACK_ABILITY_ID,
    name: 'Order: Attack',
    image: ORDER_ATTACK_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    maxUses: 1,
    tags: ['free'],
    actionChannel: 'special',
    prefireTime: 0,
    targets: [{ type: 'unit', label: 'Focus' }] as TargetDef[],
    abilityTimings: SPECIAL_TIMINGS,
    abilitySource: ORDER_ATTACK_PET_SOURCE,

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: ORDER_ATTACK_MAX_RANGE };
    },

    getTooltipText(): string[] {
        return [
            'Command your pet to focus an enemy and keep attacking it.',
            'Zero-frame special — usable with another action.',
        ];
    },

    applySpecialAction(caster: Unit, targets: ResolvedTarget[], engine: unknown): void {
        const eng = engine as {
            units: Unit[];
            gameTime: number;
            addEffect(e: unknown): void;
            cancelActiveAbility?(unitId: string, abilityId: string): void;
        };
        const target = targets[0];
        if (!target || target.type !== 'unit' || !target.unitId) return;
        const pets = resolveAbilitySourceUnits(OrderAttackAbility, caster, eng.units);
        if (pets.length === 0) return;
        commandPetOrderAttack(pets, target.unitId, eng);
    },

    renderTargetingPreviewSelectedTargets: createUnitTargetPreview({
        getMinRange: () => 0,
        getMaxRange: () => ORDER_ATTACK_MAX_RANGE,
    }),

    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        _currentTargets: ResolvedTarget[],
        mouseWorld: { x: number; y: number },
        units: Unit[],
    ): void {
        OrderAttackAbility.renderTargetingPreviewSelectedTargets?.(
            gr,
            caster,
            _currentTargets,
            mouseWorld,
            units,
        );
    },
});

export const OrderAttackCard: CardDef = {
    abilityId: ORDER_ATTACK_ABILITY_ID,
};
