/**
 * Order: Move — special action. Zero-frame command that sends the nearest pet to a
 * destination. Cancels basic-attack casts; queues behind other abilities.
 */

import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import {
    resolveAbilitySourceUnits,
    commandPetOrderMove,
} from '../../../abilities/petCommands';
import type { Unit } from '../../../game/units/Unit';
import type { ResolvedTarget } from '../../../game/types';
import { type CardDef } from '../../types';
import { defineAbility } from '../../../abilities/defineAbility';
import type { AbilityStatic, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import type { TargetDef } from '../../../abilities/targeting';
import type { TerrainManager } from '../../../terrain/TerrainManager';

export const ORDER_MOVE_ABILITY_ID = `${formatGroupId(AbilityGroupId.Command)}09`;
/** Command move range from the pet (px). */
export const ORDER_MOVE_MAX_RANGE = 5000;

const SPECIAL_TIMINGS: AbilityTimingInterval[] = [
    {
        id: 'special',
        start: 0,
        end: 0.001,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
    },
];

const ORDER_MOVE_PET_SOURCE = { type: 'pet' as const, selector: 'nearest' as const };

const ORDER_MOVE_IMAGE = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="22" fill="#0a121a" stroke="#1a3a5a" stroke-width="2"/>
  <path d="M20 40 L32 18 L44 40 Z" fill="none" stroke="#5aadff" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="32" cy="34" r="3" fill="#5aadff"/>
</svg>`;

export const OrderMoveAbility: AbilityStatic = defineAbility({
    id: ORDER_MOVE_ABILITY_ID,
    name: 'Order: Move',
    image: ORDER_MOVE_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    maxUses: 1,
    tags: ['free'],
    actionChannel: 'special',
    prefireTime: 0,
    targets: [{ type: 'pixel', label: 'Destination' }] as TargetDef[],
    abilityTimings: SPECIAL_TIMINGS,
    abilitySource: ORDER_MOVE_PET_SOURCE,

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: ORDER_MOVE_MAX_RANGE };
    },

    getTooltipText(): string[] {
        return [
            'Command your pet to move to a point.',
            'Cancels {Basic Attack} casts; other abilities keep going.',
            'Zero-frame special — usable with another action.',
        ];
    },

    applySpecialAction(caster: Unit, targets: ResolvedTarget[], engine: unknown): void {
        const eng = engine as {
            units: Unit[];
            gameTime: number;
            gameTick: number;
            addEffect?(e: unknown): void;
            cancelActiveAbility?(unitId: string, abilityId: string): void;
            terrainManager?: TerrainManager | null;
        };
        const target = targets[0];
        const dest = target?.position;
        if (!dest) return;
        const pets = resolveAbilitySourceUnits(OrderMoveAbility, caster, eng.units, dest);
        if (pets.length === 0) return;
        commandPetOrderMove(pets, dest, eng);
    },

    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        _currentTargets: ResolvedTarget[],
        mouseWorld: { x: number; y: number },
        units: Unit[],
    ): void {
        const pets = resolveAbilitySourceUnits(OrderMoveAbility, caster, units, mouseWorld);
        const origin = pets[0] ?? caster;
        gr.clear();
        gr.moveTo(origin.x, origin.y);
        gr.lineTo(mouseWorld.x, mouseWorld.y);
        gr.stroke({ color: 0x5aadff, width: 2, alpha: 0.7 });
        gr.circle(mouseWorld.x, mouseWorld.y, 10);
        gr.stroke({ color: 0x5aadff, width: 2, alpha: 0.85 });
    },
});

export const OrderMoveCard: CardDef = {
    abilityId: ORDER_MOVE_ABILITY_ID,
};
