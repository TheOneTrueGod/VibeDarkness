/**
 * Blood Mend (0301) committed-run E2E contract. See
 * `card_defs/03_blood_mage/AGENTS.md` for the Blood Mage design intent.
 *
 * Two independent casters/targets in the same engine (per the "one scenario per ability"
 * rule — combine beats rather than splitting into separate scenarios):
 *  - Caster A (healthy) casts on Ally A: proves the ordinary cost-before-heal math nets the
 *    expected -5/+20 HP deltas.
 *  - Caster B (hp=3, at/under the hpCost threshold) casts on Ally B: proves the
 *    `floorAtOne` gate still lets the cast through and clamps the caster at exactly 1 HP,
 *    rather than blocking the cast or dropping the caster to 0/negative.
 */

import type { ScenarioDefinition } from '../../types';
import { buildTinyBattleEngine, TINY_BATTLE_PLAYER_ID } from '../../harness/buildTinyBattleEngine';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import {
    BLOOD_MEND_ACTIVE_DURATION,
    BLOOD_MEND_HEAL_AMOUNT,
    BLOOD_MEND_HP_COST,
    BLOOD_MEND_WINDUP_DURATION,
    BloodMendAbility_0301,
} from '../../../card_defs/03_blood_mage/0301_BloodMend/0301Ability';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;
const BLOOD_MEND_ID = BloodMendAbility_0301.id;

const CASTER_A_POS = { x: 2 * CELL + CELL / 2, y: 2 * CELL + CELL / 2 };
const ALLY_A_POS = { x: 3 * CELL + CELL / 2, y: 2 * CELL + CELL / 2 };
const CASTER_B_POS = { x: 2 * CELL + CELL / 2, y: 5 * CELL + CELL / 2 };
const ALLY_B_POS = { x: 3 * CELL + CELL / 2, y: 5 * CELL + CELL / 2 };

const CASTER_A_START_HP = 100;
const ALLY_START_HP = 50;
const CASTER_B_START_HP = 3; // At/under hpCost(5) — exercises the floorAtOne clamp.

// gameTime by which both casts' active-frame cost+heal have landed.
const CHECK_TIME = BLOOD_MEND_WINDUP_DURATION + BLOOD_MEND_ACTIVE_DURATION + 0.1;

export const bloodMendScenario: ScenarioDefinition = {
    id: 'blood_mend_committed_e2e',
    title: 'Blood Mend (0301): cost-before-heal ordering and the floorAtOne clamp',
    category: 'ability',
    maxDurationMs: 3000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 8, gridH: 8, localPlayerId: P, grass: true });

        const casterA = createUnitFromSpawnConfig({
            id: 'blood_mend_caster_a', characterId: 'enemy_melee', name: 'Caster A',
            x: CASTER_A_POS.x, y: CASTER_A_POS.y, teamId: 'player', ownerId: 'ai',
            abilities: [BLOOD_MEND_ID], hp: CASTER_A_START_HP, unitAITreeId: 'static_test_no_ai',
        }, engine.eventBus);
        initializeAbilityRuntimeForUnit(casterA);
        engine.addUnit(casterA, 'initialGameSpawn');

        const allyA = createUnitFromSpawnConfig({
            id: 'blood_mend_ally_a', characterId: 'enemy_melee', name: 'Ally A',
            x: ALLY_A_POS.x, y: ALLY_A_POS.y, teamId: 'player', ownerId: 'ai',
            hp: 100, unitAITreeId: 'static_test_no_ai',
        }, engine.eventBus);
        allyA.hp = ALLY_START_HP; // Below max so the heal delta is directly observable.
        initializeAbilityRuntimeForUnit(allyA);
        engine.addUnit(allyA, 'initialGameSpawn');

        const casterB = createUnitFromSpawnConfig({
            id: 'blood_mend_caster_b', characterId: 'enemy_melee', name: 'Caster B',
            x: CASTER_B_POS.x, y: CASTER_B_POS.y, teamId: 'player', ownerId: 'ai',
            abilities: [BLOOD_MEND_ID], hp: CASTER_B_START_HP, unitAITreeId: 'static_test_no_ai',
        }, engine.eventBus);
        initializeAbilityRuntimeForUnit(casterB);
        engine.addUnit(casterB, 'initialGameSpawn');

        const allyB = createUnitFromSpawnConfig({
            id: 'blood_mend_ally_b', characterId: 'enemy_melee', name: 'Ally B',
            x: ALLY_B_POS.x, y: ALLY_B_POS.y, teamId: 'player', ownerId: 'ai',
            hp: 100, unitAITreeId: 'static_test_no_ai',
        }, engine.eventBus);
        allyB.hp = ALLY_START_HP;
        initializeAbilityRuntimeForUnit(allyB);
        engine.addUnit(allyB, 'initialGameSpawn');

        // Every other unit here is `ownerId:'ai'` (see file header). `LevelEventManager.runDefeatCheck`
        // fires defeat once no `teamId:'player'` unit is both alive AND `isPlayerControlled()`
        // (`ownerId !== 'ai'`) — without a real player-owned unit the battle is defeated on tick 1,
        // going terminal before `assertPass` ever gets a chance to run. This idle keep-alive unit
        // (never targeted, never ordered) is the same fix `techShieldScenarios`/`absorptionShieldScenario`
        // get for free via `spawnTinyPlayerUnit`.
        const keepAlivePlayer = createUnitFromSpawnConfig({
            id: 'blood_mend_keep_alive_player', characterId: 'enemy_melee', name: 'Keep-Alive Player',
            x: 0.5 * CELL, y: 0.5 * CELL, teamId: 'player', ownerId: P,
            hp: 100, unitAITreeId: 'static_test_no_ai',
        }, engine.eventBus);
        initializeAbilityRuntimeForUnit(keepAlivePlayer);
        engine.addUnit(keepAlivePlayer, 'initialGameSpawn');

        return engine;
    },

    getInitialOrders(engine) {
        const casterA = engine.getUnit('blood_mend_caster_a')!;
        const allyA = engine.getUnit('blood_mend_ally_a')!;
        const casterB = engine.getUnit('blood_mend_caster_b')!;
        const allyB = engine.getUnit('blood_mend_ally_b')!;
        return [
            { unitId: casterA.id, abilityId: BLOOD_MEND_ID, targets: [{ type: 'unit' as const, unitId: allyA.id }] },
            { unitId: casterB.id, abilityId: BLOOD_MEND_ID, targets: [{ type: 'unit' as const, unitId: allyB.id }] },
        ];
    },

    assertPass(engine) {
        if (engine.gameTime < CHECK_TIME) return false;

        const casterA = engine.getUnit('blood_mend_caster_a');
        const allyA = engine.getUnit('blood_mend_ally_a');
        const casterB = engine.getUnit('blood_mend_caster_b');
        const allyB = engine.getUnit('blood_mend_ally_b');
        if (!casterA || !allyA || !casterB || !allyB) return false;

        return (
            casterA.hp === CASTER_A_START_HP - BLOOD_MEND_HP_COST
            && allyA.hp === ALLY_START_HP + BLOOD_MEND_HEAL_AMOUNT
            && casterB.hp === 1
            && allyB.hp === ALLY_START_HP + BLOOD_MEND_HEAL_AMOUNT
        );
    },

    failureMessage(engine) {
        const casterA = engine.getUnit('blood_mend_caster_a');
        const allyA = engine.getUnit('blood_mend_ally_a');
        const casterB = engine.getUnit('blood_mend_caster_b');
        const allyB = engine.getUnit('blood_mend_ally_b');
        return [
            `t=${engine.gameTime.toFixed(2)}s`,
            `casterA hp=${casterA?.hp} (expected ${CASTER_A_START_HP - BLOOD_MEND_HP_COST})`,
            `allyA hp=${allyA?.hp} (expected ${ALLY_START_HP + BLOOD_MEND_HEAL_AMOUNT})`,
            `casterB hp=${casterB?.hp} (expected 1, floorAtOne clamp)`,
            `allyB hp=${allyB?.hp} (expected ${ALLY_START_HP + BLOOD_MEND_HEAL_AMOUNT})`,
        ].join('; ');
    },
};
