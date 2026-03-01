/**
 * Throw Rock card definition.
 */

import type { CardDef } from './types';

const card: CardDef = {
    id: 'throw_rock',
    name: 'Throw Rock',
    abilityId: 'throw_rock',
    durability: 3,
    discardDuration: { duration: 1, unit: 'rounds' },
};

export default card;
