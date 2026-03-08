/**
 * Unit factory registry.
 *
 * Maps character IDs to factory functions that create properly-configured
 * Unit instances with the right stats and resources.
 */

import type { Unit } from '../Unit';
import type { TeamId } from '../../engine/teams';
import type { EventBus } from '../../engine/EventBus';
import { getDefaultHp, getDefaultSpeed } from '../../engine/unitDef';
import { createWarriorUnit } from './WarriorUnit';
import { createMageUnit } from './MageUnit';
import { createRangerUnit } from './RangerUnit';
import { createHealerUnit } from './HealerUnit';
import { createGenericEnemy } from './GenericEnemy';
import { createDarkWolfUnit } from './dark_animals/DarkWolf';

/** Character IDs that have a dedicated unit factory. Used for createUnitByCharacterId only. */
const CHARACTER_IDS = ['warrior', 'mage', 'ranger', 'healer', 'dark_wolf'] as const;
export type CharacterId = (typeof CHARACTER_IDS)[number];

export type UnitFactoryConfig = {
    id?: string;
    x: number;
    y: number;
    teamId: TeamId;
    ownerId: string;
    name: string;
    abilities?: string[];
    /** Override default HP for this unit. Uses getDefaultHp(characterId) when not set. */
    hp?: number;
    /** Override default speed for this unit. Uses getDefaultSpeed(characterId) when not set. */
    speed?: number;
};

type UnitFactory = (config: UnitFactoryConfig, eventBus: EventBus) => Unit;

const UNIT_FACTORIES: Record<CharacterId, UnitFactory> = {
    warrior: createWarriorUnit,
    mage: createMageUnit,
    ranger: createRangerUnit,
    healer: createHealerUnit,
    dark_wolf: createDarkWolfUnit,
};

/**
 * Create a unit by character ID. Only accepts CharacterId (no portrait IDs).
 * Use createPlayerUnit for player-controlled units.
 */
export function createUnitByCharacterId(
    characterId: CharacterId,
    config: UnitFactoryConfig,
    eventBus: EventBus,
): Unit {
    return UNIT_FACTORIES[characterId](config, eventBus);
}

/**
 * Create a player-controlled unit. Use this for all player units; do not use
 * portrait IDs as characterId. Appearance is determined by appearanceCharacterId
 * (defaults to 'warrior' for portraits that have no unit class).
 */
export function createPlayerUnit(
    config: UnitFactoryConfig & { appearanceCharacterId?: CharacterId },
    eventBus: EventBus,
): Unit {
    const appearanceCharacterId = config.appearanceCharacterId ?? 'warrior';
    const { appearanceCharacterId: _drop, ...factoryConfig } = config;
    return createUnitByCharacterId(appearanceCharacterId, factoryConfig, eventBus);
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
        radius?: number;
    },
    eventBus: EventBus,
): Unit {
    // Try character-specific factory first (for resources), then override stats
    const characterId = config.characterId;
    const factory = CHARACTER_IDS.includes(characterId as CharacterId)
        ? UNIT_FACTORIES[characterId as CharacterId]
        : undefined;
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
        // Override HP/speed/radius from spawn config
        unit.hp = config.hp;
        unit.maxHp = config.hp;
        unit.speed = config.speed;
        if (config.radius !== undefined) {
            unit.radius = config.radius;
        }
        if (config.aiSettings) {
            unit.aiSettings = config.aiSettings;
        }
        return unit;
    }
    return createGenericEnemy(config, eventBus);
}
