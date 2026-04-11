/**
 * HealerUnit - Support character with Mana resource.
 */

import { Unit } from '../Unit';
import { Mana } from '../../resources/Mana.ts';
import type { TeamId } from '../../game/teams';
import type { EventBus } from '../../game/EventBus';
import { getDefaultHp, getDefaultSpeed } from '../../game/units/unit_defs/unitDef';

export const HEALER_DEFAULTS = {
    hp: 70,
    speed: 70,
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
    hp?: number;
    speed?: number;
}, eventBus: EventBus): Unit {
    const unit = new Unit({
        ...config,
        hp: config.hp ?? getDefaultHp('healer'),
        speed: config.speed ?? getDefaultSpeed('healer'),
        characterId: 'healer',
    });
    unit.radius = HEALER_DEFAULTS.radius;
    unit.attachResource(new Mana(), eventBus);
    return unit;
}
