/**
 * Burst (0302) committed-run E2E contract. See `card_defs/03_blood_mage/AGENTS.md` for the
 * Blood Mage design intent.
 *
 * Single scenario combining both facets (per the "one scenario per ability" rule):
 *  - A caster with plenty of HP hits dummies inside the cone/range and leaves dummies outside
 *    the arc or beyond range untouched.
 *  - A second caster at/under the hpCost threshold is refused by the UI-facing affordability
 *    gate (`getAbilityDisabledReason`) — the same check `BattleAbilityBar` uses to disable the
 *    card, since the engine itself does not block a submitted cast (see `hpCostGate` docs).
 */

import type { ScenarioDefinition } from '../../types';
import { buildTinyBattleEngine, TINY_BATTLE_PLAYER_ID } from '../../harness/buildTinyBattleEngine';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import { getAbilityDisabledReason } from '../../../ui/components/abilityDisabledReason';
import {
    BURST_ACTIVE_DURATION,
    BURST_DAMAGE,
    BURST_HP_COST,
    BURST_RANGE,
    BURST_WINDUP_DURATION,
    BurstAbility_0302,
} from '../../../card_defs/03_blood_mage/0302_Burst/0302Ability';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;
const BURST_ID = BurstAbility_0302.id;

const CASTER_POS = { x: 5 * CELL + CELL / 2, y: 5 * CELL + CELL / 2 };
// On-axis (angle 0), well inside range — dead center of the 60 degree arc.
const IN_CONE_POS = { x: CASTER_POS.x + 150, y: CASTER_POS.y };
// 90 degrees off-axis, in range but well outside the 60 degree total arc.
const OUTSIDE_ANGLE_POS = { x: CASTER_POS.x, y: CASTER_POS.y + 150 };
// On-axis but beyond BURST_RANGE.
const OUTSIDE_RANGE_POS = { x: CASTER_POS.x + BURST_RANGE + 200, y: CASTER_POS.y };
const DUMMY_HP = 100;

const CHECK_TIME = BURST_WINDUP_DURATION + BURST_ACTIVE_DURATION + 0.1;

export const burstScenario: ScenarioDefinition = {
    id: 'burst_committed_e2e',
    title: 'Burst (0302): cone/range gating and the HP-cost affordability gate',
    category: 'ability',
    maxDurationMs: 3000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 18, gridH: 12, localPlayerId: P, grass: true });

        const caster = createUnitFromSpawnConfig({
            id: 'burst_caster', characterId: 'enemy_melee', name: 'Caster',
            x: CASTER_POS.x, y: CASTER_POS.y, teamId: 'player', ownerId: 'ai',
            abilities: [BURST_ID], hp: 100, unitAITreeId: 'static_test_no_ai',
        }, engine.eventBus);
        initializeAbilityRuntimeForUnit(caster);
        engine.addUnit(caster, 'initialGameSpawn');

        const inCone = createUnitFromSpawnConfig({
            id: 'burst_in_cone', characterId: 'enemy_melee', name: 'In Cone',
            x: IN_CONE_POS.x, y: IN_CONE_POS.y, teamId: 'enemy', ownerId: 'ai',
            hp: DUMMY_HP, unitAITreeId: 'static_test_no_ai',
        }, engine.eventBus);
        initializeAbilityRuntimeForUnit(inCone);
        engine.addUnit(inCone, 'initialGameSpawn');

        const outsideAngle = createUnitFromSpawnConfig({
            id: 'burst_outside_angle', characterId: 'enemy_melee', name: 'Outside Angle',
            x: OUTSIDE_ANGLE_POS.x, y: OUTSIDE_ANGLE_POS.y, teamId: 'enemy', ownerId: 'ai',
            hp: DUMMY_HP, unitAITreeId: 'static_test_no_ai',
        }, engine.eventBus);
        initializeAbilityRuntimeForUnit(outsideAngle);
        engine.addUnit(outsideAngle, 'initialGameSpawn');

        const outsideRange = createUnitFromSpawnConfig({
            id: 'burst_outside_range', characterId: 'enemy_melee', name: 'Outside Range',
            x: OUTSIDE_RANGE_POS.x, y: OUTSIDE_RANGE_POS.y, teamId: 'enemy', ownerId: 'ai',
            hp: DUMMY_HP, unitAITreeId: 'static_test_no_ai',
        }, engine.eventBus);
        initializeAbilityRuntimeForUnit(outsideRange);
        engine.addUnit(outsideRange, 'initialGameSpawn');

        // Never acts — only used to check the disabled-reason gate below the hpCost threshold.
        const lowHpCaster = createUnitFromSpawnConfig({
            id: 'burst_low_hp_caster', characterId: 'enemy_melee', name: 'Low HP Caster',
            x: CASTER_POS.x, y: CASTER_POS.y - 200, teamId: 'player', ownerId: 'ai',
            abilities: [BURST_ID], hp: BURST_HP_COST, unitAITreeId: 'static_test_no_ai',
        }, engine.eventBus);
        initializeAbilityRuntimeForUnit(lowHpCaster);
        engine.addUnit(lowHpCaster, 'initialGameSpawn');

        // Every other unit here is `ownerId:'ai'` (see file header). `LevelEventManager.runDefeatCheck`
        // fires defeat once no `teamId:'player'` unit is both alive AND `isPlayerControlled()`
        // (`ownerId !== 'ai'`) — without a real player-owned unit the battle is defeated on tick 1,
        // going terminal before `assertPass` ever gets a chance to run. This idle keep-alive unit
        // (never targeted, never ordered) is the same fix `techShieldScenarios`/`absorptionShieldScenario`
        // get for free via `spawnTinyPlayerUnit`.
        const keepAlivePlayer = createUnitFromSpawnConfig({
            id: 'burst_keep_alive_player', characterId: 'enemy_melee', name: 'Keep-Alive Player',
            x: 0.5 * CELL, y: 0.5 * CELL, teamId: 'player', ownerId: P,
            hp: 100, unitAITreeId: 'static_test_no_ai',
        }, engine.eventBus);
        initializeAbilityRuntimeForUnit(keepAlivePlayer);
        engine.addUnit(keepAlivePlayer, 'initialGameSpawn');

        return engine;
    },

    getInitialOrders(engine) {
        const caster = engine.getUnit('burst_caster')!;
        return [{
            unitId: caster.id,
            abilityId: BURST_ID,
            targets: [{ type: 'pixel' as const, position: IN_CONE_POS }],
        }];
    },

    assertPass(engine) {
        if (engine.gameTime < CHECK_TIME) return false;

        const inCone = engine.getUnit('burst_in_cone');
        const outsideAngle = engine.getUnit('burst_outside_angle');
        const outsideRange = engine.getUnit('burst_outside_range');
        const lowHpCaster = engine.getUnit('burst_low_hp_caster');
        if (!inCone || !outsideAngle || !outsideRange || !lowHpCaster) return false;

        const disabledReason = getAbilityDisabledReason({
            playerUnit: lowHpCaster,
            ability: BurstAbility_0302,
            abilityId: BURST_ID,
            currentUses: lowHpCaster.abilityRuntime[BURST_ID]?.currentUses ?? 0,
            isMyTurn: true,
            allUnits: engine.units,
            conditionalCancelContext: null,
        });

        return (
            inCone.hp === DUMMY_HP - BURST_DAMAGE
            && outsideAngle.hp === DUMMY_HP
            && outsideRange.hp === DUMMY_HP
            && disabledReason?.reason_id === 'cannot_afford'
            && disabledReason.resourceId === 'hp'
        );
    },

    failureMessage(engine) {
        const inCone = engine.getUnit('burst_in_cone');
        const outsideAngle = engine.getUnit('burst_outside_angle');
        const outsideRange = engine.getUnit('burst_outside_range');
        const lowHpCaster = engine.getUnit('burst_low_hp_caster');
        const disabledReason = lowHpCaster ? getAbilityDisabledReason({
            playerUnit: lowHpCaster,
            ability: BurstAbility_0302,
            abilityId: BURST_ID,
            currentUses: lowHpCaster.abilityRuntime[BURST_ID]?.currentUses ?? 0,
            isMyTurn: true,
            allUnits: engine.units,
            conditionalCancelContext: null,
        }) : null;
        return [
            `t=${engine.gameTime.toFixed(2)}s`,
            `inCone hp=${inCone?.hp} (expected ${DUMMY_HP - BURST_DAMAGE})`,
            `outsideAngle hp=${outsideAngle?.hp} (expected ${DUMMY_HP}, untouched)`,
            `outsideRange hp=${outsideRange?.hp} (expected ${DUMMY_HP}, untouched)`,
            `lowHpCaster disabledReason=${JSON.stringify(disabledReason)} (expected cannot_afford/hp)`,
        ].join('; ');
    },
};
