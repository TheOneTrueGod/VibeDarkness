import { asCardDefId, type CardDef } from '../types';
import { DoublePunchAbility } from './0116Ability';

export const DoublePunchCard: CardDef = {
    id: asCardDefId(DoublePunchAbility.id),
    name: 'Double Punch',
    abilityId: DoublePunchAbility.id,
    durability: 2,
    discardDuration: { duration: 1, unit: 'rounds' },
};
