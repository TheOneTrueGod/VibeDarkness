/**
 * Unit factory registry.
 *
 * Maps character IDs to factory functions that create properly-configured
 * Unit instances with the right stats and resources.
 */

import type { Unit } from '../Unit';
import type { TeamId } from '../../engine/teams';
import type { EventBus } from '../../engine/EventBus';
import { createWarriorUnit } from './WarriorUnit';
import { createMageUnit } from './MageUnit';
import { createRangerUnit } from './RangerUnit';
import { createHealerUnit } from './HealerUnit';
import { createGenericEnemy } from './GenericEnemy';

export type UnitFactoryConfig = {
    id?: string;
    x: number;
    y: number;
    teamId: TeamId;
    ownerId: string;
    name: string;
    abilities?: string[];
};

type UnitFactory = (config: UnitFactoryConfig, eventBus: EventBus) => Unit;

const UNIT_FACTORIES: Record<string, UnitFactory> = {
    warrior: createWarriorUnit,
    mage: createMageUnit,
    ranger: createRangerUnit,
    healer: createHealerUnit,
};

/**
 * Create a unit by character ID. Falls back to GenericEnemy for unknown IDs.
 */
export function createUnitByCharacterId(
    characterId: string,
    config: UnitFactoryConfig,
    eventBus: EventBus,
): Unit {
    const factory = UNIT_FACTORIES[characterId];
    if (factory) {
        return factory(config, eventBus);
    }
    // Fallback: generic enemy with default stats
    return createGenericEnemy(
        { ...config, hp: 50, speed: 120, characterId },
        eventBus,
    );
}

/**
 * Create a unit from a full spawn config (used for enemies with custom stats).
 */
export function createUnitFromSpawnConfig(
    config: {
        id?: string;
        characterId: string;
        name: string;
        hp: number;
        speed: number;
        x: number;
        y: number;
        teamId: TeamId;
        ownerId: string;
        abilities?: string[];
        aiSettings?: import('../Unit').AISettings | null;
    },
    eventBus: EventBus,
): Unit {
    // Try character-specific factory first (for resources), then override stats
    const factory = UNIT_FACTORIES[config.characterId];
    if (factory) {
        const unit = factory(
            {
                id: config.id,
                x: config.x,
                y: config.y,
                teamId: config.teamId,
                ownerId: config.ownerId,
                name: config.name,
                abilities: config.abilities,
            },
            eventBus,
        );
        // Override HP/speed from spawn config
        unit.hp = config.hp;
        unit.maxHp = config.hp;
        unit.speed = config.speed;
        if (config.aiSettings) {
            unit.aiSettings = config.aiSettings;
        }
        return unit;
    }
    return createGenericEnemy(config, eventBus);
}
