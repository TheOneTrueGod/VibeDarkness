/**
 * Guard — Order: Move's other mode (the `guard` entry in its `abilityModes.modeAbilityIds`). Zero-frame
 * special with no target: the spirit drops its ordered point and anchors on the player again, staying
 * within its `anchorRadius` of them. Never occupies a bar slot of its own.
 */
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { resolveAbilitySourceUnits, commandPetGuard } from '../../../abilities/petCommands';
import type { Unit } from '../../../game/units/Unit';
import type { ResolvedTarget } from '../../../game/types';
import { defineAbility } from '../../../abilities/defineAbility';
import type { AbilityStatic } from '../../../abilities/Ability';

export const GUARD_ABILITY_ID = `${formatGroupId(AbilityGroupId.Command)}12`;

const SPECIAL_TIMINGS: AbilityTimingInterval[] = [
    { id: 'special', start: 0, end: 0.001, abilityPhase: AbilityPhase.Active, doNotRefund: true },
];

const GUARD_IMAGE = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="22" fill="#0f766e" stroke="#d9f99d" stroke-width="2"/>
  <path d="M32 16 L45 21 L45 33 C45 41 39 46 32 49 C25 46 19 41 19 33 L19 21 Z" fill="none" stroke="#d9f99d" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="32" cy="33" r="3" fill="#d9f99d"/>
</svg>`;

export const GuardAbility: AbilityStatic = defineAbility({
    id: GUARD_ABILITY_ID,
    name: 'Guard',
    image: GUARD_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    maxUses: 1,
    tags: ['free', 'secondary'],
    actionChannel: 'special',
    prefireTime: 0,
    targets: [],
    abilityTimings: SPECIAL_TIMINGS,
    abilitySource: { type: 'pet', selector: 'nearest' },
    getRange: () => ({ minRange: 0, maxRange: 0 }),

    getTooltipText(): string[] {
        return [
            'Call your spirit back to guard you. It stays close to your side.',
            'Zero-frame special — usable with another action.',
        ];
    },

    applySpecialAction(caster: Unit, _targets: ResolvedTarget[], engine: unknown): void {
        const eng = engine as { units: Unit[]; addEffect?(e: unknown): void };
        const pets = resolveAbilitySourceUnits(GuardAbility, caster, eng.units);
        if (pets.length === 0) return;
        commandPetGuard(pets, eng, caster);
    },
});
