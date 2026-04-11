/**
 * RangerUnit - Ranged character with no special resource (for now).
 */

import { Unit } from './Unit';
import type { TeamId } from '../teams';
import type { EventBus } from '../EventBus';
import { getDefaultHp, getDefaultSpeed } from './unit_defs/unitDef';

export const RANGER_DEFAULTS = {
    hp: 75,
    speed: 90,
    radius: 18,
};

export function createRangerUnit(config: {
    id?: string;
    x: number;
    y: number;
    teamId: TeamId;
    ownerId: string;
    name: string;
    abilities?: string[];
    hp?: number;
    speed?: number;
}, _eventBus: EventBus): Unit {
    const unit = new Unit({
        ...config,
        hp: config.hp ?? getDefaultHp('ranger'),
        speed: config.speed ?? getDefaultSpeed('ranger'),
        characterId: 'ranger',
    });
    unit.radius = RANGER_DEFAULTS.radius;
    return unit;
}
