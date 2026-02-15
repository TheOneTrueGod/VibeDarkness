/**
 * RangerUnit - Ranged character with no special resource (for now).
 */

import { Unit } from '../Unit';
import type { TeamId } from '../../engine/teams';
import type { EventBus } from '../../engine/EventBus';

export const RANGER_DEFAULTS = {
    hp: 75,
    speed: 135,
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
}, _eventBus: EventBus): Unit {
    const unit = new Unit({
        ...config,
        hp: RANGER_DEFAULTS.hp,
        speed: RANGER_DEFAULTS.speed,
        characterId: 'ranger',
    });
    unit.radius = RANGER_DEFAULTS.radius;
    return unit;
}
