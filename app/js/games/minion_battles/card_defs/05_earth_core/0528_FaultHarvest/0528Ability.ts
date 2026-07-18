import { AbilityPhase } from '../../../abilities/abilityTimings';
import type { AbilityStatic } from '../../../abilities/Ability';
import type { Unit } from '../../../game/units/Unit';
import { type CardDef } from '../../types';
import { EARTH_CORE_RESONANCE_GAIN_ON_OWN_ARMOUR_BREAK } from '../earthCoreConstants';
import { getEarthCoreArmour } from '../0527_EarthCoreShared/earthCoreArmour';

const ABILITY_ID = '0528';

const FAULT_HARVEST_IMAGE = `<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="6" width="28" height="28" rx="6" fill="#5d6b3a"/>
  <path d="M10 10 L18 22 L14 30 L26 30 L22 20 L30 10" fill="none" stroke="#b8e45f" stroke-width="3"/>
</svg>`;

export function applyFaultHarvestOnArmourBreak(owner: Unit, previousArmourAmount?: number): boolean {
    const currentArmour = getEarthCoreArmour(owner);
    if (currentArmour > 0) return false;
    if (typeof previousArmourAmount === 'number' && previousArmourAmount <= 0) return false;
    const resonance = owner.getResource('resonance');
    if (!resonance) return false;
    resonance.add(EARTH_CORE_RESONANCE_GAIN_ON_OWN_ARMOUR_BREAK);
    return true;
}

export const FaultHarvest: AbilityStatic = {
    id: ABILITY_ID,
    name: 'Fault Harvest',
    image: FAULT_HARVEST_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: 0,
    abilityTimings: [{ id: 'passive', start: 0, end: 0.1, abilityPhase: AbilityPhase.Active, doNotRefund: true }],
    targets: [],
    getTooltipText(): string[] {
        return ['Passive: when your armour breaks, gain {12} Resonance.'];
    },
    getAbilityStates(): [] {
        return [];
    },
};

export const FaultHarvestCard: CardDef = {
    abilityId: ABILITY_ID,
};
