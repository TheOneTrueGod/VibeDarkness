/**
 * MageUnit - Fragile caster with Mana resource.
 */

import { Unit } from './Unit';
import { Mana } from '../../resources/Mana.ts';
import type { TeamId } from '../teams';
import type { EventBus } from '../EventBus';
import { getDefaultHp, getDefaultSpeed } from './unit_defs/unitDef';

export const MAGE_DEFAULTS = {
    hp: 60,
    speed: 60,
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
    hp?: number;
    speed?: number;
}, eventBus: EventBus): Unit {
    const unit = new Unit({
        ...config,
        hp: config.hp ?? getDefaultHp('mage'),
        speed: config.speed ?? getDefaultSpeed('mage'),
        characterId: 'mage',
    });
    unit.radius = MAGE_DEFAULTS.radius;
    unit.attachResource(new Mana(), eventBus);
    return unit;
}
