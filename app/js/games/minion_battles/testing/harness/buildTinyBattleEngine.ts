import { TerrainType } from '../../terrain/TerrainType';
import { TerrainGrid } from '../../terrain/TerrainGrid';
import { TerrainManager } from '../../terrain/TerrainManager';
import { GameEngine } from '../../game/GameEngine';
import type { Unit } from '../../game/units/Unit';
import { createPlayerUnit } from '../../game/units/index';
import { getDefaultHp, PLAYER_CHARACTER_ID } from '../../game/units/unit_defs/unitDef';
import {
    getHealthBonusFromResearch,
    getDamageBonusFromResearch,
    getStaminaRecoveryBonusFromResearch,
} from '../../research/researchTrainingEffects';
import {
    applyPassiveBonusToBase,
    computePassiveBonuses,
    DEFAULT_PASSIVE_MULT,
} from '../../../../researchTrees/passiveBonuses';
import {
    applyAbilityResearchModifiersToRuntime,
    applyCrystalRocksResearchToAbilityRuntime,
    applyStickSwordResearchToAbilityRuntime,
    initializeAbilityRuntimeForUnit,
} from '../../abilities/abilityUses';
import { createTargetDummyAtWorld } from '../fixtures/targetDummies';
import { computeAbilityModifiersFromResearch } from '../../../../researchTrees/evaluator';
import { getAbilityTagsForId } from '../../abilities/Ability';
import { expandAbilityIdsForResearchModifiers } from '../../abilities/abilityModifierHelpers';
import { getItemDef } from '../../character_defs/items';
import {
    activeResearchByPlayer,
    activeResearchNodeLevelsByPlayer,
    resolveCharacterLoadout,
} from '../../character_defs/characterLoadout';
import { createResourceFromId } from '../../resources/createResourceFromId';

/** Ability id that does not resolve in the registry: movement-only orders still apply `movePath`. */
export const MOVE_ONLY_ABILITY_ID = '__move_only__';

export const TINY_BATTLE_PLAYER_ID = 'tiny_p1';

export interface BuildTinyBattleEngineOpts {
    gridW: number;
    gridH: number;
    cellSize?: number;
    localPlayerId: string;
    playerResearchTreesByPlayer?: Record<string, Record<string, string[]>>;
    /** When true (default), fill the grid with grass; otherwise dirt. */
    grass?: boolean;
}

/**
 * Minimal battle `GameEngine` with a rectangular `TerrainGrid`, no missions, no level events.
 */
export function buildTinyBattleEngine(opts: BuildTinyBattleEngineOpts): GameEngine {
    const cellSize = opts.cellSize ?? undefined;
    const defaultTerrain = opts.grass === false ? TerrainType.Dirt : TerrainType.Grass;
    const grid = new TerrainGrid(opts.gridW, opts.gridH, cellSize ?? 40, defaultTerrain);
    const terrainManager = new TerrainManager(grid);

    const engine = new GameEngine();
    engine.prepareForNewGame({
        localPlayerId: opts.localPlayerId,
        randomSeed: 1,
        terrainManager,
        aiControllerId: null,
    });
    engine.setMissionLightConfig(false, 0);

    if (opts.playerResearchTreesByPlayer) {
        engine.setPlayerResearchTreesByPlayer(opts.playerResearchTreesByPlayer);
    }

    return engine;
}

function researchGetter(
    playerResearchTreesByPlayer: Record<string, Record<string, string[]>> | undefined,
    playerId: string,
): (treeId: string) => string[] {
    return (treeId: string) => playerResearchTreesByPlayer?.[playerId]?.[treeId] ?? [];
}

/**
 * Spawn the local player unit and optional research-derived combat stats (mirrors `BaseMissionDef` intent).
 */
/**
 * Spawn a player unit for headless scenario tests.
 *
 * Optional resources (Movement, Ammo, etc.) are NOT attached automatically —
 * the real game adds them via items/loadout, but the test harness skips that.
 * When the ability under test has a resource cost, attach the resource manually
 * after calling this function:
 *
 *   const movement = new Movement();
 *   player.attachResource(movement, engine.eventBus);
 *
 * See Movement.test.ts for more examples of resource setup in tests.
 */
export function spawnTinyPlayerUnit(
    engine: GameEngine,
    params: {
        playerId: string;
        name?: string;
        portraitId?: string;
        x: number;
        y: number;
        abilities: string[];
        playerResearchTreesByPlayer?: Record<string, Record<string, string[]>>;
        playerResearchNodeLevelsByPlayer?: Record<string, Record<string, Record<string, number>>>;
        /**
         * When true, compute `unit.abilityModifiers` from research and apply `maxUsesFlat` to the
         * runtime, in the same order as `BaseMissionDef` (modifiers, init, modifier runtime, rocks/stick).
         */
        applyResearchAbilityModifiers?: boolean;
    },
): Unit {
    const eventBus = engine.eventBus;
    const getResearchNodes = researchGetter(params.playerResearchTreesByPlayer, params.playerId);
    const passiveBonuses = computePassiveBonuses(
        params.playerResearchTreesByPlayer?.[params.playerId],
        params.playerResearchNodeLevelsByPlayer?.[params.playerId],
    );
    const baseHp = getDefaultHp(PLAYER_CHARACTER_ID);
    const healthBonus = getHealthBonusFromResearch(getResearchNodes);
    const flatDamageBonus = getDamageBonusFromResearch(getResearchNodes);
    const staminaRecoveryBonus = getStaminaRecoveryBonusFromResearch(getResearchNodes);
    const maxHp = applyPassiveBonusToBase(baseHp + healthBonus, passiveBonuses.maxHealth);
    const damageMultiplier = passiveBonuses.all_damage?.mult ?? DEFAULT_PASSIVE_MULT;
    const unit = createPlayerUnit(
        {
            x: params.x,
            y: params.y,
            teamId: 'player',
            ownerId: params.playerId,
            name: params.name ?? 'Tester',
            abilities: params.abilities,
            portraitId: params.portraitId ?? 'warrior',
            hp: maxHp,
            maxHp,
            combatSettings:
                flatDamageBonus > 0 || damageMultiplier !== DEFAULT_PASSIVE_MULT
                    ? { damageModifier: { flatAmt: flatDamageBonus, multiplier: damageMultiplier } }
                    : undefined,
            passiveBonuses,
        },
        eventBus,
        engine,
    );
    if (staminaRecoveryBonus > 0) {
        unit.stamina += staminaRecoveryBonus;
    }
    if (params.applyResearchAbilityModifiers) {
        unit.abilityModifiers = computeAbilityModifiersFromResearch(
            params.playerResearchTreesByPlayer?.[params.playerId],
            getAbilityTagsForId,
            expandAbilityIdsForResearchModifiers(unit.abilities),
            params.playerResearchNodeLevelsByPlayer?.[params.playerId],
        );
    }
    initializeAbilityRuntimeForUnit(unit);
    if (params.applyResearchAbilityModifiers) {
        applyAbilityResearchModifiersToRuntime(unit, unit.abilityModifiers);
    }
    applyCrystalRocksResearchToAbilityRuntime(unit, getResearchNodes);
    applyStickSwordResearchToAbilityRuntime(unit, getResearchNodes);
    engine.addUnit(unit, 'initialGameSpawn');
    return unit;
}


export interface PlacePlayerAndDummyOpts {
    playerId: string;
    playerWorld: { x: number; y: number };
    dummyWorld: { x: number; y: number };
    abilities: string[];
    dummyId?: string;
    playerResearchTreesByPlayer?: Record<string, Record<string, string[]>>;
}

/** Add player at `playerWorld` and a target dummy at `dummyWorld`. */
export function placePlayerAndDummy(engine: GameEngine, opts: PlacePlayerAndDummyOpts): { player: Unit; dummy: Unit } {
    const player = spawnTinyPlayerUnit(engine, {
        playerId: opts.playerId,
        x: opts.playerWorld.x,
        y: opts.playerWorld.y,
        abilities: opts.abilities,
        playerResearchTreesByPlayer: opts.playerResearchTreesByPlayer,
    });

    const dummy = createTargetDummyAtWorld(engine, opts.dummyWorld.x, opts.dummyWorld.y, {
        id: opts.dummyId ?? 'target_dummy',
    });
    initializeAbilityRuntimeForUnit(dummy);
    engine.addUnit(dummy, 'initialGameSpawn');
    return { player, dummy };
}

export interface PlacePlayerFromLoadoutOpts {
    playerId: string;
    world: { x: number; y: number };
    /** Equipped item ids (stored character equipment, e.g. `['004', '001']`). */
    equipment: string[];
    /** STORED research (before the active-research filter), as saved on the character. */
    researchTrees?: Record<string, string[]>;
    researchNodeLevels?: Record<string, Record<string, number>>;
}

/**
 * Spawn a player unit the way the battle path does: abilities come only from
 * `resolveCharacterLoadout(equipment, storedResearch)`, and everything else (engine research,
 * passives, ability modifiers, runtime tweaks) reads ACTIVE research (`activeResearchByPlayer`).
 * Engine research is set from active research, as `BattleSession` does, so in-engine lookups such
 * as the Charged Rocks light pulse ignore research for an unequipped weapon.
 */
export function placePlayerFromLoadout(
    engine: GameEngine,
    opts: PlacePlayerFromLoadoutOpts,
): { player: Unit; abilityIds: string[]; activeResearchTrees: Record<string, string[]> } {
    const { playerId } = opts;
    const loadout = resolveCharacterLoadout(opts.equipment, opts.researchTrees);
    const activeByPlayer = activeResearchByPlayer(
        { [playerId]: opts.equipment },
        { [playerId]: opts.researchTrees ?? {} },
    );
    const activeLevelsByPlayer = activeResearchNodeLevelsByPlayer(
        { [playerId]: opts.equipment },
        opts.researchNodeLevels ? { [playerId]: opts.researchNodeLevels } : undefined,
    );
    engine.setPlayerResearchTreesByPlayer({
        ...engine.playerResearchTreesByPlayer,
        ...activeByPlayer,
    });
    const player = spawnTinyPlayerUnit(engine, {
        playerId,
        x: opts.world.x,
        y: opts.world.y,
        abilities: [...loadout.abilityIds],
        playerResearchTreesByPlayer: activeByPlayer,
        playerResearchNodeLevelsByPlayer: activeLevelsByPlayer,
        applyResearchAbilityModifiers: true,
    });
    // Mirrors BaseMissionDef.attachResourcesFromEquipment.
    for (const itemId of loadout.battleEquipmentIds) {
        for (const rid of getItemDef(itemId)?.resourcesToAdd ?? []) {
            if (player.getResource(rid)) continue;
            const resource = createResourceFromId(rid);
            if (resource) player.attachResource(resource, engine.eventBus);
        }
    }
    return { player, abilityIds: loadout.abilityIds, activeResearchTrees: activeByPlayer[playerId] ?? {} };
}

/** Add a target dummy (same fixture as `placePlayerAndDummy`). */
export function placeTargetDummy(
    engine: GameEngine,
    world: { x: number; y: number },
    id = 'target_dummy',
): Unit {
    const dummy = createTargetDummyAtWorld(engine, world.x, world.y, { id });
    initializeAbilityRuntimeForUnit(dummy);
    engine.addUnit(dummy, 'initialGameSpawn');
    return dummy;
}
