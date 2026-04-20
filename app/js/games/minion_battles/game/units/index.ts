/**
 * Unit factory registry.
 *
 * Player units share `characterId === 'player'` and optional resources from items/research only.
 */

import { Unit } from './Unit';
import type { TeamId } from '../teams';
import type { EventBus } from '../EventBus';
import {
    getDefaultHp,
    getDefaultSpeed,
    getDefaultRadius,
    getDefaultStamina,
    resolveEnemySpawnStats,
    PLAYER_CHARACTER_ID,
    resolvePlayerUnitRadius,
} from './unit_defs/unitDef';
import { DEFAULT_UNIT_RADIUS } from './unit_defs/unitConstants';
import type { UnitTag } from './unitTag';
import type { UnitCombatSettings } from './Unit';

export type UnitFactoryConfig = {
    id?: string;
    x: number;
    y: number;
    teamId: TeamId;
    ownerId: string;
    name: string;
    abilities?: string[];
    /** Override default HP for this unit. Uses getDefaultHp('player') when not set. */
    hp?: number;
    /** Override max HP (e.g. from research). Defaults to hp when not set. */
    maxHp?: number;
    /** Override default speed for this unit. Uses getDefaultSpeed('player') when not set. */
    speed?: number;
    /** Optional combat tuning values (e.g. flat damage bonus from research). */
    combatSettings?: UnitCombatSettings;
};

/**
 * Create a player-controlled unit. Baseline stats from UNIT_DEFS.player; portrait sets token size/color.
 * No Rage/Mana here — attach via items/research when needed.
 */
export function createPlayerUnit(
    config: UnitFactoryConfig & { portraitId: string },
    _eventBus: EventBus,
): Unit {
    const hp = config.hp ?? getDefaultHp(PLAYER_CHARACTER_ID);
    const maxHp = config.maxHp ?? hp;
    const speed = config.speed ?? getDefaultSpeed(PLAYER_CHARACTER_ID);
    const stamina = getDefaultStamina(PLAYER_CHARACTER_ID);
    const radius = resolvePlayerUnitRadius(config.portraitId);

    return new Unit({
        id: config.id,
        x: config.x,
        y: config.y,
        teamId: config.teamId,
        ownerId: config.ownerId,
        name: config.name,
        abilities: config.abilities,
        hp,
        maxHp,
        speed,
        characterId: PLAYER_CHARACTER_ID,
        portraitId: config.portraitId,
        radius,
        stamina,
        combatSettings: config.combatSettings,
    });
}

/**
 * Create a unit from a full spawn config (used for enemies with custom stats).
 */
export function createUnitFromSpawnConfig(
    config: {
        id?: string;
        characterId: string;
        name: string;
        hp?: number;
        speed?: number;
        x: number;
        y: number;
        teamId: TeamId;
        ownerId: string;
        abilities?: string[];
        aiSettings?: import('./Unit').AISettings | null;
        radius?: number;
        unitAITreeId?: string;
        stamina?: number;
        unitTags?: UnitTag[];
    },
    _eventBus: EventBus,
): Unit {
    const { hp, speed } = resolveEnemySpawnStats(config);
    const unit = new Unit({
        id: config.id,
        x: config.x,
        y: config.y,
        teamId: config.teamId,
        ownerId: config.ownerId,
        name: config.name,
        abilities: config.abilities,
        hp,
        maxHp: hp,
        speed,
        characterId: config.characterId,
        radius: config.radius ?? getDefaultRadius(config.characterId, DEFAULT_UNIT_RADIUS),
        unitAITreeId: config.unitAITreeId,
        stamina: config.stamina ?? getDefaultStamina(config.characterId),
    });

    if (config.aiSettings) {
        unit.aiSettings = config.aiSettings;
    }

    if (config.unitTags && config.unitTags.length > 0) {
        unit.tags = [...config.unitTags];
    }

    return unit;
}
