/**
 * BaseMissionDef - Base class for mission definitions.
 *
 * Provides a static initializeGameState method that sets up the initial game state
 * with player units, enemies, projectiles, and effects. Missions extend this class
 * and define their own missionId, name, enemies, and createTerrain.
 */

import type { GameEngine } from '../game/GameEngine';
import type {
    AIControllerId,
    EnemySpawnDef,
    MissionBattleConfig,
    LevelEvent,
    PlayerSpawnPoint,
    BattleObjectiveDef,
    PlayerControlDef,
} from './types';
import type { WorldModifierDef } from '../worldModifiers/types';
import type { NinjutsuPoolConfig } from '../game/ninjutsu/ninjutsuConfig';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import type { EventBus } from '../game/EventBus';
import type { Unit } from '../game/units/Unit';
import type { MapSegmentPOI, MapSegmentZone } from '../terrain/segmentSchema';
import { getMissionSegmentNetwork, getMissionSegmentPlacements } from '../terrain/segmentRegistry';
import { createPlayerUnit } from '../game/units/index';
import { enemySpawnDefToSpawnDefinition } from '../game/units/spawning/adapters';
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
    applyPassiveBonusToBase,
    computePassiveBonuses,
    DEFAULT_PASSIVE_MULT,
} from '../../../researchTrees/passiveBonuses';
import {
    applyCrystalRocksResearchToAbilityRuntime,
    applyStickSwordResearchToAbilityRuntime,
    applyAbilityResearchModifiersToRuntime,
    initializeAbilityRuntimeForUnit,
} from '../abilities/abilityUses';
import { mergeBattleEquipmentIdsFromResearch, getCardReplacementsFromResearch, getDirectCardsFromResearch, getRemovedCardsFromResearch, computeAbilityModifiersFromResearch, getPetsFromResearch, getPetAbilitiesFromResearch, getMissionStartResourcesFromResearch } from '../../../researchTrees/evaluator';
import { PassiveStatKey } from '../../../researchTrees/types';
import { getPetDef } from '../game/units/pet_defs/petDef';
import { AbilityGroupId, formatGroupId } from '../card_defs/AbilityGroupId';
import { getAbilityTagsForId } from '../abilities/Ability';
import { Ammo } from '../resources/Ammo';
import { Light } from '../resources/Light';
import { Rock } from '../resources/Rock';
import { Gravity } from '../resources/Gravity';
import { Movement } from '../resources/Movement';
import {
    prepareLanterniteNestForMissionStart,
    upsertNestLightSource,
    LANTERNITE_NEST_CHARACTER_ID,
} from '../game/lanternite/lanternitePulse';
import {
    initializeThornlingNestSpawnState,
    THORNLING_NEST_CHARACTER_ID,
} from '../game/lanternite/thornlingNestTick';
import {
    initializeSwarmNestSpawnState,
    SWARM_NEST_CHARACTER_ID,
} from '../game/lanternite/swarmNestTick';
import { getControlGroupId } from '../state';

/** Gun abilities that require an ammo resource at mission start (not melee swords). */
const AMMO_ABILITIES = new Set(['0203', '0204', '0205']);

function attachResourcesFromEquipment(equippedIds: string[], unit: Unit, eventBus: EventBus): void {
    const seen = new Set<string>();
    for (const itemId of equippedIds) {
        for (const rid of getItemDef(itemId)?.resourcesToAdd ?? []) {
            if (seen.has(rid) || unit.getResource(rid)) continue;
            seen.add(rid);
            if (rid === 'light') unit.attachResource(new Light(), eventBus);
            if (rid === 'rock') unit.attachResource(new Rock(), eventBus);
            if (rid === 'gravity') unit.attachResource(new Gravity(), eventBus);
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

function applyMissionStartResourcesFromResearch(
    unit: Unit,
    researchTrees: Record<string, string[]> | undefined,
): void {
    const grants = getMissionStartResourcesFromResearch(researchTrees);
    for (const [resourceId, amount] of grants) {
        const resource = unit.getResource(resourceId);
        if (resource) resource.add(amount);
    }
}

/** Parameters for initializing game state. */
export interface InitializeGameStateParams {
    /** Player units to spawn (from character selections). portraitId is used for appearance only. */
    playerUnits: { playerId: string; name: string; portraitId?: string }[];
    /** Map of playerId -> characterId (or special IDs like control_enemy:<groupId>). */
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
    /** Multi-level research counts (playerId -> treeId -> nodeId -> level). */
    playerResearchNodeLevelsByPlayer?: Record<string, Record<string, Record<string, number>>>;
    /** POIs collected from the fetched terrain segments; passed to the engine for spawn point lookups. */
    terrainSegmentPOIs?: MapSegmentPOI[];
    /** Zones collected from the fetched terrain segments (already shifted to mission-global coords). */
    terrainSegmentZones?: MapSegmentZone[];
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
    /**
     * Optional NPC groups players with CONTROL_NPCS permission may control instead of a hero.
     * Registered on the engine during {@link initializeGameState} before enemies spawn.
     */
    playerControl?: PlayerControlDef[];
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
    /**
     * Optional NPC groups players with CONTROL_NPCS permission may control instead of a hero.
     * Registered on the engine during {@link initializeGameState} before enemies spawn.
     */
    playerControl?: PlayerControlDef[];
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
     *
     * NOTE: `GameEngine.fromJSON` runs this same mission-setup role on reload/resync, but
     * independently of this method. Any addition here that is *not* serialized into game state
     * (i.e. re-derived from `segmentIds`/mission config rather than persisted) must be replicated
     * there too, or it will be lost on reload.
     */
    initializeGameState(engine: GameEngine, params: InitializeGameStateParams): void {
        engine.localPlayerId = params.localPlayerId;
        engine.terrainManager = params.terrainManager ?? null;
        engine.registerMapPOIs(params.terrainSegmentPOIs ?? []);
        engine.registerMapZones(params.terrainSegmentZones ?? []);
        // Deliberate simplification: call getMissionSegmentNetwork directly using this.segmentIds
        // rather than threading a new terrainSegmentNetwork param through BattleSession the way
        // POIs/zones are pre-computed there — mapNetworkManager is new with no existing
        // multi-call-site convention to match yet.
        engine.state.mapNetworkManager.loadFromSegments(getMissionSegmentNetwork(this.segmentIds));
        // Same simplification as above: resolved directly from this.segmentIds for debug/tooling
        // lookups (e.g. DebugConsole's mouse-position tile readout), not threaded through
        // BattleSession params.
        if (engine.terrainManager) {
            engine.terrainManager.segmentPlacements = getMissionSegmentPlacements(this.segmentIds);
        }

        // Add player units
        const playerCount = params.playerUnits.length;
        const grid = params.terrainManager?.grid;
        const worldW = grid ? grid.worldWidth : this.worldWidth;
        const worldH = grid ? grid.worldHeight : this.worldHeight;
        const playerSpacing = worldH / (playerCount + 1);
        const spawnPoints = this.playerSpawnPoints;
        const researchByPlayer = params.playerResearchTreesByPlayer ?? {};
        const researchLevelsByPlayer = params.playerResearchNodeLevelsByPlayer ?? {};
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

            // Strip cards research says to remove (e.g. Light Core removing Throw Torch).
            const removedCardIds = getRemovedCardsFromResearch(researchByPlayer[pu.playerId]);
            if (removedCardIds.size > 0) {
                for (let j = abilities.length - 1; j >= 0; j--) {
                    if (removedCardIds.has(abilities[j]!)) abilities.splice(j, 1);
                }
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
            const passiveBonuses = computePassiveBonuses(
                researchByPlayer[pu.playerId],
                researchLevelsByPlayer[pu.playerId],
            );
            const baseHp = getDefaultHp(PLAYER_CHARACTER_ID);
            const healthBonus = getHealthBonusFromResearch(getResearchNodes);
            const flatDamageBonus = getDamageBonusFromResearch(getResearchNodes);
            const staminaRecoveryBonus = getStaminaRecoveryBonusFromResearch(getResearchNodes);
            const maxHp = applyPassiveBonusToBase(baseHp + healthBonus, passiveBonuses.maxHealth);
            const damageMultiplier = passiveBonuses.all_damage?.mult ?? DEFAULT_PASSIVE_MULT;
            const combatSettings =
                flatDamageBonus > 0 || damageMultiplier !== DEFAULT_PASSIVE_MULT
                    ? {
                          damageModifier: {
                              flatAmt: flatDamageBonus,
                              multiplier: damageMultiplier,
                          },
                      }
                    : undefined;
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
                    combatSettings,
                    passiveBonuses,
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
            applyMissionStartResourcesFromResearch(unit, researchByPlayer[pu.playerId]);
            for (const resource of unit.resources) {
                resource.primeDisplayContext?.(unit, engine);
            }
            unit.attachResource(new Movement(), engine.eventBus);
            engine.addUnit(unit, 'initialGameSpawn');

            // Spawn pets granted by research alongside this player unit.
            const petAbilitiesById = getPetAbilitiesFromResearch(researchByPlayer[pu.playerId]);
            const dogBiteAbilityId = `${formatGroupId(AbilityGroupId.Command)}01`;
            for (const petId of getPetsFromResearch(researchByPlayer[pu.playerId])) {
                const petDef = getPetDef(petId);
                if (!petDef) continue;
                const grantedAbilities = petAbilitiesById.get(petId) ?? [];
                const abilityIds = [...petDef.abilityIds];
                for (const id of grantedAbilities) {
                    if (!abilityIds.includes(id)) abilityIds.push(id);
                }
                const petBaseHp = getDefaultHp(petDef.unitCharacterId);
                const petMaxHp = applyPassiveBonusToBase(
                    petBaseHp,
                    passiveBonuses[PassiveStatKey.PetMaxHealth],
                );
                const biteDamageFlat = passiveBonuses[PassiveStatKey.Ability0701Damage]?.add ?? 0;
                const [pet] = engine.spawnUnit(
                    {
                        characterId: petDef.unitCharacterId,
                        name: petDef.name,
                        teamId: 'player',
                        abilities: abilityIds,
                        unitAITreeId: 'pet',
                        aiSettings: { minRange: 0, maxRange: 50 },
                        placement: { kind: 'fixedWorld', x: spawnX + 40, y: spawnY },
                        aiHookup: { kind: 'pet', ownerUnitId: unit.id, defId: petId },
                        hp: petMaxHp,
                    },
                    'initialGameSpawn',
                );
                if (!pet) continue;
                pet.maxHp = petMaxHp;
                pet.hp = petMaxHp;
                if (biteDamageFlat > 0) {
                    pet.abilityModifiers = {
                        ...pet.abilityModifiers,
                        [dogBiteAbilityId]: {
                            ...(pet.abilityModifiers[dogBiteAbilityId] ?? {}),
                            damageFlat: biteDamageFlat,
                        },
                    };
                }
                initializeAbilityRuntimeForUnit(pet);
            }
        }

        // Register level events (if any)
        if (this.levelEvents && this.levelEvents.length > 0) {
            engine.registerLevelEvents(this.levelEvents);
        }

        // NPC control: derive group→player assignments (sorted playerIds, first wins) and
        // register before enemies so addUnit assigns ownership on initial spawn.
        const controlDefs = this.playerControl ?? [];
        const assignmentsByGroup: Record<string, string> = {};
        if (controlDefs.length > 0) {
            const declaredGroups = new Set<string>();
            for (const def of controlDefs) {
                const groupId = def.id ?? def.controlGroupId ?? def.unitTag;
                if (groupId != null) declaredGroups.add(groupId);
            }
            const selections = params.characterSelections ?? {};
            for (const playerId of Object.keys(selections).sort()) {
                const groupId = getControlGroupId(selections[playerId]);
                if (groupId == null || !declaredGroups.has(groupId)) continue;
                if (assignmentsByGroup[groupId] != null) continue;
                assignmentsByGroup[groupId] = playerId;
            }
        }
        engine.registerPlayerControl(controlDefs, assignmentsByGroup);

        // Add enemies (health scaled by player count)
        const enemyHealthMult = getEnemyHealthMultiplier(playerCount);
        for (const e of this.enemies) {
            const def = enemySpawnDefToSpawnDefinition(e, 'ai');
            const stats = resolveEnemySpawnStats(e);
            def.hp = Math.round(stats.hp * (e.teamId === 'enemy' ? enemyHealthMult : 1));
            def.speed = stats.speed;
            const [unit] = engine.spawnUnit(def, 'initialGameSpawn');
            if (!unit) continue;
            initializeAbilityRuntimeForUnit(unit);
            attachAmmoIfNeeded(engine, unit);
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
            if (u.characterId === SWARM_NEST_CHARACTER_ID && u.swarmState.nestConfig != null) {
                initializeSwarmNestSpawnState(u, engine.gameTime);
            }
        }

        // Seed map-network membership once, now that every mission-init unit (players, pets,
        // enemies incl. lanternite_nest/swarm_nest/lanternite/swarmling) has been added.
        // Steady-state updates happen incrementally via MapNetworkManager.updateUnitNode
        // (UnitManager.gameTick's Phase 2 movement loop) — this is not a per-tick call.
        engine.state.mapNetworkManager.buildInitialMembership(engine.units);

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
