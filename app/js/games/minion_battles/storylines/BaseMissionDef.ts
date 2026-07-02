/**
 * BaseMissionDef - Base class for mission definitions.
 *
 * Provides a static initializeGameState method that sets up the initial game state
 * with player units, enemies, projectiles, and effects. Missions extend this class
 * and define their own missionId, name, enemies, and createTerrain.
 */

import type { GameEngine } from '../game/GameEngine';
import type { UnitSpawnConfig } from '../game/types';
import type {
    AIControllerId,
    EnemySpawnDef,
    MissionBattleConfig,
    LevelEvent,
    PlayerSpawnPoint,
    BattleObjectiveDef,
} from './types';
import type { WorldModifierDef } from '../worldModifiers/types';
import type { NinjutsuPoolConfig } from '../game/ninjutsu/ninjutsuConfig';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import type { EventBus } from '../game/EventBus';
import type { Unit } from '../game/units/Unit';
import type { MapSegmentPOI } from '../terrain/segmentSchema';
import { createPlayerUnit, createUnitFromSpawnConfig } from '../game/units/index';
import { getEnemyHealthMultiplier } from '../constants/enemyConstants';
import { getSpecialTileDef } from './specialTileDefs';
import { getItemDef } from '../character_defs/items';
import { getDefaultHp, PLAYER_CHARACTER_ID, resolveEnemySpawnStats } from '../game/units/unit_defs/unitDef';
import {
    getDamageBonusFromResearch,
    getHealthBonusFromResearch,
    getStaminaRecoveryBonusFromResearch,
} from '../research/researchTrainingEffects';
import {
    applyCrystalRocksResearchToAbilityRuntime,
    applyStickSwordResearchToAbilityRuntime,
    applyAbilityResearchModifiersToRuntime,
    initializeAbilityRuntimeForUnit,
} from '../abilities/abilityUses';
import { mergeBattleEquipmentIdsFromResearch, getCardReplacementsFromResearch, getDirectCardsFromResearch, computeAbilityModifiersFromResearch, getPetsFromResearch } from '../../../researchTrees/evaluator';
import { getPetDef } from '../game/units/pet_defs/petDef';
import { getAbilityTagsForId } from '../abilities/Ability';
import { Ammo } from '../resources/Ammo';
import { Light } from '../resources/Light';
import { Movement } from '../resources/Movement';
import {
    hydrateLanterniteNestFromMissionDef,
    prepareLanterniteNestForMissionStart,
    upsertNestLightSource,
    LANTERNITE_NEST_CHARACTER_ID,
} from '../game/lanternite/lanternitePulse';
import {
    initializeThornlingNestSpawnState,
    THORNLING_NEST_CHARACTER_ID,
} from '../game/lanternite/thornlingNestTick';

const AMMO_ABILITIES = new Set(['0105', '0112', '0203', '0204', '0205']);

function attachResourcesFromEquipment(equippedIds: string[], unit: Unit, eventBus: EventBus): void {
    const seen = new Set<string>();
    for (const itemId of equippedIds) {
        for (const rid of getItemDef(itemId)?.resourcesToAdd ?? []) {
            if (seen.has(rid) || unit.getResource(rid)) continue;
            seen.add(rid);
            if (rid === 'light') unit.attachResource(new Light(), eventBus);
            // Extend here as more resource-granting items are added.
        }
    }
}

function attachAmmoIfNeeded(engine: GameEngine, unit: Unit): void {
    const needsAmmo = unit.abilities.some((abilityId) => AMMO_ABILITIES.has(abilityId));
    if (!needsAmmo) return;
    if (unit.getResource('ammo')) return;
    unit.attachResource(new Ammo(), engine.eventBus);
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
    /** POIs collected from the fetched terrain segments; passed to the engine for spawn point lookups. */
    terrainSegmentPOIs?: MapSegmentPOI[];
}

/** Mission definition extending MissionBattleConfig with initializeGameState. */
export interface IBaseMissionDef extends MissionBattleConfig {
    /** Terrain segment IDs this mission needs fetched from the API during Battle Initialization. */
    segmentIds: string[];
    /** Position on the Mission Map canvas (pixels). */
    mapPosition?: { x: number; y: number };
    /** Optional image URL or asset path shown inside the mission circle on the Mission Map. */
    image?: string;
    /** Short flavour description shown in the Mission Map tooltip. */
    description?: string;
    /** Per-pool ninjutsu configuration. Absent = NINJUTSU_DEFAULT for the 'shadow' pool. */
    ninjutsuPools?: Partial<Record<string, NinjutsuPoolConfig>>;
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
    /** Optional battle objectives (see MissionBattleConfig). */
    battleObjectives?: BattleObjectiveDef[];
    /** Optional world modifiers active for this mission (merged with builtins by BattleSession). */
    worldModifiers?: WorldModifierDef[];
    /** Per-pool ninjutsu configuration. Absent = NINJUTSU_DEFAULT for the 'shadow' pool. */
    ninjutsuPools?: Partial<Record<string, NinjutsuPoolConfig>>;
    /** Optional special tiles (Campfire, Crystal, etc.) placed on the map. */
    specialTiles?: import('./types').SpecialTilePlacement[];
    /** Optional grid-based player spawn points. */
    playerSpawnPoints?: PlayerSpawnPoint[];
    /** AI controller for enemy units; see `MissionBattleConfig`. */
    aiController?: AIControllerId;
    /** Terrain segment IDs this mission needs fetched from the API during Battle Initialization. */
    segmentIds: string[] = [];
    /** Position on the Mission Map canvas (pixels). If absent, a fallback grid layout is used. */
    mapPosition?: { x: number; y: number };
    /** Optional image URL or asset path shown inside the mission circle on the Mission Map. */
    image?: string;
    /** Short flavour description shown in the Mission Map tooltip. */
    description?: string;

    /**
     * Set up the initial game state with player units, enemies, projectiles, and effects.
     * Adds units to engine.units, projectiles to engine.projectiles, effects to engine.effects,
     * and cards to engine.cards.
     */
    initializeGameState(engine: GameEngine, params: InitializeGameStateParams): void {
        engine.localPlayerId = params.localPlayerId;
        engine.terrainManager = params.terrainManager ?? null;
        engine.registerMapPOIs(params.terrainSegmentPOIs ?? []);

        // Add player units
        const playerCount = params.playerUnits.length;
        const grid = params.terrainManager?.grid;
        const worldW = grid ? grid.worldWidth : this.worldWidth;
        const worldH = grid ? grid.worldHeight : this.worldHeight;
        const playerSpacing = worldH / (playerCount + 1);
        const spawnPoints = this.playerSpawnPoints;
        const researchByPlayer = params.playerResearchTreesByPlayer ?? {};
        for (let i = 0; i < playerCount; i++) {
            const pu = params.playerUnits[i];
            const mergedEquip = mergeBattleEquipmentIdsFromResearch(
                params.equippedItemsByPlayer?.[pu.playerId] ?? [],
                researchByPlayer[pu.playerId],
            );
            const equippedIds = [...mergedEquip.equipmentIds, ...mergedEquip.extraEquippedItemIds];
            // Abilities and cards come only from equipment (e.g. core + weapon/utility items).
            const abilities: string[] = [];
            for (const itemId of equippedIds) {
                const itemDef = getItemDef(itemId);
                if (!itemDef) continue;
                for (const cardId of itemDef.cardsToAdd) {
                    if (!abilities.includes(cardId)) {
                        abilities.push(cardId);
                    }
                }
            }
            // Fallback if no equipment (should not happen if new characters get a core).
            if (abilities.length === 0) {
                abilities.push('0101', '0120');
            }

            // Add cards granted directly by research (bypasses item system).
            for (const cardId of getDirectCardsFromResearch(researchByPlayer[pu.playerId])) {
                if (!abilities.includes(cardId)) abilities.push(cardId);
            }

            // Apply card-level replacements from research (e.g. Double Punch replaces Punch).
            const cardReplacements = getCardReplacementsFromResearch(researchByPlayer[pu.playerId]);
            if (cardReplacements.size > 0) {
                for (let j = 0; j < abilities.length; j++) {
                    const replacement = cardReplacements.get(abilities[j]!);
                    if (replacement) abilities[j] = replacement;
                }
            }

            // Determine spawn position.
            let spawnX = worldW / 4;
            let spawnY = playerSpacing * (i + 1);
            if (spawnPoints && spawnPoints.length > 0) {
                const spawnIndex = i % spawnPoints.length;
                const sp: PlayerSpawnPoint = spawnPoints[spawnIndex];
                const cellSize = grid?.cellSize ?? 40;
                spawnX = sp.col * cellSize + cellSize / 2;
                spawnY = sp.row * cellSize + cellSize / 2;
            }

            const getResearchNodes = (treeId: string) =>
                researchByPlayer[pu.playerId]?.[treeId] ?? [];
            const baseHp = getDefaultHp(PLAYER_CHARACTER_ID);
            const healthBonus = getHealthBonusFromResearch(getResearchNodes);
            const flatDamageBonus = getDamageBonusFromResearch(getResearchNodes);
            const staminaRecoveryBonus = getStaminaRecoveryBonusFromResearch(getResearchNodes);
            const maxHp = baseHp + healthBonus;
            const unit = createPlayerUnit(
                {
                    x: spawnX,
                    y: spawnY,
                    teamId: 'player',
                    ownerId: pu.playerId,
                    name: pu.name,
                    abilities,
                    portraitId: pu.portraitId ?? 'warrior',
                    hp: maxHp,
                    maxHp,
                    combatSettings: flatDamageBonus > 0
                        ? { damageModifier: { flatAmt: flatDamageBonus, multiplier: 1 } }
                        : undefined,
                },
                params.eventBus,
                engine,
            );
            if (staminaRecoveryBonus > 0) {
                unit.stamina += staminaRecoveryBonus;
            }
            unit.abilityModifiers = computeAbilityModifiersFromResearch(researchByPlayer[pu.playerId], getAbilityTagsForId, unit.abilities);
            initializeAbilityRuntimeForUnit(unit);
            applyAbilityResearchModifiersToRuntime(unit, unit.abilityModifiers);
            applyCrystalRocksResearchToAbilityRuntime(unit, getResearchNodes);
            applyStickSwordResearchToAbilityRuntime(unit, getResearchNodes);
            attachAmmoIfNeeded(engine, unit);
            attachResourcesFromEquipment(equippedIds, unit, engine.eventBus);
            unit.attachResource(new Movement(), engine.eventBus);
            engine.addUnit(unit, 'initialGameSpawn');

            // Spawn pets granted by research alongside this player unit.
            for (const petId of getPetsFromResearch(researchByPlayer[pu.playerId])) {
                const petDef = getPetDef(petId);
                if (!petDef) continue;
                const pet = createUnitFromSpawnConfig(
                    {
                        characterId: petDef.unitCharacterId,
                        name: petDef.name,
                        teamId: 'player',
                        ownerId: 'ai',
                        unitAITreeId: 'pet',
                        abilities: [...petDef.abilityIds],
                        x: spawnX + 40,
                        y: spawnY,
                        aiSettings: { minRange: 0, maxRange: 50 },
                    },
                    params.eventBus,
                    engine,
                );
                pet.petState.defId = petId;
                pet.petState.ownerUnitId = unit.id;
                unit.petState.unitIds.push(pet.id);
                initializeAbilityRuntimeForUnit(pet);
                engine.addUnit(pet, 'initialGameSpawn');
            }
        }

        // Register level events (if any)
        if (this.levelEvents && this.levelEvents.length > 0) {
            engine.registerLevelEvents(this.levelEvents);
        }

        // Add enemies (health scaled by player count)
        const enemyHealthMult = getEnemyHealthMultiplier(playerCount);
        const enemySpawns: UnitSpawnConfig[] = this.enemies.map((e) => ({ ...e, ownerId: 'ai' }));
        for (const spawn of enemySpawns) {
            const stats = resolveEnemySpawnStats(spawn);
            const unit = createUnitFromSpawnConfig(
                {
                    ...spawn,
                    ...(spawn.unitId ? { id: spawn.unitId } : {}),
                    hp: Math.round(stats.hp * (spawn.teamId === 'enemy' ? enemyHealthMult : 1)),
                    speed: stats.speed,
                    x: spawn.position.x,
                    y: spawn.position.y,
                },
                params.eventBus,
                engine,
            );
            if (spawn.lanterniteNest != null && spawn.characterId === LANTERNITE_NEST_CHARACTER_ID) {
                hydrateLanterniteNestFromMissionDef(unit, spawn.lanterniteNest);
            }
            if (spawn.thornlingNest != null && spawn.characterId === THORNLING_NEST_CHARACTER_ID) {
                unit.thornlingState.nestConfig = spawn.thornlingNest;
            }
            if (spawn.lanterniteNestOwnerUnitId != null) {
                unit.lanterniteState.nestOwnerUnitId = spawn.lanterniteNestOwnerUnitId;
            }
            if (spawn.lanternPatrolFarWorld != null) {
                unit.lanterniteState.patrolFarWorld = { ...spawn.lanternPatrolFarWorld };
            }
            if (spawn.lanternPatrolLeg === 'toFar' || spawn.lanternPatrolLeg === 'toNest') {
                unit.lanterniteState.patrolLeg = spawn.lanternPatrolLeg;
            }
            if (spawn.lanterniteRole != null) {
                unit.lanterniteState.role = spawn.lanterniteRole;
            }
            if (spawn.lanterniteTargetNestPoiId != null) {
                unit.lanterniteState.targetNestPoiId = spawn.lanterniteTargetNestPoiId;
            }
            if (spawn.invulnerabilityGenerations != null) {
                unit.invulnerabilityGenerations = spawn.invulnerabilityGenerations;
            }
            initializeAbilityRuntimeForUnit(unit);
            attachAmmoIfNeeded(engine, unit);
            engine.addUnit(unit, 'initialGameSpawn');
        }

        for (const u of engine.units) {
            if (u.characterId === LANTERNITE_NEST_CHARACTER_ID && u.lanterniteState.nestConfig != null) {
                prepareLanterniteNestForMissionStart(u, engine.gameTime);
                // Register the light source immediately so applyInstantLightingPass() (called
                // right after initializeGameState) snapshots full brightness from frame 0,
                // rather than waiting for the first round_start milestone.
                if (engine.lightLevelEnabled) {
                    upsertNestLightSource({
                        nest: u,
                        addLightSource: (ls) => engine.addLightSource(ls),
                        lightSources: engine.lightSources,
                    });
                }
            }
            if (u.characterId === THORNLING_NEST_CHARACTER_ID && u.thornlingState.nestConfig != null) {
                initializeThornlingNestSpawnState(u, engine.gameTime);
            }
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
