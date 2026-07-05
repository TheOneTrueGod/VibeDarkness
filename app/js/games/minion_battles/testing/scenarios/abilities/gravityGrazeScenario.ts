/**
 * Gravity resource grazing — end-to-end Resource.onTick wiring.
 *
 * Three grazers run in parallel: isolated (floor rate), near enemy (unit max rate),
 * near enemy projectile (higher projectile rate). All wait so the battle stays active.
 */

import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { createTargetDummyAtWorld } from '../../fixtures/targetDummies';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import { Gravity } from '../../../resources/Gravity';
import { Projectile } from '../../../game/projectiles/Projectile';
import { DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';
import { ROUND_DURATION } from '../../../game/gameConstants';
import {
    GRAVITY_GRAZE_MAX_DISTANCE,
    GRAVITY_GRAZE_MIN_DISTANCE,
    GRAVITY_MAX_PER_ROUND_UNITS,
    GRAVITY_MIN_PER_ROUND,
} from '../../../card_defs/09_gravity_core/gravityConstants';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;
const PROJECTILE_RADIUS = 5;
const GRAZE_SAMPLE_SECONDS = ROUND_DURATION;
const GRAZE_WAIT_REQUEUE_TICK = 90;
const GRAZE_WAIT_LAST_TICK = 720;

const ISOLATED_POS = { x: 1 * CELL + CELL / 2, y: 2 * CELL + CELL / 2 };
const ENEMY_GRAZER_POS = { x: 10 * CELL + CELL / 2, y: 4 * CELL + CELL / 2 };
const PROJ_GRAZER_POS = { x: 10 * CELL + CELL / 2, y: 6 * CELL + CELL / 2 };

function edgeToEdgeCenterDist(grazerRadius: number, targetRadius: number): number {
    return GRAVITY_GRAZE_MIN_DISTANCE + grazerRadius + targetRadius;
}

function attachGravity(
    unit: ReturnType<typeof createUnitFromSpawnConfig>,
    engine: ReturnType<typeof buildTinyBattleEngine>,
): void {
    const gravity = new Gravity();
    unit.attachResource(gravity, engine.eventBus);
}

function spawnGrazer(
    engine: ReturnType<typeof buildTinyBattleEngine>,
    id: string,
    x: number,
    y: number,
): ReturnType<typeof createUnitFromSpawnConfig> {
    const unit = createUnitFromSpawnConfig(
        {
            id,
            characterId: 'player',
            name: id,
            x,
            y,
            teamId: 'player',
            ownerId: P,
            abilities: [],
            unitAITreeId: 'static_test_no_ai',
            radius: DEFAULT_UNIT_RADIUS,
        },
        engine.eventBus,
        engine,
    );
    attachGravity(unit, engine);
    initializeAbilityRuntimeForUnit(unit);
    engine.addUnit(unit, 'initialGameSpawn');
    return unit;
}

export const gravityGrazeScenario: ScenarioDefinition = {
    id: 'gravity_graze_e2e',
    title: 'Gravity graze: enemy and projectile fill faster than isolated',
    category: 'ability',
    maxDurationMs: 12000,

    buildEngine() {
        const engine = buildTinyBattleEngine({
            gridW: 14,
            gridH: 10,
            localPlayerId: P,
            grass: true,
        });

        spawnGrazer(engine, 'isolated_grazer', ISOLATED_POS.x, ISOLATED_POS.y);
        spawnGrazer(engine, 'enemy_grazer', ENEMY_GRAZER_POS.x, ENEMY_GRAZER_POS.y);
        spawnGrazer(engine, 'proj_grazer', PROJ_GRAZER_POS.x, PROJ_GRAZER_POS.y);

        const farCenterDist = GRAVITY_GRAZE_MAX_DISTANCE + DEFAULT_UNIT_RADIUS * 2 + 80;
        const farDummy = createTargetDummyAtWorld(
            engine,
            ISOLATED_POS.x + farCenterDist,
            ISOLATED_POS.y,
            { id: 'far_enemy', hp: 100 },
        );
        initializeAbilityRuntimeForUnit(farDummy);
        engine.addUnit(farDummy, 'initialGameSpawn');

        const closeCenterDist = edgeToEdgeCenterDist(DEFAULT_UNIT_RADIUS, DEFAULT_UNIT_RADIUS);
        const closeDummy = createTargetDummyAtWorld(
            engine,
            ENEMY_GRAZER_POS.x + closeCenterDist,
            ENEMY_GRAZER_POS.y,
            { id: 'close_enemy', hp: 100 },
        );
        initializeAbilityRuntimeForUnit(closeDummy);
        engine.addUnit(closeDummy, 'initialGameSpawn');

        const projCenterDist = edgeToEdgeCenterDist(DEFAULT_UNIT_RADIUS, PROJECTILE_RADIUS);
        engine.addProjectile(new Projectile({
            x: PROJ_GRAZER_POS.x + projCenterDist,
            y: PROJ_GRAZER_POS.y,
            velocityX: 0,
            velocityY: 0,
            damage: 0,
            sourceTeamId: 'enemy',
            sourceUnitId: 'close_enemy',
            sourceAbilityId: '0001',
            maxDistance: 10_000,
            passThroughEnemies: true,
        }));

        for (let tick = GRAZE_WAIT_REQUEUE_TICK; tick <= GRAZE_WAIT_LAST_TICK; tick += GRAZE_WAIT_REQUEUE_TICK) {
            for (const unitId of ['isolated_grazer', 'enemy_grazer', 'proj_grazer'] as const) {
                engine.state.orderMgr.queueOrder(tick, { unitId, abilityId: 'wait', targets: [] });
            }
        }

        return engine;
    },

    getInitialOrders(_engine) {
        return [
            { unitId: 'isolated_grazer', abilityId: 'wait', targets: [] },
            { unitId: 'enemy_grazer', abilityId: 'wait', targets: [] },
            { unitId: 'proj_grazer', abilityId: 'wait', targets: [] },
        ];
    },

    assertPass(engine) {
        if (engine.gameTime < GRAZE_SAMPLE_SECONDS) return false;

        const isolated = engine.getUnit('isolated_grazer')?.getResource('gravity');
        const enemyGrazer = engine.getUnit('enemy_grazer')?.getResource('gravity');
        const projGrazer = engine.getUnit('proj_grazer')?.getResource('gravity');
        if (!isolated || !enemyGrazer || !projGrazer) return false;

        const floorGain = isolated.current;
        const enemyGain = enemyGrazer.current;
        const projectileGain = projGrazer.current;

        const floorOnlyCeiling = GRAVITY_MIN_PER_ROUND * (GRAZE_SAMPLE_SECONDS / ROUND_DURATION) + 1;
        const enemyTierFloor = GRAVITY_MAX_PER_ROUND_UNITS * 0.4 * (GRAZE_SAMPLE_SECONDS / ROUND_DURATION);

        return (
            floorGain <= floorOnlyCeiling
            && enemyGain > floorGain + 3
            && enemyGain >= enemyTierFloor
            && projectileGain > enemyGain + 2
        );
    },

    failureMessage(engine) {
        const isolated = engine.getUnit('isolated_grazer')?.getResource('gravity')?.current ?? -1;
        const enemyGrazer = engine.getUnit('enemy_grazer')?.getResource('gravity')?.current ?? -1;
        const projGrazer = engine.getUnit('proj_grazer')?.getResource('gravity')?.current ?? -1;
        return [
            `t=${engine.gameTime.toFixed(2)}s`,
            `isolated=${isolated} (expected ≤${GRAVITY_MIN_PER_ROUND * (GRAZE_SAMPLE_SECONDS / ROUND_DURATION) + 1})`,
            `enemy=${enemyGrazer} (expected > isolated + 3, ≥${GRAVITY_MAX_PER_ROUND_UNITS * 0.4 * (GRAZE_SAMPLE_SECONDS / ROUND_DURATION)})`,
            `projectile=${projGrazer} (expected > enemy + 2)`,
        ].join('; ');
    },
};
