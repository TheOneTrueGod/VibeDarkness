/**
 * WarriorUnit - Tanky melee character with Rage resource.
 */

import { Unit } from '../Unit';
import { Rage } from '../../resources/Rage';
import type { TeamId } from '../../engine/teams';
import type { EventBus } from '../../engine/EventBus';

export const WARRIOR_DEFAULTS = {
    hp: 100,
    speed: 150,
    radius: 22,
};

export function createWarriorUnit(config: {
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
        hp: WARRIOR_DEFAULTS.hp,
        speed: WARRIOR_DEFAULTS.speed,
        characterId: 'warrior',
    });
    unit.radius = WARRIOR_DEFAULTS.radius;
    unit.attachResource(new Rage(), eventBus);
    return unit;
}
