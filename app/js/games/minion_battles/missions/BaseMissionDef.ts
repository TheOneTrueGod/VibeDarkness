/**
 * BaseMissionDef - Base class for mission definitions.
 *
 * Provides a static initializeGameState method that sets up the initial game state
 * with player units, enemies, projectiles, and effects. Missions extend this class
 * and define their own missionId, name, enemies, and createTerrain.
 */

import type { GameEngine } from '../engine/GameEngine';
import type { UnitSpawnConfig } from '../engine/types';
import type { EnemySpawnDef, MissionBattleConfig } from './types';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import type { EventBus } from '../engine/EventBus';
import { resetGameObjectIdCounter } from '../objects/GameObject';
import { createUnitByCharacterId, createUnitFromSpawnConfig } from '../objects/units/index';
import { WORLD_HEIGHT } from '../engine/GameEngine';

/** Parameters for initializing game state. */
export interface InitializeGameStateParams {
    /** Player units to spawn (from character selections). */
    playerUnits: { playerId: string; characterId: string; name: string }[];
    /** Local player's ID (for camera/turn handling). */
    localPlayerId: string;
    /** Event bus for game events. */
    eventBus: EventBus;
    /** Terrain manager (optional, for pathfinding). */
    terrainManager?: import('../terrain/TerrainManager').TerrainManager | null;
}

/** Mission definition extending MissionBattleConfig with initializeGameState. */
export interface IBaseMissionDef extends MissionBattleConfig {
    /** Set up initial game state: player units, enemies, projectiles, effects, cards. */
    initializeGameState(engine: GameEngine, params: InitializeGameStateParams): void;
}

/**
 * Base class for mission definitions. Subclasses set static missionId, name, enemies,
 * and createTerrain. The static initializeGameState is inherited and populates the
 * engine with player units, enemies, and cards.
 */
export abstract class BaseMissionDef implements IBaseMissionDef {
    abstract missionId: string;
    abstract name: string;
    abstract enemies: EnemySpawnDef[];
    abstract createTerrain: () => TerrainGrid;

    /**
     * Set up the initial game state with player units, enemies, projectiles, and effects.
     * Adds units to engine.units, projectiles to engine.projectiles, effects to engine.effects,
     * and cards to engine.cards.
     */
    initializeGameState(engine: GameEngine, params: InitializeGameStateParams): void {
        engine.localPlayerId = params.localPlayerId;
        engine.terrainManager = params.terrainManager ?? null;
        resetGameObjectIdCounter(1);

        // Add player units
        const playerCount = params.playerUnits.length;
        const playerSpacing = WORLD_HEIGHT / (playerCount + 1);
        for (let i = 0; i < playerCount; i++) {
            const pu = params.playerUnits[i];
            const isWarrior = pu.characterId === 'warrior';
            const isRanger = pu.characterId === 'ranger';
            const abilities = isWarrior
                ? ['throw_knife', '0101', '0102']
                : isRanger
                  ? ['0001']
                  : ['throw_knife'];
            const unit = createUnitByCharacterId(
                pu.characterId,
                {
                    x: 150,
                    y: playerSpacing * (i + 1),
                    teamId: 'player',
                    ownerId: pu.playerId,
                    name: pu.name,
                    abilities,
                },
                params.eventBus,
            );
            engine.units.push(unit);

            // Set up cards for this player
            let hand: import('../engine/GameEngine').CardInstance[];
            if (isRanger) {
                hand = [
                    { cardDefId: '0001_1', abilityId: '0001', location: 'hand', exileRounds: 0 },
                    { cardDefId: '0001_2', abilityId: '0001', location: 'hand', exileRounds: 0 },
                    { cardDefId: '0001_3', abilityId: '0001', location: 'hand', exileRounds: 0 },
                    { cardDefId: '0001_4', abilityId: '0001', location: 'hand', exileRounds: 0 },
                ];
            } else {
                hand = [
                    { cardDefId: 'throw_knife_1', abilityId: 'throw_knife', location: 'hand', exileRounds: 0 },
                    { cardDefId: 'throw_knife_2', abilityId: 'throw_knife', location: 'hand', exileRounds: 0 },
                    { cardDefId: '0102_1', abilityId: '0102', location: 'hand', exileRounds: 0 },
                    { cardDefId: '0102_2', abilityId: '0102', location: 'hand', exileRounds: 0 },
                ];
                if (isWarrior) {
                    hand.push(
                        { cardDefId: '0101_1', abilityId: '0101', location: 'hand', exileRounds: 0 },
                        { cardDefId: '0101_2', abilityId: '0101', location: 'hand', exileRounds: 0 },
                    );
                }
            }
            engine.cards[pu.playerId] = hand;
        }

        // Add enemies
        const enemySpawns: UnitSpawnConfig[] = this.enemies.map((e) => ({ ...e, ownerId: 'ai' }));
        for (const spawn of enemySpawns) {
            const unit = createUnitFromSpawnConfig(
                {
                    ...spawn,
                    x: spawn.position.x,
                    y: spawn.position.y,
                },
                params.eventBus,
            );
            engine.units.push(unit);
        }

        // Base implementation adds no projectiles or effects.
        // Subclasses may override to add initial projectiles/effects.
    }
}
