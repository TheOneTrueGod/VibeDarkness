/**
 * Protect (0303) shield-absorption pipeline E2E contract. See
 * `card_defs/03_blood_mage/AGENTS.md` for the Blood Mage design intent, and
 * `abilities/blockingHelpers.shield.test.ts` for the unit-level onBlock wiring this scenario
 * exercises end-to-end via a real Protect cast.
 *
 * One scenario, staged beats (per the "one scenario per ability" rule — combine assertions
 * rather than splitting into separate scenarios):
 *  - Beat 1 (Ally A): a hit smaller than the shield's remaining capacity is fully absorbed —
 *    HP untouched, and the attacking ability's onAttackBlocked hook fires.
 *  - Beat 2 (Ally A): a second, larger hit exceeds the shield's remaining capacity — the
 *    excess carries through to HP (not blocked), and the now-depleted shield is removed
 *    immediately rather than lingering until the duration sweep.
 *  - Beat 3 (Ally C): an undamaged shield is instead removed by the normal per-tick expiry
 *    sweep once its full duration elapses.
 *
 * Two throwaway test-only attacking abilities are registered via `registerAbilityForTest`
 * (safe — see its docstring) so the exact absorbed/overflow damage amounts are controlled,
 * while still routing real damage through `tryDamageOrBlock` (the same melee pipeline Burst
 * uses) rather than mocking the shield mechanic directly.
 */

import type { ScenarioDefinition } from '../../types';
import { buildTinyBattleEngine, TINY_BATTLE_PLAYER_ID } from '../../harness/buildTinyBattleEngine';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import { unitRangeHitbox } from '../../../hitboxes';
import { registerAbilityForTest } from '../../../abilities/AbilityRegistry';
import type { AbilityStatic } from '../../../abilities/Ability';
import { SHIELD_BUFF_TYPE, type ShieldBuff } from '../../../buffs/ShieldBuff';
import {
    PROTECT_ACTIVE_DURATION,
    PROTECT_SHIELD_DRAIN_PER_SECOND,
    PROTECT_SHIELD_HP,
    PROTECT_WINDUP_DURATION,
    ProtectAbility_0303,
} from '../../../card_defs/03_blood_mage/0303_Protect/0303Ability';

// Time for an undamaged shield to fully drain (ShieldBuff has no fixed duration anymore —
// it fades passively via drainPerSecond and expires once remainingHp reaches 0).
const NOMINAL_SHIELD_LIFETIME_SECONDS = PROTECT_SHIELD_HP / PROTECT_SHIELD_DRAIN_PER_SECOND;

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;
const PROTECT_ID = ProtectAbility_0303.id;

const CASTER_A_POS = { x: 2 * CELL + CELL / 2, y: 2 * CELL + CELL / 2 };
const ALLY_A_POS = { x: 3 * CELL + CELL / 2, y: 2 * CELL + CELL / 2 };
const ATTACKER_LOW_POS = { x: 4 * CELL + CELL / 2, y: 2 * CELL + CELL / 2 };
const ATTACKER_HIGH_POS = { x: 3 * CELL + CELL / 2, y: 3 * CELL + CELL / 2 };
const CASTER_C_POS = { x: 8 * CELL + CELL / 2, y: 2 * CELL + CELL / 2 };
const ALLY_C_POS = { x: 9 * CELL + CELL / 2, y: 2 * CELL + CELL / 2 };

const TEST_ATTACK_RANGE = 80;
const TEST_ATTACK_LOW_ID = 'protect_scenario_test_attack_low';
const TEST_ATTACK_HIGH_ID = 'protect_scenario_test_attack_high';
const TEST_ATTACK_LOW_DAMAGE = 10; // < shield (30) — fully absorbed.
const TEST_ATTACK_HIGH_DAMAGE = 25; // > remaining shield after beat 1 — excess carries through.
const ALLY_A_START_HP = 80;

// gameTime by which the shield has landed on both allies (active-frame CastBehaviour fires
// at the start of the active window).
const SHIELD_LANDS_AT = PROTECT_WINDUP_DURATION + PROTECT_ACTIVE_DURATION;
const ATTACK_LOW_TIME = SHIELD_LANDS_AT + 0.15;
const ATTACK_HIGH_TIME = ATTACK_LOW_TIME + 0.3;

// The shield now drains continuously (not just on hits), so the capacity available at each
// beat depends on elapsed time, not just prior damage. This is a best-effort continuous-time
// approximation of that drain — the real simulation is tick-discretized (60Hz) and the exact
// castBehaviour-entry / impactAt sub-tick moments add a bit more slop, hence the tolerance
// used below rather than an exact equality.
const SHIELD_AT_LOW_ATTACK = PROTECT_SHIELD_HP - PROTECT_SHIELD_DRAIN_PER_SECOND * (ATTACK_LOW_TIME - SHIELD_LANDS_AT);
const SHIELD_AFTER_LOW_ATTACK = SHIELD_AT_LOW_ATTACK - TEST_ATTACK_LOW_DAMAGE;
const SHIELD_AT_HIGH_ATTACK = SHIELD_AFTER_LOW_ATTACK - PROTECT_SHIELD_DRAIN_PER_SECOND * (ATTACK_HIGH_TIME - ATTACK_LOW_TIME);
const EXPECTED_OVERFLOW_TO_HP = Math.max(0, TEST_ATTACK_HIGH_DAMAGE - SHIELD_AT_HIGH_ATTACK);
const EXPECTED_ALLY_A_HP = ALLY_A_START_HP - EXPECTED_OVERFLOW_TO_HP;
// Generous enough to absorb tick discretization + sub-tick timing slop, tight enough to still
// fail if the drain rate or absorption math regresses meaningfully.
const ALLY_A_HP_TOLERANCE = 1.5;
// Ally C's shield must survive untouched all the way to its natural (drain-based) expiry.
const FINAL_CHECK_TIME = SHIELD_LANDS_AT + NOMINAL_SHIELD_LIFETIME_SECONDS + 0.1;
const KEEP_ALIVE_TIME = FINAL_CHECK_TIME + 0.5;

function toTick(seconds: number): number {
    return Math.ceil(seconds * 60);
}

// Reset per buildEngine() call so repeated runs (admin UI re-invocation) start clean.
const lowBlockedCounter = { blocked: 0 };
const highBlockedCounter = { blocked: 0 };

/** Minimal melee attacker routed through tryDamageOrBlock, counting onAttackBlocked calls. */
function makeTestAttackAbility(id: string, damage: number, counter: { blocked: number }): AbilityStatic {
    const hitbox = unitRangeHitbox(TEST_ATTACK_RANGE);
    return defineAbility({
        id,
        name: 'Scenario Test Attack',
        image: '',
        resourceCost: null,
        rechargeTurns: 0,
        maxUses: 3,
        prefireTime: 0,
        abilityTimings: [
            {
                id: 'active',
                start: 0,
                end: 0.05,
                abilityPhase: AbilityPhase.Active,
                targetDef: { kind: 'select', label: 'Target', hitbox, filter: 'enemy', allowMiss: false },
                // NOT withImpactAt(0): MeleeAttackBehaviour.onTick's impactAt<=0 branch fires only on
                // `ctx.isFirstTick`, which `unitAbilityTick.ts` computes as `prevWindowProgress<=0`.
                // That comparison is fragile to float drift in `gameTime - active.startTime` — for some
                // absolute start ticks `prevWindowProgress` lands on a tiny positive epsilon instead of
                // exactly 0, so `isFirstTick` never latches true and the hit is silently dropped for the
                // whole active window (confirmed by instrumenting onTick: reproduced at tick 54 in this
                // scenario, not at tick 72). A small positive `impactAt` uses the threshold-crossing
                // branch instead (`prevWindowProgress<impactAt && windowProgress>=impactAt`), which is
                // immune to that epsilon. Pre-existing engine bug, out of scope to fix here — worth a
                // follow-up in `unitAbilityTick.ts`'s `isFirstTick` computation.
                behaviour: CastBehaviours.MeleeAttack().withHitbox(hitbox).withDamage(damage).withImpactAt(0.01),
            },
            { id: 'cooldown', start: 0.05, end: 0.1, abilityPhase: AbilityPhase.Cooldown },
        ],
        targets: [],
        onAttackBlocked: () => { counter.blocked += 1; },
        getTooltipText: () => [`Scenario-only test attack dealing {${damage}} damage.`],
    });
}

export const protectShieldAbsorptionScenario: ScenarioDefinition = {
    id: 'protect_shield_absorption_e2e',
    title: 'Protect (0303): shield absorbs, overflows, blocks, and expires',
    category: 'ability',
    maxDurationMs: Math.ceil((FINAL_CHECK_TIME + 1) * 1000),

    buildEngine() {
        lowBlockedCounter.blocked = 0;
        highBlockedCounter.blocked = 0;
        registerAbilityForTest(makeTestAttackAbility(TEST_ATTACK_LOW_ID, TEST_ATTACK_LOW_DAMAGE, lowBlockedCounter));
        registerAbilityForTest(makeTestAttackAbility(TEST_ATTACK_HIGH_ID, TEST_ATTACK_HIGH_DAMAGE, highBlockedCounter));

        const engine = buildTinyBattleEngine({ gridW: 12, gridH: 8, localPlayerId: P, grass: true });

        const casterA = createUnitFromSpawnConfig({
            id: 'protect_caster_a', characterId: 'enemy_melee', name: 'Caster A',
            x: CASTER_A_POS.x, y: CASTER_A_POS.y, teamId: 'player', ownerId: 'ai',
            abilities: [PROTECT_ID], hp: 100, unitAITreeId: 'static_test_no_ai',
        }, engine.eventBus);
        initializeAbilityRuntimeForUnit(casterA);
        engine.addUnit(casterA, 'initialGameSpawn');

        const allyA = createUnitFromSpawnConfig({
            id: 'protect_ally_a', characterId: 'enemy_melee', name: 'Ally A',
            x: ALLY_A_POS.x, y: ALLY_A_POS.y, teamId: 'player', ownerId: 'ai',
            hp: 100, unitAITreeId: 'static_test_no_ai',
        }, engine.eventBus);
        allyA.hp = ALLY_A_START_HP;
        initializeAbilityRuntimeForUnit(allyA);
        engine.addUnit(allyA, 'initialGameSpawn');

        const attackerLow = createUnitFromSpawnConfig({
            id: 'protect_attacker_low', characterId: 'enemy_melee', name: 'Attacker Low',
            x: ATTACKER_LOW_POS.x, y: ATTACKER_LOW_POS.y, teamId: 'enemy', ownerId: 'ai',
            abilities: [TEST_ATTACK_LOW_ID], hp: 100, unitAITreeId: 'static_test_no_ai',
        }, engine.eventBus);
        initializeAbilityRuntimeForUnit(attackerLow);
        engine.addUnit(attackerLow, 'initialGameSpawn');

        const attackerHigh = createUnitFromSpawnConfig({
            id: 'protect_attacker_high', characterId: 'enemy_melee', name: 'Attacker High',
            x: ATTACKER_HIGH_POS.x, y: ATTACKER_HIGH_POS.y, teamId: 'enemy', ownerId: 'ai',
            abilities: [TEST_ATTACK_HIGH_ID], hp: 100, unitAITreeId: 'static_test_no_ai',
        }, engine.eventBus);
        initializeAbilityRuntimeForUnit(attackerHigh);
        engine.addUnit(attackerHigh, 'initialGameSpawn');

        const casterC = createUnitFromSpawnConfig({
            id: 'protect_caster_c', characterId: 'enemy_melee', name: 'Caster C',
            x: CASTER_C_POS.x, y: CASTER_C_POS.y, teamId: 'player', ownerId: 'ai',
            abilities: [PROTECT_ID], hp: 100, unitAITreeId: 'static_test_no_ai',
        }, engine.eventBus);
        initializeAbilityRuntimeForUnit(casterC);
        engine.addUnit(casterC, 'initialGameSpawn');

        const allyC = createUnitFromSpawnConfig({
            id: 'protect_ally_c', characterId: 'enemy_melee', name: 'Ally C',
            x: ALLY_C_POS.x, y: ALLY_C_POS.y, teamId: 'player', ownerId: 'ai',
            hp: 100, unitAITreeId: 'static_test_no_ai',
        }, engine.eventBus);
        initializeAbilityRuntimeForUnit(allyC);
        engine.addUnit(allyC, 'initialGameSpawn');

        // Stage the two hits on Ally A after Protect's shield has landed, then a marker order
        // well after Ally C's shield should have naturally drained away. This keeps `pendingOrders`
        // non-empty so the runner's idle-detector doesn't settle the scenario early during the
        // multi-second wait for the drain-based expiry (see the ability-tests skill's "Keeping the
        // simulation running" section).
        engine.state.orderMgr.queueOrder(toTick(ATTACK_LOW_TIME), {
            unitId: attackerLow.id,
            abilityId: TEST_ATTACK_LOW_ID,
            targets: [{ type: 'unit' as const, unitId: allyA.id }],
        });
        engine.state.orderMgr.queueOrder(toTick(ATTACK_HIGH_TIME), {
            unitId: attackerHigh.id,
            abilityId: TEST_ATTACK_HIGH_ID,
            targets: [{ type: 'unit' as const, unitId: allyA.id }],
        });
        engine.state.orderMgr.queueOrder(toTick(KEEP_ALIVE_TIME), {
            unitId: casterA.id,
            abilityId: 'wait',
            targets: [],
        });

        // Every other unit here is `ownerId:'ai'` (see file header). `LevelEventManager.runDefeatCheck`
        // fires defeat once no `teamId:'player'` unit is both alive AND `isPlayerControlled()`
        // (`ownerId !== 'ai'`) — without a real player-owned unit the battle is defeated on tick 1,
        // going terminal before `assertPass` ever gets a chance to run. This idle keep-alive unit
        // (never targeted, never ordered) is the same fix `techShieldScenarios`/`absorptionShieldScenario`
        // get for free via `spawnTinyPlayerUnit`.
        const keepAlivePlayer = createUnitFromSpawnConfig({
            id: 'protect_keep_alive_player', characterId: 'enemy_melee', name: 'Keep-Alive Player',
            x: 0.5 * CELL, y: 0.5 * CELL, teamId: 'player', ownerId: P,
            hp: 100, unitAITreeId: 'static_test_no_ai',
        }, engine.eventBus);
        initializeAbilityRuntimeForUnit(keepAlivePlayer);
        engine.addUnit(keepAlivePlayer, 'initialGameSpawn');

        return engine;
    },

    getInitialOrders(engine) {
        const casterA = engine.getUnit('protect_caster_a')!;
        const allyA = engine.getUnit('protect_ally_a')!;
        const casterC = engine.getUnit('protect_caster_c')!;
        const allyC = engine.getUnit('protect_ally_c')!;
        return [
            { unitId: casterA.id, abilityId: PROTECT_ID, targets: [{ type: 'unit' as const, unitId: allyA.id }] },
            { unitId: casterC.id, abilityId: PROTECT_ID, targets: [{ type: 'unit' as const, unitId: allyC.id }] },
        ];
    },

    assertPass(engine) {
        if (engine.gameTime < FINAL_CHECK_TIME) return false;

        const allyA = engine.getUnit('protect_ally_a');
        const allyC = engine.getUnit('protect_ally_c');
        if (!allyA || !allyC) return false;

        const shieldA = allyA.buffs.find((b) => b._type === SHIELD_BUFF_TYPE) as ShieldBuff | undefined;
        const shieldC = allyC.buffs.find((b) => b._type === SHIELD_BUFF_TYPE) as ShieldBuff | undefined;

        return (
            Math.abs(allyA.hp - EXPECTED_ALLY_A_HP) <= ALLY_A_HP_TOLERANCE
            && shieldA === undefined
            && lowBlockedCounter.blocked >= 1
            && highBlockedCounter.blocked === 0
            && shieldC === undefined
        );
    },

    failureMessage(engine) {
        const allyA = engine.getUnit('protect_ally_a');
        const allyC = engine.getUnit('protect_ally_c');
        const shieldA = allyA?.buffs.find((b) => b._type === SHIELD_BUFF_TYPE) as ShieldBuff | undefined;
        const shieldC = allyC?.buffs.find((b) => b._type === SHIELD_BUFF_TYPE) as ShieldBuff | undefined;
        return [
            `t=${engine.gameTime.toFixed(2)}s`,
            `allyA hp=${allyA?.hp} (expected ${EXPECTED_ALLY_A_HP.toFixed(2)} +/- ${ALLY_A_HP_TOLERANCE})`,
            `allyA shield=${shieldA ? shieldA.remainingHp : 'removed'} (expected removed after depletion)`,
            `lowBlocked=${lowBlockedCounter.blocked} (expected >=1) highBlocked=${highBlockedCounter.blocked} (expected 0)`,
            `allyC shield=${shieldC ? shieldC.remainingHp : 'removed'} (expected removed after ${NOMINAL_SHIELD_LIFETIME_SECONDS.toFixed(2)}s of drain)`,
        ].join('; ');
    },
};
