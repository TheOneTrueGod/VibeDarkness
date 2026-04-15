/**
 * BaseMissionDef - Base class for mission definitions.
 *
 * Provides a static initializeGameState method that sets up the initial game state
 * with player units, enemies, projectiles, and effects. Missions extend this class
 * and define their own missionId, name, enemies, and createTerrain.
 */

import type { GameEngine } from '../game/GameEngine';
import type { UnitSpawnConfig } from '../game/types';
import type { EnemySpawnDef, MissionBattleConfig, LevelEvent, PlayerSpawnPoint } from './types';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import type { EventBus } from '../game/EventBus';
import type { Unit } from '../game/units/Unit';
import { resetGameObjectIdCounter } from '../game/GameObject';
import type { CharacterId } from '../game/units/index';
import { createPlayerUnit, createUnitFromSpawnConfig } from '../game/units/index';
import { getEnemyHealthMultiplier } from '../constants/enemyConstants';
import { getSpecialTileDef } from './specialTileDefs';
import { getItemDef } from '../character_defs/items';
import { getDefaultHp, resolveEnemySpawnStats } from '../game/units/unit_defs/unitDef';
import { getHealthBonusFromResearch } from '../research/researchTrainingEffects';
import { applyStickSwordResearchToAbilityRuntime, initializeAbilityRuntimeForUnit } from '../abilities/abilityUses';
import { Ammo } from '../resources/Ammo';

const PLAYER_APPEARANCE_CHARACTER_IDS: readonly CharacterId[] = ['warrior', 'mage', 'ranger', 'healer'];
const AMMO_ABILITIES = new Set(['0105', '0112', '0203', '0204', '0205']);

function attachAmmoIfNeeded(engine: GameEngine, unit: Unit): void {
    const needsAmmo = unit.abilities.some((abilityId) => AMMO_ABILITIES.has(abilityId));
    if (!needsAmmo) return;
    if (unit.getResource('ammo')) return;
    unit.attachResource(new Ammo(), engine.eventBus);
}

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
    /** Map of playerId -> characterId (or special IDs like control_enemy_alpha_wolf). */
    characterSelections?: Record<string, string>;
    /** Local player's ID (for camera/turn handling). */
    localPlayerId: string;
    /** Event bus for game events. */
    eventBus: EventBus;
    /** Terrain manager (optional, for pathfinding). */
    terrainManager?: import('../terrain/TerrainManager').TerrainManager | null;
    /** Item IDs equipped per player (e.g. from pre-mission story choices); add cards to deck. */
    equippedItemsByPlayer?: Record<string, string[]>;
    /** Player research trees (playerId -> treeId -> researched node ids). Used for max health etc. */
    playerResearchTreesByPlayer?: Record<string, Record<string, string[]>>;
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
        const spawnPoints = this.playerSpawnPoints;
        for (let i = 0; i < playerCount; i++) {
            const pu = params.playerUnits[i];
            const equippedIds = params.equippedItemsByPlayer?.[pu.playerId] ?? [];
            // Abilities and cards come only from equipment (e.g. core + weapon/utility items).
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
            // Fallback if no equipment (should not happen if new characters get a core).
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

            const appearanceCharacterId = getAppearanceCharacterId(pu.portraitId);
            const researchByPlayer = params.playerResearchTreesByPlayer ?? {};
            const getResearchNodes = (treeId: string) =>
                researchByPlayer[pu.playerId]?.[treeId] ?? [];
            const baseHp = getDefaultHp(appearanceCharacterId);
            const healthBonus = getHealthBonusFromResearch(getResearchNodes);
            const maxHp = baseHp + healthBonus;
            const unit = createPlayerUnit(
                {
                    x: spawnX,
                    y: spawnY,
                    teamId: 'player',
                    ownerId: pu.playerId,
                    name: pu.name,
                    abilities,
                    appearanceCharacterId,
                    hp: maxHp,
                    maxHp,
                },
                params.eventBus,
            );
            initializeAbilityRuntimeForUnit(unit);
            applyStickSwordResearchToAbilityRuntime(unit, getResearchNodes);
            attachAmmoIfNeeded(engine, unit);
            engine.addUnit(unit);
        }

        // Register level events (if any)
        if (this.levelEvents && this.levelEvents.length > 0) {
            engine.registerLevelEvents(this.levelEvents);
        }

        // Add enemies (health scaled by player count)
        const enemyHealthMult = getEnemyHealthMultiplier(playerCount);
        const fallbackTreeId = this.aiController === 'alphaWolfBoss' ? 'alphaWolfBoss' : 'default';
        const enemySpawns: UnitSpawnConfig[] = this.enemies.map((e) => ({ ...e, ownerId: 'ai' }));
        for (const spawn of enemySpawns) {
            const stats = resolveEnemySpawnStats(spawn);
            const unit = createUnitFromSpawnConfig(
                {
                    ...spawn,
                    hp: Math.round(stats.hp * enemyHealthMult),
                    speed: stats.speed,
                    x: spawn.position.x,
                    y: spawn.position.y,
                    unitAITreeId: spawn.unitAITreeId ?? fallbackTreeId,
                },
                params.eventBus,
            );
            initializeAbilityRuntimeForUnit(unit);
            attachAmmoIfNeeded(engine, unit);
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
                };
                if (p.protectRadius !== undefined) tile.protectRadius = p.protectRadius;
                if (p.colorFilter !== undefined) tile.colorFilter = p.colorFilter;
                engine.addSpecialTile(tile);
            }
        }

        // Base implementation adds no projectiles or effects.
        // Subclasses may override to add initial projectiles/effects.
    }
}
