/**
 * DarknessStrength E2E scenarios (starter packages).
 *
 * Scenario A — ds_enemy_hardened_raises_enemy_hp:
 *   Force-enable `ds_enemy_hardened`, spawn a control enemy then a hardened spawn;
 *   assert max HP rose by the package mult (not a brittle absolute HP literal).
 *
 * Scenario B — ds_swarm_reinforcements_over_rounds:
 *   Activate `ds_swarm_reinforcements`; after several round starts, living swarmling
 *   count has increased vs the round-0 baseline on a tiny map.
 */

import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { installDarknessStrengthsForTest } from '../../harness/installDarknessStrengths';
import {
    DS_ENEMY_HARDENED_ID,
    DS_ENEMY_HARDENED_MAX_HEALTH_MULT,
    DS_SWARM_REINFORCEMENTS_CHARACTER_ID,
    DS_SWARM_REINFORCEMENTS_COUNT,
    DS_SWARM_REINFORCEMENTS_ID,
} from '../../../../../darknessStrength/packages/starters';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;

const CONTROL_ENEMY_ID = 'ds_hardened_control';
const HARDENED_ENEMY_ID = 'ds_hardened_buffed';
const HARDENED_CHARACTER_ID = 'swarmling';

const SWARM_ROUNDS_TARGET = 2;
/** Living swarmlings expected after `SWARM_ROUNDS_TARGET` round starts. */
const SWARM_EXPECTED_MIN =
    SWARM_ROUNDS_TARGET * DS_SWARM_REINFORCEMENTS_COUNT;

// ============================================================================
// Scenario A — ds_enemy_hardened_raises_enemy_hp
// ============================================================================

export const dsEnemyHardenedRaisesEnemyHpScenario: ScenarioDefinition = {
    id: 'ds_enemy_hardened_raises_enemy_hp',
    title: 'DarknessStrength: force-active hardened raises enemy max HP',
    category: 'general',
    generalSection: 'Darkness Strength',
    maxDurationMs: 2000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 8, gridH: 6, localPlayerId: P });
        spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: 2 * CELL + CELL / 2,
            y: 3 * CELL + CELL / 2,
            abilities: [],
        });

        // Baseline spawn before packages are active.
        engine.spawnUnit({
            unitId: CONTROL_ENEMY_ID,
            characterId: HARDENED_CHARACTER_ID,
            name: 'Control',
            teamId: 'enemy',
            ownerId: 'ai',
            abilities: [],
            placement: { kind: 'fixedWorld', x: 5 * CELL + CELL / 2, y: 2 * CELL + CELL / 2 },
        });

        installDarknessStrengthsForTest(engine, {
            instances: [],
            overrides: { [DS_ENEMY_HARDENED_ID]: { enabled: true } },
        });

        engine.spawnUnit({
            unitId: HARDENED_ENEMY_ID,
            characterId: HARDENED_CHARACTER_ID,
            name: 'Hardened',
            teamId: 'enemy',
            ownerId: 'ai',
            abilities: [],
            placement: { kind: 'fixedWorld', x: 5 * CELL + CELL / 2, y: 4 * CELL + CELL / 2 },
        });

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{ unitId: player.id, abilityId: 'wait', targets: [] }];
    },

    assertPass(engine) {
        const control = engine.getUnit(CONTROL_ENEMY_ID);
        const hardened = engine.getUnit(HARDENED_ENEMY_ID);
        if (!control || !hardened) return false;
        if (!(hardened.maxHp > control.maxHp)) return false;
        const expected = Math.floor(control.maxHp * DS_ENEMY_HARDENED_MAX_HEALTH_MULT);
        return hardened.maxHp === expected;
    },

    failureMessage(engine) {
        const control = engine.getUnit(CONTROL_ENEMY_ID);
        const hardened = engine.getUnit(HARDENED_ENEMY_ID);
        const expected =
            control != null ? Math.floor(control.maxHp * DS_ENEMY_HARDENED_MAX_HEALTH_MULT) : 'n/a';
        return (
            `control.maxHp=${control?.maxHp ?? 'missing'} hardened.maxHp=${hardened?.maxHp ?? 'missing'}` +
            ` expected=${expected} mult=${DS_ENEMY_HARDENED_MAX_HEALTH_MULT}`
        );
    },
};

// ============================================================================
// Scenario B — ds_swarm_reinforcements_over_rounds
// ============================================================================

function countLivingSwarmlings(engine: { units: readonly { characterId: string; isAlive(): boolean }[] }): number {
    return engine.units.filter(
        (u) => u.characterId === DS_SWARM_REINFORCEMENTS_CHARACTER_ID && u.isAlive(),
    ).length;
}

export const dsSwarmReinforcementsOverRoundsScenario: ScenarioDefinition = {
    id: 'ds_swarm_reinforcements_over_rounds',
    title: 'DarknessStrength: swarm reinforcements increase living swarmlings over rounds',
    category: 'general',
    generalSection: 'Darkness Strength',
    // 2 round starts: immediate round 1 + round 2 after ROUND_DURATION (10s). Budget with margin.
    maxDurationMs: 15000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 10, gridH: 8, localPlayerId: P });
        installDarknessStrengthsForTest(engine, {
            instances: [{ packageId: DS_SWARM_REINFORCEMENTS_ID }],
        });

        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: 5 * CELL + CELL / 2,
            y: 4 * CELL + CELL / 2,
            abilities: [],
        });

        // Keep the runner non-idle across ~2 round boundaries (see worldModifierMidBattleAdd).
        for (let tick = 90; tick <= 900; tick += 90) {
            engine.state.orderMgr.queueOrder(tick, { unitId: player.id, abilityId: 'wait', targets: [] });
        }

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{ unitId: player.id, abilityId: 'wait', targets: [] }];
    },

    assertPass(engine) {
        // Round-0 baseline is 0 (no initial swarmlings). After several round starts, count rises.
        return countLivingSwarmlings(engine) >= SWARM_EXPECTED_MIN;
    },

    failureMessage(engine) {
        return (
            `living swarmlings=${countLivingSwarmlings(engine)}` +
            ` (expected >= ${SWARM_EXPECTED_MIN})` +
            ` | round=${engine.roundNumber}`
        );
    },
};
