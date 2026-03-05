/**
 * BaseMissionDef - Base class for mission definitions.
 *
 * Provides a static initializeGameState method that sets up the initial game state
 * with player units, enemies, projectiles, and effects. Missions extend this class
 * and define their own missionId, name, enemies, and createTerrain.
 */

import type { GameEngine, CardInstance } from '../engine/GameEngine';
import type { UnitSpawnConfig } from '../engine/types';
import type { EnemySpawnDef, MissionBattleConfig, LevelEvent, PlayerSpawnPoint } from './types';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import type { EventBus } from '../engine/EventBus';
import { resetGameObjectIdCounter } from '../objects/GameObject';
import { createUnitByCharacterId, createUnitFromSpawnConfig } from '../objects/units/index';
import { createCardInstance, WORLD_HEIGHT } from '../engine/GameEngine';
import { getSpecialTileDef } from './specialTileDefs';
import { getItemDef } from '../character_defs/items';

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
    /** Item IDs equipped per player (e.g. from pre-mission story choices); add cards to deck. */
    equippedItemsByPlayer?: Record<string, string[]>;
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
    /** Optional special tiles (DefendPoint, etc.) placed on the map. */
    specialTiles?: import('./types').SpecialTilePlacement[];
    /** Optional grid-based player spawn points. */
    playerSpawnPoints?: PlayerSpawnPoint[];

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
        const missionConfig: MissionBattleConfig = this;
        const spawnPoints = missionConfig.playerSpawnPoints ?? this.playerSpawnPoints;
        for (let i = 0; i < playerCount; i++) {
            const pu = params.playerUnits[i];
            const isWarrior = pu.characterId === 'warrior';
            const isRanger = pu.characterId === 'ranger';
            let abilities = isWarrior
                ? ['throw_rock', '0101', '0102']
                : isRanger
                  ? ['0001']
                  : ['throw_knife'];
            const equippedIds = params.equippedItemsByPlayer?.[pu.playerId] ?? [];
            for (const itemId of equippedIds) {
                const itemDef = getItemDef(itemId);
                if (!itemDef) continue;
                for (const entry of itemDef.cardsToAdd) {
                    if (!abilities.includes(entry.cardId)) {
                        abilities = [...abilities, entry.cardId];
                    }
                }
            }

            // Determine spawn position.
            let spawnX = 300;
            let spawnY = playerSpacing * (i + 1);
            if (spawnPoints && spawnPoints.length > 0) {
                const numericId = parseInt(pu.playerId, 10);
                let spawnIndex: number;
                if (!Number.isNaN(numericId) && numericId > 0) {
                    // Player IDs are 1-based; map to 0-based index.
                    spawnIndex = numericId - 1;
                } else {
                    // Fallback: use loop index.
                    spawnIndex = i;
                }
                if (spawnIndex < 0 || spawnIndex >= spawnPoints.length) {
                    // Clamp or wrap if out of range.
                    spawnIndex = spawnIndex % spawnPoints.length;
                    if (spawnIndex < 0) spawnIndex += spawnPoints.length;
                }
                const sp: PlayerSpawnPoint = spawnPoints[spawnIndex];
                const cellSize = 40; // matches CELL_SIZE in TerrainGrid
                spawnX = sp.col * cellSize + cellSize / 2;
                spawnY = sp.row * cellSize + cellSize / 2;
            }

            const unit = createUnitByCharacterId(
                pu.characterId,
                {
                    x: spawnX,
                    y: spawnY,
                    teamId: 'player',
                    ownerId: pu.playerId,
                    name: pu.name,
                    abilities,
                },
                params.eventBus,
            );
            engine.addUnit(unit);

            // Set up cards for this player
            let hand: CardInstance[];
            if (isRanger) {
                hand = [
                    createCardInstance('0001_1', '0001', 'hand'),
                    createCardInstance('0001_2', '0001', 'hand'),
                    createCardInstance('0001_3', '0001', 'hand'),
                    createCardInstance('0001_4', '0001', 'hand'),
                ];
            } else if (isWarrior) {
                // Warrior starting deck: Bash, Bash, Bash, Dodge, Dodge
                hand = [
                    createCardInstance('0102_1', '0102', 'hand'),
                    createCardInstance('0102_2', '0102', 'hand'),
                    createCardInstance('0102_3', '0102', 'hand'),
                    createCardInstance('0101_1', '0101', 'hand'),
                    createCardInstance('0101_2', '0101', 'hand'),
                ];
            } else {
                const throwCardId = 'throw_knife';
                hand = [
                    createCardInstance(`${throwCardId}_1`, throwCardId, 'hand'),
                    createCardInstance(`${throwCardId}_2`, throwCardId, 'hand'),
                    createCardInstance('0102_1', '0102', 'hand'),
                    createCardInstance('0102_2', '0102', 'hand'),
                ];
            }
            // Add cards from equipped items (e.g. pre-mission story choices)
            for (const itemId of equippedIds) {
                const itemDef = getItemDef(itemId);
                if (!itemDef) continue;
                for (const entry of itemDef.cardsToAdd) {
                    for (let c = 0; c < entry.count; c++) {
                        hand.push(
                            createCardInstance(
                                `${entry.cardId}_item_${itemId}_${c}`,
                                entry.cardId,
                                'hand'
                            )
                        );
                    }
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

        // Add special tiles
        if (this.specialTiles && this.specialTiles.length > 0) {
            for (const p of this.specialTiles) {
                const def = getSpecialTileDef(p.defId);
                if (!def || def.id !== 'DefendPoint') continue;
                engine.addSpecialTile({
                    id: `special_${p.defId}_${p.col}_${p.row}`,
                    defId: p.defId,
                    col: p.col,
                    row: p.row,
                    hp: def.maxHp,
                    maxHp: def.maxHp,
                });
            }
        }

        // Base implementation adds no projectiles or effects.
        // Subclasses may override to add initial projectiles/effects.
    }
}
