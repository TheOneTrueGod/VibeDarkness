import type { AbilityStatic, AttackBlockedInfo } from '../../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import type { Unit } from '../../../game/units/Unit';
import { type CardDef } from '../../types';
import {
    BEDROCK_SCAVENGER_PASSIVE_ID,
    countStoneTilesInTremorsense,
    getBedrockScavengerRoundStartArmour,
} from '../../../abilities/earthCoreMeleePassives';
import { grantEarthCoreArmourFromSource } from '../../../abilities/earthCoreArmour';
import type { EngineContext } from '../../../game/EngineContext';

const TIMINGS: AbilityTimingInterval[] = [
    { id: 'passive', start: 0, end: 0.01, abilityPhase: AbilityPhase.Active },
];

export const BedrockScavengerAbility: AbilityStatic = {
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
    onAttackBlocked(_engine: unknown, _defender: Unit, _attackInfo: AttackBlockedInfo): void {},
    onRoundStart(unit: Unit, engine: EngineContext): void {
        if (!engine.terrainManager) return;
        const stoneTiles = countStoneTilesInTremorsense(unit, engine.terrainManager);
        const armourGain = getBedrockScavengerRoundStartArmour(stoneTiles);
        if (armourGain <= 0) return;
        grantEarthCoreArmourFromSource(unit, 'bedrock_scavenger', armourGain, 3);
    },
};

export const BedrockScavengerCard: CardDef = {
    abilityId: BEDROCK_SCAVENGER_PASSIVE_ID,
};
