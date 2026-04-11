/**
 * Unit factory registry.
 *
 * Maps character IDs to factory functions that create properly-configured
 * Unit instances with the right stats and resources.
 */

import { Unit } from '../Unit';
import type { TeamId } from '../../game/teams';
import type { EventBus } from '../../game/EventBus';
import { Rage } from '../../resources/Rage';
import { Mana } from '../../resources/Mana';
import { getDefaultHp, getDefaultSpeed, getDefaultRadius } from '../../game/units/unit_defs/unitDef';
import { DEFAULT_UNIT_RADIUS } from '../../constants/unitConstants';

/** Character IDs that have a dedicated unit factory. Used for createUnitByCharacterId only. */
const CHARACTER_IDS = ['warrior', 'mage', 'ranger', 'healer', 'dark_wolf', 'alpha_wolf', 'boar'] as const;
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
    /** Override max HP (e.g. from research). Defaults to hp when not set. */
    maxHp?: number;
    /** Override default speed for this unit. Uses getDefaultSpeed(characterId) when not set. */
    speed?: number;
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
    const hp = config.hp ?? getDefaultHp(characterId);
    const maxHp = config.maxHp ?? hp;
    const speed = config.speed ?? getDefaultSpeed(characterId);
    const radius = getDefaultRadius(characterId, DEFAULT_UNIT_RADIUS);

    const unit = new Unit({
        ...config,
        hp,
        maxHp,
        speed,
        characterId,
        radius,
    });

    switch (characterId) {
        case 'warrior':
            unit.attachResource(new Rage(), eventBus);
            break;
        case 'mage':
        case 'healer':
            unit.attachResource(new Mana(), eventBus);
            break;
    }

    return unit;
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
        unitAITreeId?: string;
    },
    _eventBus: EventBus,
): Unit {
    const unit = new Unit({
        id: config.id,
        x: config.x,
        y: config.y,
        teamId: config.teamId,
        ownerId: config.ownerId,
        name: config.name,
        abilities: config.abilities,
        hp: config.hp,
        maxHp: config.hp,
        speed: config.speed,
        characterId: config.characterId,
        radius: config.radius ?? getDefaultRadius(config.characterId, DEFAULT_UNIT_RADIUS),
        unitAITreeId: config.unitAITreeId,
    });

    if (config.aiSettings) {
        unit.aiSettings = config.aiSettings;
    }

    return unit;
}
