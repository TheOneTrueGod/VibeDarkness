import type { AbilityStatic, AttackBlockedInfo } from '../../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import type { Unit } from '../../../game/units/Unit';
import type { ResolvedTarget } from '../../../game/types';
import { asCardDefId, type CardDef } from '../../types';
import { BEDROCK_SCAVENGER_PASSIVE_ID } from '../../../abilities/earthCoreMeleePassives';

const TIMINGS: AbilityTimingInterval[] = [
    { id: 'passive', start: 0, end: 0.01, abilityPhase: AbilityPhase.Active },
];

export const BedrockScavengerAbility: AbilityStatic = {
    id: BEDROCK_SCAVENGER_PASSIVE_ID,
    name: 'Bedrock Scavenger',
    image: '',
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: 0,
    abilityTimings: TIMINGS,
    targets: [],
    getTooltipText(): string[] {
        return ['Passive: At round start gain armour from nearby stone in Tremorsense (max {3})'];
    },
    getAbilityStates(): [] {
        return [];
    },
    doCardEffect(_engine: unknown, _caster: Unit, _targets: ResolvedTarget[], _prevTime: number, _currentTime: number): void {},
    onAttackBlocked(_engine: unknown, _defender: Unit, _attackInfo: AttackBlockedInfo): void {},
};

export const BedrockScavengerCard: CardDef = {
    id: asCardDefId(BEDROCK_SCAVENGER_PASSIVE_ID),
    name: 'Bedrock Scavenger',
    abilityId: BEDROCK_SCAVENGER_PASSIVE_ID,
    durability: 999,
    discardDuration: { duration: 999, unit: 'rounds' },
};
