/**
 * Lanternite network scenarios:
 *   1. Nest build â€” networked nest spawns a scout, scout travels to a connected POI and constructs a second nest.
 *   2. Defender attack â€” lanternite light-pulse ability fires at an enemy and deals damage.
 *   3. Nest thorn spread â€” nest passive converts nearby tiles to bramble_slow terrain each tick.
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
import { LANTERNITE_NEST_AURA_ID } from '../../../card_defs/dark_animals/0014_LanterniteNestAura/0014Ability';
import { rasterizeArea } from '../../../game/TerrainLayerManager';

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
// Zigzag: col 7 â†’ 0 â†’ 14 â†’ 0 = 35 steps Ã— 40 px = 1400 px / 90 px/s â‰ˆ 15.5 s
// Total scenario time: ~1 s spawn + ~5 s travel (stands 56 px short) + ~2 s construction â‰ˆ 8 s â€” safely covered.
const PLAYER_START_COL = 7;
const PLAYER_WALK_ROW = 6;

/**
 * Build a horizontal zigzag path along `row`:
 *   startCol â†’ 0 â†’ maxCol â†’ 0
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

        // POIs are cosmetic/informational only now — connectivity comes from `mapNetworkManager`
        // below (`connects:` POI tags are no longer parsed; see `lanterniteNetworkUtils.ts`).
        engine.registerMapPOIs([
            { id: 'test_nest_a', label: 'Nest A', col: NEST_A_COL, row: NEST_A_ROW, type: 'nest' },
            { id: 'test_nest_b', label: 'Nest B', col: NEST_B_COL, row: NEST_B_ROW, type: 'nest' },
        ]);
        // This harness has no mission/segments to derive a network from (see
        // `buildTinyBattleEngine`), so the test registers the graph directly — mirrors what
        // `BaseMissionDef.initializeGameState` does via `getMissionSegmentNetwork` in the real game.
        engine.mapNetworkManager.loadFromSegments({
            nodes: [
                { id: 'test_nest_a', x: worldOf(NEST_A_COL, NEST_A_ROW).x, y: worldOf(NEST_A_COL, NEST_A_ROW).y, radius: 0, tags: ['nest'], segmentId: 'test' },
                { id: 'test_nest_b', x: worldOf(NEST_B_COL, NEST_B_ROW).x, y: worldOf(NEST_B_COL, NEST_B_ROW).y, radius: 0, tags: ['nest'], segmentId: 'test' },
            ],
            edges: [['test_nest_a', 'test_nest_b']],
        });

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
        nestUnit.lanterniteState.nestConfig = {
            maxLanternites: 1,
            spawnIntervalSec: 1,
            patrolDestination: { kind: 'world', x: worldOf(NEST_B_COL, NEST_B_ROW).x, y: worldOf(NEST_B_COL, NEST_B_ROW).y },
            networked: true,
            nestPoiId: 'test_nest_a',
            scoutConstructionSec: 2,
        };
        nestUnit.lanterniteState.homeNestPoiId = 'test_nest_a';
        prepareLanterniteNestForMissionStart(nestUnit, 0);
        // Override to spawn the scout on the very first tick rather than after spawnIntervalSec
        nestUnit.lanterniteState.nestSpawnState!.nextSpawnAtGameTime = 0;
        engine.addUnit(nestUnit, 'initialGameSpawn');

        // Player spawns below the nest row and walks left/right â€” keeps battle non-idle
        // during the full scout-spawn â†’ travel â†’ construction sequence.
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
        // Walk left â†’ right â†’ left across the bottom of the map (three legs, ~15 s total)
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
        const buildTime = scout?.lanterniteState.constructionCompleteAtGameTime;
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
// Scenario 2: maxLanternites:2 â†’ first spawn becomes a scout (builds second
// nest) while the second spawn becomes a defender (guards the original nest)
// ---------------------------------------------------------------------------

export const lanterniteNestDualSpawnScenario: ScenarioDefinition = {
    id: 'lanternite_nest_dual_spawn',
    title: 'Lanternite: nest spawns a scout (builds second nest) and a defender (guards original)',
    category: 'general',
    generalSection: 'Lanternites',
    // scout at t=0, defender at t=1, ~5s travel, ~2s construction â†’ ~8s total; 20s is generous
    maxDurationMs: 20000,

    buildEngine() {
        const engine = buildTinyBattleEngine({
            gridW: NEST_GRID_W,
            gridH: NEST_GRID_H,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });

        // Use distinct POI IDs from scenario 1 so the two scenarios don't share state.
        // POIs are cosmetic/informational only — connectivity comes from `mapNetworkManager` below.
        engine.registerMapPOIs([
            { id: 'dual_nest_a', label: 'Nest A', col: NEST_A_COL, row: NEST_A_ROW, type: 'nest' },
            { id: 'dual_nest_b', label: 'Nest B', col: NEST_B_COL, row: NEST_B_ROW, type: 'nest' },
        ]);
        engine.mapNetworkManager.loadFromSegments({
            nodes: [
                { id: 'dual_nest_a', x: worldOf(NEST_A_COL, NEST_A_ROW).x, y: worldOf(NEST_A_COL, NEST_A_ROW).y, radius: 0, tags: ['nest'], segmentId: 'test' },
                { id: 'dual_nest_b', x: worldOf(NEST_B_COL, NEST_B_ROW).x, y: worldOf(NEST_B_COL, NEST_B_ROW).y, radius: 0, tags: ['nest'], segmentId: 'test' },
            ],
            edges: [['dual_nest_a', 'dual_nest_b']],
        });

        const pos = worldOf(NEST_A_COL, NEST_A_ROW);
        const nestUnit = createUnitFromSpawnConfig(
            {
                id: 'dual_spawn_nest_a',
                characterId: 'lanternite_nest',
                name: 'Dual-Spawn Nest A',
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
        // maxLanternites:2 means the nest will produce one scout (first) and one defender (second)
        nestUnit.lanterniteState.nestConfig = {
            maxLanternites: 2,
            spawnIntervalSec: 1,
            patrolDestination: { kind: 'world', x: worldOf(NEST_B_COL, NEST_B_ROW).x, y: worldOf(NEST_B_COL, NEST_B_ROW).y },
            networked: true,
            nestPoiId: 'dual_nest_a',
            scoutConstructionSec: 2,
        };
        nestUnit.lanterniteState.homeNestPoiId = 'dual_nest_a';
        prepareLanterniteNestForMissionStart(nestUnit, 0);
        // Trigger the scout on the very first tick rather than waiting spawnIntervalSec
        nestUnit.lanterniteState.nestSpawnState!.nextSpawnAtGameTime = 0;
        engine.addUnit(nestUnit, 'initialGameSpawn');

        // Player walks a three-leg zigzag so the battle stays non-idle for the full ~8s sequence
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
        const path = buildPlayerZigzagPath(PLAYER_START_COL, PLAYER_WALK_ROW, NEST_GRID_W - 1);
        return [{ unitId: player.id, abilityId: MOVE_ONLY_ABILITY_ID, targets: [], movePath: path }];
    },

    assertPass(engine) {
        const nests = engine.units.filter((u) => u.characterId === 'lanternite_nest' && u.isAlive()).length;
        const defenders = engine.units.filter(
            (u) => u.characterId === 'lanternite' && u.lanterniteState.role === 'defender' && u.isAlive(),
        ).length;
        // Both halves must be true: scout built the second nest, AND a defender is still on guard
        return nests >= 2 && defenders >= 1;
    },

    failureMessage(engine) {
        const nests = engine.units.filter((u) => u.characterId === 'lanternite_nest' && u.isAlive()).length;
        const scouts = engine.units.filter(
            (u) => u.characterId === 'lanternite' && u.lanterniteState.role === 'scout' && u.isAlive(),
        );
        const defenders = engine.units.filter(
            (u) => u.characterId === 'lanternite' && u.lanterniteState.role === 'defender' && u.isAlive(),
        ).length;
        const buildTime = scouts[0]?.lanterniteState.constructionCompleteAtGameTime;
        return (
            `alive nests=${nests} scouts=${scouts.length} defenders=${defenders}` +
            (buildTime != null ? ` constructAt=${buildTime.toFixed(1)} now=${engine.gameTime.toFixed(1)}` : '')
        );
    },

    describeState(engine) {
        const nests = engine.units.filter((u) => u.characterId === 'lanternite_nest' && u.isAlive()).length;
        const scouts = engine.units.filter((u) => u.characterId === 'lanternite' && u.lanterniteState.role === 'scout').length;
        const defenders = engine.units.filter((u) => u.characterId === 'lanternite' && u.lanterniteState.role === 'defender').length;
        return `t=${engine.gameTime.toFixed(1)} nests=${nests} scouts=${scouts} defenders=${defenders}`;
    },
};

// ---------------------------------------------------------------------------
// Scenario 2b: Two scouts converge on the same POI — they share one build instead
// of racing separately, and having two of them speeds construction up.
// ---------------------------------------------------------------------------

const SHARED_SITE_COL = 6;
const SHARED_SITE_ROW = 3;
const SHARED_SCOUT_CONSTRUCTION_SEC = 4;
/** Must match CONSTRUCTION_STAND_RADIUS in lnet_scout_travel.ts. */
const SHARED_CONSTRUCTION_STAND_RADIUS = 56;

export const lanterniteSharedConstructionScenario: ScenarioDefinition = {
    id: 'lanternite_shared_construction',
    title: 'Lanternite: two scouts building at the same site finish faster than one alone',
    category: 'general',
    generalSection: 'Lanternites',
    maxDurationMs: 8000,

    buildEngine() {
        const engine = buildTinyBattleEngine({
            gridW: 10,
            gridH: 8,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });

        engine.registerMapPOIs([
            { id: 'shared_site', label: 'Shared Site', col: SHARED_SITE_COL, row: SHARED_SITE_ROW, type: 'nest' },
        ]);

        const sitePos = worldOf(SHARED_SITE_COL, SHARED_SITE_ROW);

        // Both scouts start already standing at their construction position (angles 0 and PI, so
        // they don't overlap) — this isolates the shared-build/acceleration behavior from travel time.
        function makeScout(id: string, angle: number): void {
            const standX = sitePos.x + Math.cos(angle) * SHARED_CONSTRUCTION_STAND_RADIUS;
            const standY = sitePos.y + Math.sin(angle) * SHARED_CONSTRUCTION_STAND_RADIUS;
            const scout = createUnitFromSpawnConfig(
                {
                    id,
                    characterId: 'lanternite',
                    name: 'Test Scout',
                    x: standX,
                    y: standY,
                    teamId: 'allied',
                    ownerId: 'ai',
                    abilities: ['0010'],
                    unitAITreeId: 'lanterniteNetwork',
                    aiSettings: { minRange: 0, maxRange: 600 },
                },
                engine.eventBus,
                engine,
            );
            scout.lanterniteState.role = 'scout';
            scout.lanterniteState.targetNestPoiId = 'shared_site';
            scout.lanterniteState.patrolFarWorld = { x: sitePos.x, y: sitePos.y };
            scout.lanterniteState.constructionAngle = angle;
            scout.lanterniteState.nestConfig = {
                maxLanternites: 1,
                spawnIntervalSec: 1,
                patrolDestination: { kind: 'world', x: sitePos.x, y: sitePos.y },
                networked: true,
                nestPoiId: 'shared_site',
                scoutConstructionSec: SHARED_SCOUT_CONSTRUCTION_SEC,
            };
            initializeAbilityRuntimeForUnit(scout);
            engine.addUnit(scout, 'initialGameSpawn');
        }
        makeScout('shared_scout_a', 0);
        makeScout('shared_scout_b', Math.PI);

        spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: worldOf(0, 7).x,
            y: worldOf(0, 7).y,
            abilities: [],
        });

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit();
        if (!player) return [];
        return [{ unitId: player.id, abilityId: 'wait', targets: [] }];
    },

    assertPass(engine) {
        // Exactly one nest should ever be built here, and — since two scouts are contributing —
        // it must complete well before a lone scout's SHARED_SCOUT_CONSTRUCTION_SEC (4s) would allow.
        const nests = engine.units.filter((u) => u.characterId === 'lanternite_nest' && u.isAlive());
        return nests.length === 1 && engine.gameTime < SHARED_SCOUT_CONSTRUCTION_SEC * 0.75;
    },

    failureMessage(engine) {
        const nests = engine.units.filter((u) => u.characterId === 'lanternite_nest' && u.isAlive());
        const scouts = engine.units.filter((u) => u.characterId === 'lanternite' && u.isAlive());
        const buildTime = scouts[0]?.lanterniteState.constructionCompleteAtGameTime;
        return (
            `alive nests=${nests.length} alive scouts=${scouts.length}` +
            (buildTime != null
                ? ` constructAt=${buildTime.toFixed(1)} now=${engine.gameTime.toFixed(1)}`
                : ' no-construct-timer')
        );
    },

    describeState(engine) {
        const nests = engine.units.filter((u) => u.characterId === 'lanternite_nest' && u.isAlive()).length;
        const scouts = engine.units.filter((u) => u.characterId === 'lanternite' && u.isAlive()).length;
        return `t=${engine.gameTime.toFixed(1)} nests=${nests} scouts=${scouts}`;
    },
};

// ---------------------------------------------------------------------------
// Scenario 3: Lanternite light-pulse fires at a nearby enemy and deals damage
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
        lanternite.lanterniteState.role = 'defender';
        initializeAbilityRuntimeForUnit(lanternite);
        engine.addUnit(lanternite, 'initialGameSpawn');

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
        engine.addUnit(enemy, 'initialGameSpawn');

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
            `enemy hp=${enemy?.hp ?? 'â€”'}/${ENEMY_HP} ` +
            `lan activeAbilities=${lan?.activeAbilities.length ?? 0} ` +
            `t=${engine.gameTime.toFixed(1)}`
        );
    },

    describeState(engine) {
        const enemy = engine.getUnit('test_enemy');
        const lan = engine.getUnit('test_lanternite');
        return `t=${engine.gameTime.toFixed(1)} enemyHp=${enemy?.hp ?? 'â€”'} lanState=${lan?.aiContext?.aiState ?? '?'}`;
    },
};

// ---------------------------------------------------------------------------
// Scenario 4: Lanternite nest passive spreads bramble_slow tiles each tick
// ---------------------------------------------------------------------------

const THORN_NEST_COL = 5;
const THORN_NEST_ROW = 3;
// Pulse radius from the ability (210 px); must match 0014Ability.ts PULSE_RADIUS.
const THORN_PULSE_RADIUS = 210;

export const lanterniteNestThornSpreadScenario: ScenarioDefinition = {
    id: 'lanternite_nest_thorn_spread',
    title: 'Lanternite nest: passive pulse converts nearby tiles to bramble_slow terrain',
    category: 'general',
    generalSection: 'Lanternites',
    // Cover at least 3 × 1s pulse intervals with margin
    maxDurationMs: 6000,

    buildEngine() {
        const engine = buildTinyBattleEngine({
            gridW: 10,
            gridH: 8,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });

        const nestPos = worldOf(THORN_NEST_COL, THORN_NEST_ROW);
        const nestUnit = createUnitFromSpawnConfig(
            {
                id: 'thorn_spread_nest',
                characterId: 'lanternite_nest',
                name: 'Thorn Spread Nest',
                x: nestPos.x,
                y: nestPos.y,
                teamId: 'allied',
                ownerId: 'ai',
                abilities: [LANTERNITE_NEST_AURA_ID],
                unitAITreeId: 'lanterniteNestIdle',
                aiSettings: { minRange: 0, maxRange: 0 },
            },
            engine.eventBus,
            engine,
        );
        initializeAbilityRuntimeForUnit(nestUnit);
        engine.addUnit(nestUnit, 'initialGameSpawn');

        // Player unit off to the side with a wait order so the battle stays non-idle
        spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: worldOf(0, 7).x,
            y: worldOf(0, 7).y,
            abilities: [],
        });

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit();
        if (!player) return [];
        return [{ unitId: player.id, abilityId: 'wait', targets: [] }];
    },

    assertPass(engine) {
        // Count ground-layer cells with bramble_slow within PULSE_RADIUS of the nest
        const nest = engine.getUnit('thorn_spread_nest');
        if (!nest) return false;
        const candidates = rasterizeArea({
            type: 'circle',
            x: nest.x,
            y: nest.y,
            radiusPx: THORN_PULSE_RADIUS,
        });
        const brambleCells = candidates.filter(({ col, row }) => {
            const effect = engine.terrainLayers.getGroundEffectAt(col, row);
            return effect?.effectType === 'bramble_slow';
        });
        return brambleCells.length >= 2;
    },

    failureMessage(engine) {
        const nest = engine.getUnit('thorn_spread_nest');
        if (!nest) return `nest unit missing at t=${engine.gameTime.toFixed(1)}`;
        const candidates = rasterizeArea({
            type: 'circle',
            x: nest.x,
            y: nest.y,
            radiusPx: THORN_PULSE_RADIUS,
        });
        const brambleCells = candidates.filter(({ col, row }) => {
            const effect = engine.terrainLayers.getGroundEffectAt(col, row);
            return effect?.effectType === 'bramble_slow';
        });
        return `brambleCells=${brambleCells.length} t=${engine.gameTime.toFixed(1)}`;
    },

    describeState(engine) {
        const nest = engine.getUnit('thorn_spread_nest');
        if (!nest) return `t=${engine.gameTime.toFixed(1)} nest=missing`;
        const candidates = rasterizeArea({
            type: 'circle',
            x: nest.x,
            y: nest.y,
            radiusPx: THORN_PULSE_RADIUS,
        });
        const brambleCells = candidates.filter(({ col, row }) => {
            const effect = engine.terrainLayers.getGroundEffectAt(col, row);
            return effect?.effectType === 'bramble_slow';
        });
        return `t=${engine.gameTime.toFixed(1)} brambleCells=${brambleCells.length}`;
    },
};
