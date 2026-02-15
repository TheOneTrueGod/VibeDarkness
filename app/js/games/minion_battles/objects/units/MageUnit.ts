/**
 * MageUnit - Fragile caster with Mana resource.
 */

import { Unit } from '../Unit';
import { Mana } from '../../resources/Mana';
import type { TeamId } from '../../engine/teams';
import type { EventBus } from '../../engine/EventBus';

export const MAGE_DEFAULTS = {
    hp: 60,
    speed: 90,
    radius: 18,
};

export function createMageUnit(config: {
    id?: string;
    x: number;
    y: number;
    teamId: TeamId;
    ownerId: string;
    name: string;
    abilities?: string[];
}, eventBus: EventBus): Unit {
    const unit = new Unit({
        ...config,
        hp: MAGE_DEFAULTS.hp,
        speed: MAGE_DEFAULTS.speed,
        characterId: 'mage',
    });
    unit.radius = MAGE_DEFAULTS.radius;
    unit.attachResource(new Mana(), eventBus);
    return unit;
}
