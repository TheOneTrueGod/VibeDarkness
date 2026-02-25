/**
 * DarkWolf - Small, fast enemy with DarkWolfBite lunge ability.
 * 12 HP, ~20% higher than default speed, 50% of default unit size.
 */

import { Unit } from '../../Unit';
import type { TeamId } from '../../../engine/teams';
import type { EventBus } from '../../../engine/EventBus';
import { DEFAULT_UNIT_RADIUS } from '../../../constants/unitConstants';

const DARK_WOLF_HP = 12;
/** Default speed is 100; 20% higher = 120. */
const DARK_WOLF_SPEED = 120;
const DARK_WOLF_RADIUS = DEFAULT_UNIT_RADIUS * 0.5;

export const DARK_WOLF_RADIUS_VALUE = DARK_WOLF_RADIUS;

export function createDarkWolfUnit(
    config: {
        id?: string;
        x: number;
        y: number;
        teamId: TeamId;
        ownerId: string;
        name: string;
        abilities?: string[];
        hp?: number;
        speed?: number;
        radius?: number;
    },
    _eventBus: EventBus,
): Unit {
    const unit = new Unit({
        ...config,
        hp: config.hp ?? DARK_WOLF_HP,
        maxHp: config.hp ?? DARK_WOLF_HP,
        speed: config.speed ?? DARK_WOLF_SPEED,
        characterId: 'dark_wolf',
        radius: config.radius ?? DARK_WOLF_RADIUS,
    });
    return unit;
}
