/**
 * Throw Knife card definition.
 */

import type { CardDef } from './types';

const card: CardDef = {
    id: 'throw_knife',
    name: 'Throw Knife',
    abilityId: 'throw_knife',
    durability: 3,
    discardDuration: { duration: 1, unit: 'rounds' },
};

export default card;
