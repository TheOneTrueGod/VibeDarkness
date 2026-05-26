import type { AbilityStatic, AttackBlockedInfo } from '../../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import type { Unit } from '../../../game/units/Unit';
import type { ResolvedTarget } from '../../../game/types';
import { asCardDefId, type CardDef } from '../../types';
import { IMPACT_CONVERSION_PASSIVE_ID } from '../../../abilities/earthCoreMeleePassives';

const TIMINGS: AbilityTimingInterval[] = [
    { id: 'passive', start: 0, end: 0.01, abilityPhase: AbilityPhase.Active },
];

export const ImpactConversionAbility: AbilityStatic = {
    id: IMPACT_CONVERSION_PASSIVE_ID,
    name: 'Impact Conversion',
    image: '',
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: 0,
    abilityTimings: TIMINGS,
    targets: [],
    getTooltipText(): string[] {
        return ['Passive: Gain Resonance when damage removes your armour'];
    },
    getAbilityStates(): [] {
        return [];
    },
    doCardEffect(_engine: unknown, _caster: Unit, _targets: ResolvedTarget[], _prevTime: number, _currentTime: number): void {},
    onAttackBlocked(_engine: unknown, _defender: Unit, _attackInfo: AttackBlockedInfo): void {},
};

export const ImpactConversionCard: CardDef = {
    id: asCardDefId(IMPACT_CONVERSION_PASSIVE_ID),
    name: 'Impact Conversion',
    abilityId: IMPACT_CONVERSION_PASSIVE_ID,
    discardDuration: { duration: 999, unit: 'rounds' },
};
