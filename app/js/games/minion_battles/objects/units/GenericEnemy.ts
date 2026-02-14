/**
 * GenericEnemy - Configurable enemy unit.
 *
 * Uses a characterId to pick visual appearance but allows overriding
 * HP, speed, and abilities through the spawn config.
 */

import { Unit } from '../Unit';
import type { TeamId } from '../../engine/teams';
import type { EventBus } from '../../engine/EventBus';

export function createGenericEnemy(config: {
    id?: string;
    x: number;
    y: number;
    hp: number;
    speed: number;
    teamId: TeamId;
    characterId: string;
    name: string;
    abilities?: string[];
}, _eventBus: EventBus): Unit {
    const unit = new Unit({
        ...config,
        ownerId: 'ai',
    });
    return unit;
}
