/**
 * Gravity Inversion (0903) — LiftedBuff hard CC + slam through the real order path.
 *
 * Beat 1: push mode locks the enemy during the float window then deals slam damage.
 * Beat 2: pull mode slams the enemy adjacent to the caster.
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
import { LIFTED_BUFF_TYPE } from '../../../buffs/LiftedBuff';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import {
    GRAVITY_ABILITY_MODE_PULL,
    GRAVITY_INVERSION_GRAVITY_COST,
    GRAVITY_INVERSION_LIFT_DURATION,
    GRAVITY_INVERSION_PREFIRE_TIME,
    GRAVITY_INVERSION_SLAM_DAMAGE,
} from '../../../card_defs/09_gravity_core/gravityConstants';

const P = TINY_BATTLE_PLAYER_ID;
const GRAVITY_INVERSION_ID = '0903';

const PLAYER_POS = { x: 2 * CELL_SIZE + CELL_SIZE / 2, y: 3 * CELL_SIZE + CELL_SIZE / 2 };
const PUSH_TARGET_POS = { x: 6 * CELL_SIZE + CELL_SIZE / 2, y: 3 * CELL_SIZE + CELL_SIZE / 2 };
const PULL_TARGET_POS = { x: 6 * CELL_SIZE + CELL_SIZE / 2, y: 5 * CELL_SIZE + CELL_SIZE / 2 };

const LIFT_CHECK_START = GRAVITY_INVERSION_PREFIRE_TIME + 0.05;
const LIFT_CHECK_END = GRAVITY_INVERSION_PREFIRE_TIME + GRAVITY_INVERSION_LIFT_DURATION - 0.05;
const FIRST_SLAM_END = GRAVITY_INVERSION_PREFIRE_TIME + GRAVITY_INVERSION_LIFT_DURATION + 0.15;
const SECOND_INVERSION_TICK = Math.ceil((GRAVITY_INVERSION_PREFIRE_TIME + GRAVITY_INVERSION_LIFT_DURATION + 1.6) * 60);
const PULL_LANDING_MAX_DIST = 30;

export const gravityInversionScenario: ScenarioDefinition = {
    id: 'gravity_inversion_lift_slam_e2e',
    title: 'Gravity Inversion (0903): lift locks action; pull slam lands at caster feet',
    category: 'ability',
    maxDurationMs: 10000,

    buildEngine() {
        const engine = buildTinyBattleEngine({
            gridW: 12,
            gridH: 8,
            localPlayerId: P,
            grass: true,
        });

        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: PLAYER_POS.x,
            y: PLAYER_POS.y,
            abilities: [GRAVITY_INVERSION_ID],
        });
        const gravity = new Gravity();
        player.attachResource(gravity, engine.eventBus);
        gravity.add(GRAVITY_INVERSION_GRAVITY_COST * 2 + 10);

        const pushVictim = createTargetDummyAtWorld(engine, PUSH_TARGET_POS.x, PUSH_TARGET_POS.y, {
            id: 'push_victim',
            hp: 100,
        });
        const pullVictim = createTargetDummyAtWorld(engine, PULL_TARGET_POS.x, PULL_TARGET_POS.y, {
            id: 'pull_victim',
            hp: 100,
        });
        for (const unit of [pushVictim, pullVictim]) {
            initializeAbilityRuntimeForUnit(unit);
            engine.addUnit(unit, 'initialGameSpawn');
        }

        engine.state.orderMgr.queueOrder(SECOND_INVERSION_TICK, {
            unitId: player.id,
            abilityId: GRAVITY_INVERSION_ID,
            abilityMode: GRAVITY_ABILITY_MODE_PULL,
            targets: [{ type: 'pixel', position: PULL_TARGET_POS }],
        });

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{
            unitId: player.id,
            abilityId: GRAVITY_INVERSION_ID,
            targets: [{ type: 'pixel', position: PUSH_TARGET_POS }],
        }];
    },

    assertPass(engine) {
        const pushVictim = engine.getUnit('push_victim');
        const pullVictim = engine.getUnit('pull_victim');
        const player = engine.getLocalPlayerUnit();
        if (!pushVictim || !pullVictim || !player) return false;

        if (engine.gameTime >= LIFT_CHECK_START && engine.gameTime <= LIFT_CHECK_END) {
            return pushVictim.hasBuff(LIFTED_BUFF_TYPE) && !pushVictim.canAct();
        }

        if (engine.gameTime < FIRST_SLAM_END) return false;

        const pushSlammed = pushVictim.maxHp - pushVictim.hp >= GRAVITY_INVERSION_SLAM_DAMAGE;
        if (!pushSlammed) return false;

        if (engine.gameTime < SECOND_INVERSION_TICK / 60 + GRAVITY_INVERSION_PREFIRE_TIME + GRAVITY_INVERSION_LIFT_DURATION) {
            return false;
        }

        const pullSlammed = pullVictim.maxHp - pullVictim.hp >= GRAVITY_INVERSION_SLAM_DAMAGE;
        const pullDist = Math.hypot(pullVictim.x - player.x, pullVictim.y - player.y);
        return pullSlammed && pullDist < PULL_LANDING_MAX_DIST;
    },

    failureMessage(engine) {
        const pushVictim = engine.getUnit('push_victim');
        const pullVictim = engine.getUnit('pull_victim');
        const player = engine.getLocalPlayerUnit();
        const pushLoss = pushVictim ? pushVictim.maxHp - pushVictim.hp : -1;
        const pullLoss = pullVictim ? pullVictim.maxHp - pullVictim.hp : -1;
        const pullDist = pullVictim && player
            ? Math.hypot(pullVictim.x - player.x, pullVictim.y - player.y)
            : -1;
        return [
            `t=${engine.gameTime.toFixed(2)}s`,
            `push lifted=${pushVictim?.hasBuff(LIFTED_BUFF_TYPE)} canAct=${pushVictim?.canAct()}`,
            `push lost ${pushLoss} (expected ≥${GRAVITY_INVERSION_SLAM_DAMAGE})`,
            `pull lost ${pullLoss} (expected ≥${GRAVITY_INVERSION_SLAM_DAMAGE})`,
            `pull dist=${pullDist?.toFixed(1)} (expected <${PULL_LANDING_MAX_DIST})`,
        ].join('; ');
    },
};
