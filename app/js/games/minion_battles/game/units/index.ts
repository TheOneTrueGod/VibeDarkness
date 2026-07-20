/**
 * Unit factory registry.
 *
 * Player units share `characterId === 'player'` and optional resources from items/research only.
 */

import { Unit } from './Unit';
import type { TeamId } from '../teams';
import type { EventBus } from '../EventBus';
import type { EngineContext } from '../EngineContext';
import {
    getDefaultHp,
    getDefaultSpeed,
    getDefaultStamina,
    resolveEnemySpawnStats,
    getUnitStaticTags,
    PLAYER_CHARACTER_ID,
} from './unit_defs/unitDef';
import type { UnitTag } from './unitTag';
import type { UnitCombatSettings } from './Unit';
import { generateGameObjectId } from '../GameObject';
import { applyCombatCrowdControlProfile } from './combatCcSpawn';

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
    /** Aggregated passive research bonuses (computed at mission start). */
    passiveBonuses?: import('../../../../researchTrees/types').PassiveBonuses;
};

/**
 * Create a player-controlled unit. Baseline stats from UNIT_DEFS.player; portrait sets token size/color.
 * No Rage/Mana here — attach via items/research when needed.
 */
export function createPlayerUnit(
    config: UnitFactoryConfig & { portraitId: string },
    _eventBus: EventBus,
    idSource?: Pick<EngineContext, 'allocateObjectId'>,
): Unit {
    const hp = config.hp ?? getDefaultHp(PLAYER_CHARACTER_ID);
    const maxHp = config.maxHp ?? hp;
    const speed = config.speed ?? getDefaultSpeed(PLAYER_CHARACTER_ID);
    const stamina = getDefaultStamina(PLAYER_CHARACTER_ID);

    const unit = new Unit({
        id: config.id ?? idSource?.allocateObjectId?.('unit') ?? generateGameObjectId('unit'),
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
        stamina,
        combatSettings: config.combatSettings,
        passiveBonuses: config.passiveBonuses,
    });
    applyCombatCrowdControlProfile(unit);
    return unit;
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
        stackSize?: number;
        x: number;
        y: number;
        teamId: TeamId;
        ownerId: string;
        abilities?: string[];
        aiSettings?: import('./Unit').AISettings | null;
        /** Explicit radius override. When omitted, radius resolves from the unit def's size. */
        radius?: number;
        unitAITreeId?: string;
        stamina?: number;
        unitTags?: UnitTag[];
        combatSettings?: UnitCombatSettings;
        /** Absolute gameTime after which this unit despawns (ephemeral summons). */
        ephemeralDespawnAtGameTime?: number | null;
        /** Control group for player NPC control (from EnemySpawnDef / SpawnWaveEntry). */
        controlGroupId?: string;
        /** When false, never auto-assigned to a control player (default true). */
        controllable?: boolean;
    },
    _eventBus: EventBus,
    idSource?: Pick<EngineContext, 'allocateObjectId'>,
): Unit {
    const { hp, speed, stackSize } = resolveEnemySpawnStats(config);
    const unit = new Unit({
        id: config.id ?? idSource?.allocateObjectId?.('unit') ?? generateGameObjectId('unit'),
        x: config.x,
        y: config.y,
        teamId: config.teamId,
        ownerId: config.ownerId,
        name: config.name,
        abilities: config.abilities,
        hp,
        maxHp: hp,
        speed,
        stackSize,
        characterId: config.characterId,
        radius: config.radius,
        unitAITreeId: config.unitAITreeId,
        stamina: config.stamina ?? getDefaultStamina(config.characterId),
        combatSettings: config.combatSettings,
        ephemeralDespawnAtGameTime: config.ephemeralDespawnAtGameTime,
    });

    if (config.aiSettings) {
        unit.aiSettings = config.aiSettings;
    }

    if (config.unitTags && config.unitTags.length > 0) {
        unit.tags = [...config.unitTags];
    }

    const staticTags = getUnitStaticTags(config.characterId);
    if (staticTags.length > 0) {
        unit.tags = Array.from(new Set([...unit.tags, ...staticTags]));
    }

    if (config.controlGroupId !== undefined) {
        unit.controlGroupId = config.controlGroupId;
    }
    if (config.controllable !== undefined) {
        unit.controllable = config.controllable;
    }

    applyCombatCrowdControlProfile(unit);
    return unit;
}
