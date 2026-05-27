/**
 * Lanternite network scenarios:
 *   1. Nest build — networked nest spawns a scout, scout travels to a connected POI and constructs a second nest.
 *   2. Defender attack — lanternite light-pulse ability fires at an enemy and deals damage.
 */

import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    MOVE_ONLY_ABILITY_ID,
    TINY_BATTLE_PLAYER_ID,
    spawnTinyPlayerUnit,
} from '../../harness/buildTinyBattleEngine';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { prepareLanterniteNestForMissionStart } from '../../../game/lanternite/lanternitePulse';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';

const CELL = 40;

function worldOf(col: number, row: number): { x: number; y: number } {
    return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

// ---------------------------------------------------------------------------
// Scenario 1: Networked nest spawns a scout that builds a second nest
// ---------------------------------------------------------------------------

// Compact map: just wide enough for both nests (col 2 and col 12), short enough to
// frame the action tightly.
const NEST_GRID_W = 15;
const NEST_GRID_H = 8;

const NEST_A_COL = 2;
const NEST_A_ROW = 3;
const NEST_B_COL = 12;
const NEST_B_ROW = 3;

// Player starts centred below the nests and walks left/right across the map.
// Zigzag: col 7 → 0 → 14 → 0 = 35 steps × 40 px = 1400 px / 90 px/s ≈ 15.5 s
// Total scenario time: ~1 s spawn + ~5 s travel (stands 56 px short) + ~2 s construction ≈ 8 s — safely covered.
const PLAYER_START_COL = 7;
const PLAYER_WALK_ROW = 6;

/**
 * Build a horizontal zigzag path along `row`:
 *   startCol → 0 → maxCol → 0
 * Each step is exactly one column, so the path is always valid on open terrain.
 */
function buildPlayerZigzagPath(startCol: number, row: number, maxCol: number): { col: number; row: number }[] {
    const path: { col: number; row: number }[] = [];
    let col = startCol;
    path.push({ col, row });
    while (col > 0)      { col--; path.push({ col, row }); }  // leg 1: left to edge
    while (col < maxCol) { col++; path.push({ col, row }); }  // leg 2: right to edge
    while (col > 0)      { col--; path.push({ col, row }); }  // leg 3: left to edge
    return path;
}

export const lanterniteNestBuildScenario: ScenarioDefinition = {
    id: 'lanternite_nest_build',
    title: 'Lanternite: scout travels to connected POI and builds a second nest',
    category: 'general',
    generalSection: 'Lanternites',
    // ~1s spawn + ~5s travel + ~2s construction + buffer
    maxDurationMs: 25000,

    buildEngine() {
        const engine = buildTinyBattleEngine({
            gridW: NEST_GRID_W,
            gridH: NEST_GRID_H,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });

        // Register network POIs using world-grid coords (same as gridToWorld(col, row))
        engine.registerMapPOIs([
            { id: 'test_nest_a', label: 'Nest A', col: NEST_A_COL, row: NEST_A_ROW, type: 'nest', tags: ['connects:test_nest_b'] },
            { id: 'test_nest_b', label: 'Nest B', col: NEST_B_COL, row: NEST_B_ROW, type: 'nest' },
        ]);

        const pos = worldOf(NEST_A_COL, NEST_A_ROW);
        const nestUnit = createUnitFromSpawnConfig(
            {
                id: 'test_nest_a_unit',
                characterId: 'lanternite_nest',
                name: 'Test Nest A',
                x: pos.x,
                y: pos.y,
                teamId: 'allied',
                ownerId: 'ai',
                abilities: [],
                unitAITreeId: 'lanterniteNestIdle',
                aiSettings: { minRange: 0, maxRange: 0 },
            },
            engine.eventBus,
            engine,
        );
        nestUnit.lanterniteNestConfig = {
            maxLanternites: 1,
            spawnIntervalSec: 1,
            patrolDestination: { kind: 'world', x: worldOf(NEST_B_COL, NEST_B_ROW).x, y: worldOf(NEST_B_COL, NEST_B_ROW).y },
            networked: true,
            nestPoiId: 'test_nest_a',
            scoutConstructionSec: 2,
        };
        nestUnit.lanterniteHomeNestPoiId = 'test_nest_a';
        prepareLanterniteNestForMissionStart(nestUnit, 0);
        // Override to spawn the scout on the very first tick rather than after spawnIntervalSec
        nestUnit.lanterniteNestSpawnState!.nextSpawnAtGameTime = 0;
        engine.addUnit(nestUnit);

        // Player spawns below the nest row and walks left/right — keeps battle non-idle
        // during the full scout-spawn → travel → construction sequence.
        spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: worldOf(PLAYER_START_COL, PLAYER_WALK_ROW).x,
            y: worldOf(PLAYER_START_COL, PLAYER_WALK_ROW).y,
            abilities: [],
        });

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit();
        if (!player) return [];
        // Walk left → right → left across the bottom of the map (three legs, ~15 s total)
        const path = buildPlayerZigzagPath(PLAYER_START_COL, PLAYER_WALK_ROW, NEST_GRID_W - 1);
        return [{ unitId: player.id, abilityId: MOVE_ONLY_ABILITY_ID, targets: [], movePath: path }];
    },

    assertPass(engine) {
        return engine.units.filter((u) => u.characterId === 'lanternite_nest' && u.isAlive()).length >= 2;
    },

    failureMessage(engine) {
        const nests = engine.units.filter((u) => u.characterId === 'lanternite_nest' && u.isAlive());
        const scouts = engine.units.filter((u) => u.characterId === 'lanternite' && u.isAlive());
        const scout = scouts[0];
        const buildTime = scout?.lanterniteConstructionCompleteAtGameTime;
        return (
            `alive nests=${nests.length} alive scouts=${scouts.length}` +
            (buildTime != null
                ? ` constructAt=${buildTime.toFixed(1)} now=${engine.gameTime.toFixed(1)}`
                : ' no-construct-timer')
        );
    },

    describeState(engine) {
        const nests = engine.units.filter((u) => u.characterId === 'lanternite_nest' && u.isAlive()).length;
        const scouts = engine.units.filter((u) => u.characterId === 'lanternite').length;
        return `t=${engine.gameTime.toFixed(1)} nests=${nests} scouts=${scouts}`;
    },
};

// ---------------------------------------------------------------------------
// Scenario 2: Lanternite light-pulse fires at a nearby enemy and deals damage
// ---------------------------------------------------------------------------

const DEF_LAN_COL = 3;
const DEF_LAN_ROW = 3;
const ENEMY_COL = 7;
const ENEMY_ROW = 3;
const ENEMY_HP = 100;

export const lanterniteDefenderAttackScenario: ScenarioDefinition = {
    id: 'lanternite_defender_attack',
    title: 'Lanternite: light pulse ability hits an enemy and deals damage',
    category: 'general',
    generalSection: 'Lanternites',
    // 0.7s prefire + brief projectile flight + buffer
    maxDurationMs: 5000,

    buildEngine() {
        const engine = buildTinyBattleEngine({
            gridW: 10,
            gridH: 6,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });

        // Lanternite with light-pulse ability
        const lanPos = worldOf(DEF_LAN_COL, DEF_LAN_ROW);
        const lanternite = createUnitFromSpawnConfig(
            {
                id: 'test_lanternite',
                characterId: 'lanternite',
                name: 'Test Lanternite',
                x: lanPos.x,
                y: lanPos.y,
                teamId: 'allied',
                ownerId: 'ai',
                abilities: ['0010'],
                unitAITreeId: 'lanterniteNetwork',
                aiSettings: { minRange: 0, maxRange: 200 },
            },
            engine.eventBus,
            engine,
        );
        lanternite.lanterniteRole = 'defender';
        initializeAbilityRuntimeForUnit(lanternite);
        engine.addUnit(lanternite);

        // Stationary enemy within range (4 cells = 160 px < 200 px max range)
        const enemyPos = worldOf(ENEMY_COL, ENEMY_ROW);
        const enemy = createUnitFromSpawnConfig(
            {
                id: 'test_enemy',
                characterId: 'enemy_melee',
                name: 'Test Enemy',
                hp: ENEMY_HP,
                x: enemyPos.x,
                y: enemyPos.y,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: [],
                unitAITreeId: 'static_test_no_ai',
            },
            engine.eventBus,
            engine,
        );
        engine.addUnit(enemy);

        // Player unit is required to prevent immediate defeat check
        spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: worldOf(0, 0).x,
            y: worldOf(0, 0).y,
            abilities: [],
        });

        return engine;
    },

    getInitialOrders(engine) {
        const lan = engine.getUnit('test_lanternite');
        if (!lan) return [];
        const player = engine.getLocalPlayerUnit();
        const orders: import('../../../game/types').BattleOrder[] = [
            { unitId: lan.id, abilityId: '0010', targets: [{ type: 'pixel', position: worldOf(ENEMY_COL, ENEMY_ROW) }] },
        ];
        // Give the player a wait order so shouldPauseForOrders() doesn't freeze the engine
        if (player) {
            orders.push({ unitId: player.id, abilityId: 'wait', targets: [] });
        }
        return orders;
    },

    assertPass(engine) {
        const enemy = engine.getUnit('test_enemy');
        return enemy != null && enemy.hp < ENEMY_HP;
    },

    failureMessage(engine) {
        const enemy = engine.getUnit('test_enemy');
        const lan = engine.getUnit('test_lanternite');
        return (
            `enemy hp=${enemy?.hp ?? '—'}/${ENEMY_HP} ` +
            `lan activeAbilities=${lan?.activeAbilities.length ?? 0} ` +
            `t=${engine.gameTime.toFixed(1)}`
        );
    },

    describeState(engine) {
        const enemy = engine.getUnit('test_enemy');
        const lan = engine.getUnit('test_lanternite');
        return `t=${engine.gameTime.toFixed(1)} enemyHp=${enemy?.hp ?? '—'} lanState=${lan?.aiContext?.aiState ?? '?'}`;
    },
};
