/**
 * WarriorUnit - Tanky melee character with Rage resource.
 */

import { Unit } from '../Unit';
import { Rage } from '../../resources/Rage';
import type { TeamId } from '../../engine/teams';
import type { EventBus } from '../../engine/EventBus';
import { getDefaultHp, getDefaultSpeed } from '../../engine/unitDef';

export const WARRIOR_DEFAULTS = {
    hp: 100,
    speed: 100,
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
    hp?: number;
    speed?: number;
}, eventBus: EventBus): Unit {
    const unit = new Unit({
        ...config,
        hp: config.hp ?? getDefaultHp('warrior'),
        speed: config.speed ?? getDefaultSpeed('warrior'),
        characterId: 'warrior',
    });
    unit.radius = WARRIOR_DEFAULTS.radius;
    unit.attachResource(new Rage(), eventBus);
    return unit;
}
