/**
 * BaseMissionDef - Base class for mission definitions.
 *
 * Provides a static initializeGameState method that sets up the initial game state
 * with player units, enemies, projectiles, and effects. Missions extend this class
 * and define their own missionId, name, enemies, and createTerrain.
 */

import type { GameEngine } from '../engine/GameEngine';
import type { UnitSpawnConfig } from '../engine/types';
import type { EnemySpawnDef, MissionBattleConfig, LevelEvent } from './types';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import type { EventBus } from '../engine/EventBus';
import { resetGameObjectIdCounter } from '../objects/GameObject';
import { createUnitByCharacterId, createUnitFromSpawnConfig } from '../objects/units/index';
import { createCardInstance, WORLD_HEIGHT } from '../engine/GameEngine';

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
    /** Optional level events (spawn waves, victory checks, etc.). */
    levelEvents?: LevelEvent[];

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
            engine.addUnit(unit);

            // Set up cards for this player
            let hand: import('../engine/GameEngine').CardInstance[];
            if (isRanger) {
                hand = [
                    createCardInstance('0001_1', '0001', 'hand'),
                    createCardInstance('0001_2', '0001', 'hand'),
                    createCardInstance('0001_3', '0001', 'hand'),
                    createCardInstance('0001_4', '0001', 'hand'),
                ];
            } else {
                hand = [
                    createCardInstance('throw_knife_1', 'throw_knife', 'hand'),
                    createCardInstance('throw_knife_2', 'throw_knife', 'hand'),
                    createCardInstance('0102_1', '0102', 'hand'),
                    createCardInstance('0102_2', '0102', 'hand'),
                ];
                if (isWarrior) {
                    hand.push(
                        createCardInstance('0101_1', '0101', 'hand'),
                        createCardInstance('0101_2', '0101', 'hand'),
                    );
                }
            }
            engine.cards[pu.playerId] = hand;
        }

        // Register level events (if any)
        if (this.levelEvents && this.levelEvents.length > 0) {
            engine.registerLevelEvents(this.levelEvents);
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
            engine.addUnit(unit);
        }

        // Base implementation adds no projectiles or effects.
        // Subclasses may override to add initial projectiles/effects.
    }
}
