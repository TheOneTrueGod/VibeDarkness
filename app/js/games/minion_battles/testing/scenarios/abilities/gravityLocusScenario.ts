/**
 * Gravity Locus (0901) — push nudge preserves enemy windup; pull mode draws inward.
 *
 * Two-beat pattern: push cast at tick 0, pull cast queued after the first field expires.
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
    GRAVITY_LOCUS_ACTIVE_DURATION,
    GRAVITY_LOCUS_GRAVITY_COST,
    GRAVITY_LOCUS_PREFIRE_TIME,
} from '../../../card_defs/09_gravity_core/gravityConstants';

const P = TINY_BATTLE_PLAYER_ID;
const GRAVITY_LOCUS_ID = '0901';
const WINDUP_ABILITY_ID = 'windup_probe';

const PLAYER_POS = { x: 3 * CELL_SIZE + CELL_SIZE / 2, y: 3 * CELL_SIZE + CELL_SIZE / 2 };
const LOCUS_POS = { x: 7 * CELL_SIZE + CELL_SIZE / 2, y: 3 * CELL_SIZE + CELL_SIZE / 2 };
/** Inside the locus field — push repels left (decreasing x). */
const ENEMY_START_X = LOCUS_POS.x - 30;

const PUSH_CHECK_END_SECONDS = GRAVITY_LOCUS_PREFIRE_TIME + 0.6;
/** Pull queued while the first field is still active so the enemy remains inside field radius. */
const SECOND_LOCUS_TICK = Math.ceil((GRAVITY_LOCUS_PREFIRE_TIME + 0.45) * 60);
const PULL_CHECK_START_SECONDS = GRAVITY_LOCUS_PREFIRE_TIME + GRAVITY_LOCUS_ACTIVE_DURATION + 1.5;

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

        const enemy = createTargetDummyAtWorld(engine, ENEMY_START_X, LOCUS_POS.y, {
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

        engine.state.orderMgr.queueOrder(SECOND_LOCUS_TICK, {
            unitId: player.id,
            abilityId: GRAVITY_LOCUS_ID,
            abilityMode: GRAVITY_ABILITY_MODE_PULL,
            targets: [{ type: 'pixel', position: LOCUS_POS }],
        });

        for (let tick = 90; tick <= 480; tick += 90) {
            engine.state.orderMgr.queueOrder(tick, { unitId: player.id, abilityId: 'wait', targets: [] });
        }

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{
            unitId: player.id,
            abilityId: GRAVITY_LOCUS_ID,
            targets: [{ type: 'pixel', position: LOCUS_POS }],
        }];
    },

    assertPass(engine) {
        const enemy = engine.getUnit('locus_enemy');
        if (!enemy) return false;

        if (engine.gameTime < PUSH_CHECK_END_SECONDS) {
            const windupIntact = enemy.activeAbilities.some((a) => a.abilityId === WINDUP_ABILITY_ID);
            if (!windupIntact) return false;
            return enemy.x < ENEMY_START_X - 2;
        }

        if (engine.gameTime < PULL_CHECK_START_SECONDS) return false;

        const distToLocus = Math.hypot(enemy.x - LOCUS_POS.x, enemy.y - LOCUS_POS.y);
        return distToLocus < 6;
    },

    failureMessage(engine) {
        const enemy = engine.getUnit('locus_enemy');
        const windup = enemy?.activeAbilities.some((a) => a.abilityId === WINDUP_ABILITY_ID);
        const dist = enemy ? Math.hypot(enemy.x - LOCUS_POS.x, enemy.y - LOCUS_POS.y) : -1;
        const phase = engine.gameTime < PUSH_CHECK_END_SECONDS
            ? 'push'
            : engine.gameTime < PULL_CHECK_START_SECONDS
                ? 'pull-cast'
                : 'pull-landed';
        return [
            `t=${engine.gameTime.toFixed(2)}s phase=${phase}`,
            `enemy.x=${enemy?.x ?? '?'} start=${ENEMY_START_X}`,
            `windup=${windup}`,
            `distToLocus=${dist?.toFixed(1)}`,
        ].join('; ');
    },
};
