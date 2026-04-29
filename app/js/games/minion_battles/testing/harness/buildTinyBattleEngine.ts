import { TerrainType } from '../../terrain/TerrainType';
import { TerrainGrid } from '../../terrain/TerrainGrid';
import { TerrainManager } from '../../terrain/TerrainManager';
import { GameEngine } from '../../game/GameEngine';
import type { Unit } from '../../game/units/Unit';
import { createPlayerUnit } from '../../game/units/index';
import { getDefaultHp, PLAYER_CHARACTER_ID } from '../../game/units/unit_defs/unitDef';
import { getHealthBonusFromResearch, getDamageBonusFromResearch } from '../../research/researchTrainingEffects';
import { applyStickSwordResearchToAbilityRuntime, initializeAbilityRuntimeForUnit } from '../../abilities/abilityUses';
import { getCardDef, asCardDefId, type CardDefId } from '../../card_defs';
import type { CardInstance } from '../../game/managers/CardManager';
import { createTargetDummyAtWorld } from '../fixtures/targetDummies';

/** Ability id that does not resolve in the registry: movement-only orders still apply `movePath`. */
export const MOVE_ONLY_ABILITY_ID = '__move_only__';

export const TINY_BATTLE_PLAYER_ID = 'tiny_p1';

export interface TinyBattleHandEntry {
    cardDefId: CardDefId | string;
    abilityId: string;
}

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
        terrainManager,
        isHost: true,
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
    },
): Unit {
    const eventBus = engine.eventBus;
    const getResearchNodes = researchGetter(params.playerResearchTreesByPlayer, params.playerId);
    const baseHp = getDefaultHp(PLAYER_CHARACTER_ID);
    const healthBonus = getHealthBonusFromResearch(getResearchNodes);
    const flatDamageBonus = getDamageBonusFromResearch(getResearchNodes);
    const maxHp = baseHp + healthBonus;
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
                flatDamageBonus > 0 ? { damageModifier: { flatAmt: flatDamageBonus, multiplier: 1 } } : undefined,
        },
        eventBus,
        engine,
    );
    initializeAbilityRuntimeForUnit(unit);
    applyStickSwordResearchToAbilityRuntime(unit, getResearchNodes);
    engine.addUnit(unit);
    return unit;
}

/** Replace hand with card instances (durability from card def). */
export function seedHandWithAbilities(engine: GameEngine, playerId: string, entries: TinyBattleHandEntry[]): void {
    const hand: CardInstance[] = [];
    for (const e of entries) {
        const cardDefId = typeof e.cardDefId === 'string' ? asCardDefId(e.cardDefId) : e.cardDefId;
        const def = getCardDef(cardDefId);
        const inst = engine.state.cardManager.createCardInstance(cardDefId, e.abilityId, 'hand');
        if (def?.durability != null) {
            inst.durability = def.durability;
        }
        hand.push(inst);
    }
    engine.cards[playerId] = hand;
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
    engine.addUnit(dummy);
    return { player, dummy };
}
