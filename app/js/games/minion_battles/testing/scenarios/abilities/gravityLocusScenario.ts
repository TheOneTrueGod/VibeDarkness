/**
 * Gravity Locus (0901) — push nudge preserves enemy windup; pull mode draws inward.
 *
 * Two-beat pattern: a push cast at tick 0 shoves the enemy out of the first field,
 * then a pull cast (after the ~1s cast lock ends) captures the pushed position and
 * draws the enemy to the second locus. The pull locus is placed so it can only
 * capture the enemy if the push actually moved it — the final assert covers both
 * beats plus the never-interrupted windup.
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
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import {
    GRAVITY_ABILITY_MODE_PULL,
    GRAVITY_LOCUS_GRAVITY_COST,
    GRAVITY_LOCUS_PREFIRE_TIME,
} from '../../../card_defs/09_gravity_core/gravityConstants';

const P = TINY_BATTLE_PLAYER_ID;
const GRAVITY_LOCUS_ID = '0901';
const WINDUP_ABILITY_ID = 'windup_probe';

const PLAYER_POS = { x: 3 * CELL_SIZE + CELL_SIZE / 2, y: 3 * CELL_SIZE + CELL_SIZE / 2 };
const PUSH_LOCUS_POS = { x: 7 * CELL_SIZE + CELL_SIZE / 2, y: 3 * CELL_SIZE + CELL_SIZE / 2 };
/** Inside the push field — push repels left (decreasing x). */
const ENEMY_START_X = PUSH_LOCUS_POS.x - 30;
/**
 * Within field radius (82.5) of the enemy's pushed-out resting spot (~locus - 86),
 * but OUT of range of ENEMY_START_X — the pull can only land if the push happened.
 */
const PULL_LOCUS_POS = { x: 4 * CELL_SIZE + CELL_SIZE / 2, y: 3 * CELL_SIZE + CELL_SIZE / 2 };

/** Cast lock is ~1s; queue the pull just after the player is free again. */
const PULL_CAST_TICK = Math.ceil(1.1 * 60);
/** Pull field deploys at cast + prefire; ~3 pulses later the enemy sits on the locus. */
const FINAL_CHECK_START_SECONDS = PULL_CAST_TICK / 60 + GRAVITY_LOCUS_PREFIRE_TIME + 1.2;

export const gravityLocusScenario: ScenarioDefinition = {
    id: 'gravity_locus_push_pull_e2e',
    title: 'Gravity Locus (0901): push repels without interrupting windup; pull draws inward',
    category: 'ability',
    maxDurationMs: 8000,

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
            abilities: [GRAVITY_LOCUS_ID],
        });
        const gravity = new Gravity();
        player.attachResource(gravity, engine.eventBus);
        gravity.add(GRAVITY_LOCUS_GRAVITY_COST * 2 + 10);

        // Shipping maxUses is 1 (recovered per round); grant a second use so one
        // battle can exercise both modes without waiting for round recovery.
        const locusRuntime = player.abilityRuntime[GRAVITY_LOCUS_ID];
        if (locusRuntime) {
            locusRuntime.maxUses = 2;
            locusRuntime.currentUses = 2;
        }

        const enemy = createTargetDummyAtWorld(engine, ENEMY_START_X, PUSH_LOCUS_POS.y, {
            id: 'locus_enemy',
            hp: 100,
        });
        enemy.activeAbilities = [{
            abilityId: WINDUP_ABILITY_ID,
            startTime: 0,
            targets: [],
            fired: false,
        }];
        initializeAbilityRuntimeForUnit(enemy);
        engine.addUnit(enemy, 'initialGameSpawn');

        engine.state.orderMgr.queueOrder(PULL_CAST_TICK, {
            unitId: player.id,
            abilityId: GRAVITY_LOCUS_ID,
            abilityMode: GRAVITY_ABILITY_MODE_PULL,
            targets: [{ type: 'pixel', position: PULL_LOCUS_POS }],
        });

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{
            unitId: player.id,
            abilityId: GRAVITY_LOCUS_ID,
            targets: [{ type: 'pixel', position: PUSH_LOCUS_POS }],
        }];
    },

    assertPass(engine) {
        if (engine.gameTime < FINAL_CHECK_START_SECONDS) return false;

        const enemy = engine.getUnit('locus_enemy');
        if (!enemy) return false;

        // Nudges never interrupt: the probe windup must have survived both fields.
        const windupIntact = enemy.activeAbilities.some((a) => a.abilityId === WINDUP_ABILITY_ID);
        if (!windupIntact) return false;

        // Landing on the pull locus requires the push beat first (start pos is out of
        // the pull field's reach) and then the pull drawing the enemy to the center.
        const distToPullLocus = Math.hypot(enemy.x - PULL_LOCUS_POS.x, enemy.y - PULL_LOCUS_POS.y);
        return distToPullLocus < 6;
    },

    failureMessage(engine) {
        const enemy = engine.getUnit('locus_enemy');
        const windup = enemy?.activeAbilities.some((a) => a.abilityId === WINDUP_ABILITY_ID);
        const dist = enemy ? Math.hypot(enemy.x - PULL_LOCUS_POS.x, enemy.y - PULL_LOCUS_POS.y) : -1;
        return [
            `t=${engine.gameTime.toFixed(2)}s (final check from ${FINAL_CHECK_START_SECONDS.toFixed(2)}s)`,
            `enemy.x=${enemy?.x?.toFixed(1) ?? '?'} start=${ENEMY_START_X}`,
            `windup=${windup}`,
            `distToPullLocus=${dist?.toFixed(1)} (expected <6)`,
        ].join('; ');
    },
};
