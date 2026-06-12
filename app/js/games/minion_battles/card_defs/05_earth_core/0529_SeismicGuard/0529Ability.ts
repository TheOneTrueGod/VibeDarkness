import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import type { AbilityStatic } from '../../../abilities/Ability';
import type { Unit } from '../../../game/units/Unit';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { areAllies } from '../../../game/teams';
import { EARTH_CORE_SHARED_DIAMETER } from '../earthCoreConstants';
import { addEarthCoreArmour } from '../0527_EarthCoreShared/earthCoreArmour';
import { type CardDef } from '../../types';

const ABILITY_ID = '0529';
const TREMORSENSE_RADIUS_PX = (EARTH_CORE_SHARED_DIAMETER * CELL_SIZE) / 2;
const TIMINGS: AbilityTimingInterval[] = [{ id: 'passive', start: 0, end: 0.1, abilityPhase: AbilityPhase.Active }];

const SEISMIC_GUARD_IMAGE = `<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">
  <circle cx="20" cy="20" r="16" fill="#3f4b2f"/>
  <circle cx="20" cy="20" r="11" fill="none" stroke="#b8e45f" stroke-width="2"/>
  <path d="M8 20 L14 20 M26 20 L32 20 M20 8 L20 14 M20 26 L20 32" stroke="#d8f99d" stroke-width="2"/>
</svg>`;

export type SeismicGuardAttackStartPayload = {
    attackInstanceId: string;
    attacker: Unit;
    target: Unit;
};

export interface SeismicGuardRuntimeState {
    processedAttackIds: Set<string>;
}

export function createSeismicGuardRuntimeState(): SeismicGuardRuntimeState {
    return { processedAttackIds: new Set<string>() };
}

export function handleSeismicGuardAttackStart(
    owner: Unit,
    payload: SeismicGuardAttackStartPayload,
    runtime: SeismicGuardRuntimeState,
): boolean {
    if (runtime.processedAttackIds.has(payload.attackInstanceId)) return false;
    runtime.processedAttackIds.add(payload.attackInstanceId);
    if (!areAllies(owner.teamId, payload.target.teamId)) return false;
    if (areAllies(owner.teamId, payload.attacker.teamId)) return false;

    const distance = Math.hypot(payload.target.x - owner.x, payload.target.y - owner.y);
    if (distance > TREMORSENSE_RADIUS_PX) return false;

    addEarthCoreArmour(payload.target, 1);
    return true;
}

export const SeismicGuard: AbilityStatic = {
    id: ABILITY_ID,
    name: 'Seismic Guard',
    image: SEISMIC_GUARD_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: 0,
    abilityTimings: TIMINGS,
    targets: [],
    getTooltipText(): string[] {
        return ['Passive: attack start on a nearby ally grants that ally {1} armour.'];
    },
    getAbilityStates(): [] {
        return [];
    },
};

export const SeismicGuardCard: CardDef = {
    abilityId: ABILITY_ID,
};
