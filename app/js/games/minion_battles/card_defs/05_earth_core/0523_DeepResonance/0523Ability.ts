import type { AbilityStatic, AttackBlockedInfo } from '../../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import type { Unit } from '../../../game/units/Unit';
import type { ResolvedTarget } from '../../../game/types';
import { asCardDefId, type CardDef } from '../../types';
import { DEEP_RESONANCE_PASSIVE_ID } from '../../../abilities/earthCoreMeleePassives';

const TIMINGS: AbilityTimingInterval[] = [
    { id: 'passive', start: 0, end: 0.01, abilityPhase: AbilityPhase.Active },
];

export const DeepResonanceAbility: AbilityStatic = {
    id: DEEP_RESONANCE_PASSIVE_ID,
    name: 'Deep Resonance',
    image: '',
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: 0,
    abilityTimings: TIMINGS,
    targets: [],
    getTooltipText(): string[] {
        return ['Passive: Increase Tremorsense range by {1} tile'];
    },
    getAbilityStates(): [] {
        return [];
    },
    doCardEffect(_engine: unknown, _caster: Unit, _targets: ResolvedTarget[], _prevTime: number, _currentTime: number): void {},
    onAttackBlocked(_engine: unknown, _defender: Unit, _attackInfo: AttackBlockedInfo): void {},
};

export const DeepResonanceCard: CardDef = {
    id: asCardDefId(DEEP_RESONANCE_PASSIVE_ID),
    name: 'Deep Resonance',
    abilityId: DEEP_RESONANCE_PASSIVE_ID,
    durability: 999,
    discardDuration: { duration: 999, unit: 'rounds' },
};
