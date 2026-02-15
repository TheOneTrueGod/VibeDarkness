/**
 * HealerUnit - Support character with Mana resource.
 */

import { Unit } from '../Unit';
import { Mana } from '../../resources/Mana';
import type { TeamId } from '../../engine/teams';
import type { EventBus } from '../../engine/EventBus';

export const HEALER_DEFAULTS = {
    hp: 70,
    speed: 105,
    radius: 18,
};

export function createHealerUnit(config: {
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
        hp: HEALER_DEFAULTS.hp,
        speed: HEALER_DEFAULTS.speed,
        characterId: 'healer',
    });
    unit.radius = HEALER_DEFAULTS.radius;
    unit.attachResource(new Mana(), eventBus);
    return unit;
}
