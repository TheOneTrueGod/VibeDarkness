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
import type { CharacterId } from '../objects/units/index';
import { createPlayerUnit, createUnitFromSpawnConfig } from '../objects/units/index';
import { getEnemyHealthMultiplier } from '../constants/enemyConstants';
import { createCardInstance, MAX_HAND_SIZE } from '../engine/GameEngine';
import { asCardDefId } from '../card_defs';
import { getSpecialTileDef } from './specialTileDefs';
import { getItemDef } from '../character_defs/items';

const PLAYER_APPEARANCE_CHARACTER_IDS: readonly CharacterId[] = ['warrior', 'mage', 'ranger', 'healer'];

function getAppearanceCharacterId(portraitId: string | undefined): CharacterId {
    if (portraitId && PLAYER_APPEARANCE_CHARACTER_IDS.includes(portraitId as CharacterId)) {
        return portraitId as CharacterId;
    }
    return 'warrior';
}

/** Parameters for initializing game state. */
export interface InitializeGameStateParams {
    /** Player units to spawn (from character selections). portraitId is used for appearance only. */
    playerUnits: { playerId: string; name: string; portraitId?: string }[];
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
    /** World width in pixels (e.g. terrain columns × cell size). */
    abstract worldWidth: number;
    /** World height in pixels (e.g. terrain rows × cell size). */
    abstract worldHeight: number;
    /** Optional level events (spawn waves, victory checks, etc.). */
    levelEvents?: LevelEvent[];
    /** Optional special tiles (Campfire, Crystal, etc.) placed on the map. */
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
        const grid = params.terrainManager?.grid;
        const worldW = grid ? grid.worldWidth : this.worldWidth;
        const worldH = grid ? grid.worldHeight : this.worldHeight;
        const playerSpacing = worldH / (playerCount + 1);
        const missionConfig: MissionBattleConfig = this;
        const spawnPoints = missionConfig.playerSpawnPoints ?? this.playerSpawnPoints;
        for (let i = 0; i < playerCount; i++) {
            const pu = params.playerUnits[i];
            const equippedIds = params.equippedItemsByPlayer?.[pu.playerId] ?? [];
            // Abilities and cards come only from equipment (e.g. Core Basic + hands items).
            const abilities: string[] = [];
            for (const itemId of equippedIds) {
                const itemDef = getItemDef(itemId);
                if (!itemDef) continue;
                for (const entry of itemDef.cardsToAdd) {
                    if (!abilities.includes(entry.cardId)) {
                        abilities.push(entry.cardId);
                    }
                }
            }
            // Fallback if no equipment (should not happen if new characters get Core Basic).
            if (abilities.length === 0) {
                abilities.push('0101', '0102');
            }

            // Determine spawn position.
            let spawnX = worldW / 4;
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
                const cellSize = grid?.cellSize ?? 40;
                spawnX = sp.col * cellSize + cellSize / 2;
                spawnY = sp.row * cellSize + cellSize / 2;
            }

            const unit = createPlayerUnit(
                {
                    x: spawnX,
                    y: spawnY,
                    teamId: 'player',
                    ownerId: pu.playerId,
                    name: pu.name,
                    abilities,
                    appearanceCharacterId: getAppearanceCharacterId(pu.portraitId),
                },
                params.eventBus,
            );
            engine.addUnit(unit);

            // Set up cards for this player from equipment only (all cards in hand).
            const deck: CardInstance[] = [];
            for (const itemId of equippedIds) {
                const itemDef = getItemDef(itemId);
                if (!itemDef) continue;
                for (const entry of itemDef.cardsToAdd) {
                    for (let c = 0; c < entry.count; c++) {
                        deck.push(
                            createCardInstance(
                                asCardDefId(entry.cardId),
                                entry.cardId,
                                'deck'
                            )
                        );
                    }
                }
            }

            engine.cards[pu.playerId] = deck;
            engine.fillHandInnateFirst(pu.playerId, MAX_HAND_SIZE);
        }

        // Register level events (if any)
        if (this.levelEvents && this.levelEvents.length > 0) {
            engine.registerLevelEvents(this.levelEvents);
        }

        // Add enemies (health scaled by player count)
        const enemyHealthMult = getEnemyHealthMultiplier(playerCount);
        const enemySpawns: UnitSpawnConfig[] = this.enemies.map((e) => ({ ...e, ownerId: 'ai' }));
        for (const spawn of enemySpawns) {
            const unit = createUnitFromSpawnConfig(
                {
                    ...spawn,
                    hp: Math.round(spawn.hp * enemyHealthMult),
                    x: spawn.position.x,
                    y: spawn.position.y,
                },
                params.eventBus,
            );
            engine.addUnit(unit);
        }

        // Add special tiles (Campfire, Crystal, etc.) — maxHp, emitsLight, protectRadius, defendPoint from placement
        if (this.specialTiles && this.specialTiles.length > 0) {
            for (const p of this.specialTiles) {
                const def = getSpecialTileDef(p.defId);
                if (!def) continue;
                const maxHp = p.maxHp ?? (p.defId === 'Campfire' ? 5 : 1);
                const isDestructible = p.defId === 'Campfire' ? p.tags?.destructible : false;
                const tile: Parameters<GameEngine['addSpecialTile']>[0] = {
                    id: `special_${p.defId}_${p.col}_${p.row}`,
                    defId: p.defId,
                    col: p.col,
                    row: p.row,
                    hp: p.hp ?? maxHp,
                    maxHp,
                    defendPoint: p.defendPoint ?? false,
                    destructible: isDestructible,
                    emitsLight: p.emitsLight,
                    decayLightPerRound: p.decayLightPerRound,
                };
                if (p.protectRadius !== undefined) tile.protectRadius = p.protectRadius;
                engine.addSpecialTile(tile);
            }
        }

        // Base implementation adds no projectiles or effects.
        // Subclasses may override to add initial projectiles/effects.
    }
}
