/**
 * EarthCoreThrowRock - Throw Rock's Earth Core variant.
 *
 * Identical to Throw Rock in every way (targeting, timing, damage, More Rock/More Power
 * research) except it costs 1 rock resource per throw instead of a stamina-charged use,
 * and never runs out. Granted by researching Earth Core, which replaces the base Throw Rock card.
 */

import { buildThrowRockAbility } from '../../0107_ThrowRock/0107Ability';
import { type CardDef } from '../../types';

const ABILITY_ID = 'earth_core_throw_rock';

export const EarthCoreThrowRock = buildThrowRockAbility({
    id: ABILITY_ID,
    name: 'Earth Core Throw Rock',
    tags: ['RockThrow', 'free'],
    resourceCost: { resourceId: 'rock', amount: 1 },
    maxUses: 1,
});

export const EarthCoreThrowRockCard: CardDef = {
    abilityId: ABILITY_ID,
};
