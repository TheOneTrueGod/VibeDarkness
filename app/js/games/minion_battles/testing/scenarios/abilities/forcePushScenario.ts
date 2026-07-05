/**
 * Force Push (0902) — collision damage via forced-movement events.
 *
 * Beat 1: flung enemy strikes a second enemy (both damaged).
 * Beat 2: flung enemy rebounds off terrain (flung unit damaged).
 */

import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createTargetDummyAtWorld } from '../../fixtures/targetDummies';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import { Gravity } from '../../../resources/Gravity';
import { TerrainType } from '../../../terrain/TerrainType';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';
import {
    FORCE_PUSH_COLLISION_DAMAGE,
    FORCE_PUSH_COOLDOWN_DURATION,
    FORCE_PUSH_GRAVITY_COST,
    FORCE_PUSH_PREFIRE_TIME,
    FORCE_PUSH_TERRAIN_DAMAGE,
} from '../../../card_defs/09_gravity_core/gravityConstants';

const P = TINY_BATTLE_PLAYER_ID;
const FORCE_PUSH_ID = '0902';

const SHARED_Y = 3 * CELL_SIZE + CELL_SIZE / 2;
/** Centered on the grid — avoids west-edge terrain clips from `0902Ability.test.ts` coords. */
const PLAYER_X = 3 * CELL_SIZE + CELL_SIZE / 2;
const FLING_X = PLAYER_X + 100;
/** Edge-to-edge contact at launch so the first knockback segment hits the blocker. */
const BLOCKER_X = FLING_X + DEFAULT_UNIT_RADIUS * 2 - 2;
const WALL_FLING_Y = 5 * CELL_SIZE + CELL_SIZE / 2;
const WALL_FLING_X = 4 * CELL_SIZE + CELL_SIZE / 2;
const ROCK_COL = 7;
const ROCK_ROW = 5;

const TOTAL_CAST_SECONDS = FORCE_PUSH_PREFIRE_TIME + FORCE_PUSH_COOLDOWN_DURATION + 0.35;
const SECOND_PUSH_TICK = Math.ceil(TOTAL_CAST_SECONDS * 60) + 30;

export const forcePushScenario: ScenarioDefinition = {
    id: 'force_push_collision_e2e',
    title: 'Force Push (0902): unit collision damages both; wall bounce damages flung unit',
    category: 'ability',
    maxDurationMs: 8000,

    buildEngine() {
        const engine = buildTinyBattleEngine({
            gridW: 14,
            gridH: 8,
            localPlayerId: P,
            grass: true,
        });

        const terrain = engine.terrainManager;
        if (!terrain) throw new Error('force_push_collision_e2e requires terrain');
        terrain.grid.set(ROCK_COL, ROCK_ROW, TerrainType.Rock);

        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: PLAYER_X,
            y: SHARED_Y,
            abilities: [FORCE_PUSH_ID],
        });
        const gravity = new Gravity();
        player.attachResource(gravity, engine.eventBus);
        gravity.add(FORCE_PUSH_GRAVITY_COST * 2 + 10);

        const collisionFling = createTargetDummyAtWorld(engine, FLING_X, SHARED_Y, {
            id: 'collision_fling',
            hp: 100,
        });
        const collisionBlocker = createTargetDummyAtWorld(engine, BLOCKER_X, SHARED_Y, {
            id: 'collision_blocker',
            hp: 100,
        });
        const wallFling = createTargetDummyAtWorld(engine, WALL_FLING_X, WALL_FLING_Y, {
            id: 'wall_fling',
            hp: 100,
        });
        for (const unit of [collisionFling, collisionBlocker, wallFling]) {
            unit.radius = DEFAULT_UNIT_RADIUS;
            initializeAbilityRuntimeForUnit(unit);
            engine.addUnit(unit, 'initialGameSpawn');
        }

        engine.state.orderMgr.queueOrder(SECOND_PUSH_TICK, {
            unitId: player.id,
            abilityId: FORCE_PUSH_ID,
            targets: [{ type: 'unit', unitId: wallFling.id }],
        });

        for (let tick = 90; tick <= 480; tick += 90) {
            engine.state.orderMgr.queueOrder(tick, { unitId: player.id, abilityId: 'wait', targets: [] });
        }

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        const fling = engine.getUnit('collision_fling')!;
        return [{
            unitId: player.id,
            abilityId: FORCE_PUSH_ID,
            targets: [{ type: 'unit', unitId: fling.id }],
        }];
    },

    assertPass(engine) {
        const collisionFling = engine.getUnit('collision_fling');
        const collisionBlocker = engine.getUnit('collision_blocker');
        const wallFling = engine.getUnit('wall_fling');
        if (!collisionFling || !collisionBlocker || !wallFling) return false;

        const flingCollisionLoss = collisionFling.maxHp - collisionFling.hp;
        const blockerLoss = collisionBlocker.maxHp - collisionBlocker.hp;
        const wallFlingLoss = wallFling.maxHp - wallFling.hp;

        if (engine.gameTime < TOTAL_CAST_SECONDS) {
            return (
                flingCollisionLoss >= FORCE_PUSH_COLLISION_DAMAGE
                && blockerLoss >= FORCE_PUSH_COLLISION_DAMAGE
            );
        }

        return (
            flingCollisionLoss >= FORCE_PUSH_COLLISION_DAMAGE
            && blockerLoss >= FORCE_PUSH_COLLISION_DAMAGE
            && wallFlingLoss >= FORCE_PUSH_TERRAIN_DAMAGE
        );
    },

    failureMessage(engine) {
        const collisionFling = engine.getUnit('collision_fling');
        const collisionBlocker = engine.getUnit('collision_blocker');
        const wallFling = engine.getUnit('wall_fling');
        return [
            `t=${engine.gameTime.toFixed(2)}s`,
            `collision_fling lost ${collisionFling ? collisionFling.maxHp - collisionFling.hp : '?'} (expected ≥${FORCE_PUSH_COLLISION_DAMAGE})`,
            `collision_blocker lost ${collisionBlocker ? collisionBlocker.maxHp - collisionBlocker.hp : '?'} (expected ≥${FORCE_PUSH_COLLISION_DAMAGE})`,
            `wall_fling lost ${wallFling ? wallFling.maxHp - wallFling.hp : '?'} (expected ≥${FORCE_PUSH_TERRAIN_DAMAGE})`,
        ].join('; ');
    },
};
