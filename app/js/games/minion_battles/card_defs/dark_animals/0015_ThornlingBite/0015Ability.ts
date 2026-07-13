/**
 * ThornlingBite — basic melee attack for thornling units.
 * A quick skittering bite; weak damage befitting the small, expendable creature.
 */

import { BasicAttackBuilder } from '../../../abilities/archetypes/BasicAttackBuilder';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';

const CARD_ID = `${formatGroupId(AbilityGroupId.Enemy)}15`;
const DAMAGE = 1;

const { ability: ThornlingBiteAbility, card: ThornlingBiteCard } = BasicAttackBuilder({
    id: CARD_ID,
    name: 'Bite',
    description: `A biting attack dealing {${DAMAGE}} damage.`,
    damage: DAMAGE,
    telegraphColor: 0x3a8f20,
    // Keep the telegraph locked onto the target unit right up until the bite itself fires
    // (the 'strike' interval from defineMeleeStrike), rather than freezing at windup end.
    trackTargetUntilLabel: 'strike',
}).build();

export { ThornlingBiteAbility, ThornlingBiteCard };
