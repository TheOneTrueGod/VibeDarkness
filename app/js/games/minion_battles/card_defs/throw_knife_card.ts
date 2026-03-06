/**
 * Throw Knife card definition.
 */

import { asCardDefId, type CardDef } from './types';

const card: CardDef = {
    id: asCardDefId('throw_knife'),
    name: 'Throw Knife',
    abilityId: 'throw_knife',
    durability: 2,
    discardDuration: { duration: 1, unit: 'rounds' },
};

export default card;
