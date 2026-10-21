/**
 * Blood Mend (0301) committed-run E2E contract. See `card_defs/03_blood_mage/AGENTS.md` for the
 * Blood Mage design intent.
 *
 * The caster Blood Mends an ally standing among three enemies: two bleeding and one not.
 *  - Once the active frame lands the ally carries a 38 HP blood shield (30 + 4 per bleeding enemy
 *    Rend hit), the two bleeding enemies took Rend's 4 damage, and the other enemy took none.
 *  - A little later the shield has faded and the ally's HP has risen by half of what faded
 *    (no burst heal any more).
 * The HP-cost floor (`floorAtOne`) and the VFX size limit are covered by `0301Ability.test.ts`.
 */

import type { ScenarioDefinition } from '../../types';
import type { GameEngine } from '../../../game/GameEngine';
import { buildTinyBattleEngine, TINY_BATTLE_PLAYER_ID } from '../../harness/buildTinyBattleEngine';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import { applyBleedStack } from '../../../buffs/bleedRuntime';
import { SHIELD_BUFF_TYPE, type ShieldBuff } from '../../../buffs/ShieldBuff';
import {
    BLOOD_MEND_ACTIVE_DURATION,
    BLOOD_MEND_DECAY_HEAL_FRACTION,
    BLOOD_MEND_HP_COST,
    BLOOD_MEND_REND,
    BLOOD_MEND_SHIELD_HP,
    BLOOD_MEND_SHIELD_PER_REND_HIT,
    BLOOD_MEND_WINDUP_DURATION,
    BloodMendAbility_0301,
} from '../../../card_defs/03_blood_mage/0301_BloodMend/0301Ability';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;
const BLOOD_MEND_ID = BloodMendAbility_0301.id;

const CASTER_ID = 'blood_mend_caster';
const ALLY_ID = 'blood_mend_ally';
const BLEEDING_IDS = ['blood_mend_bleeding_a', 'blood_mend_bleeding_b'];
const CLEAN_ID = 'blood_mend_clean';

const CASTER_POS = { x: 2 * CELL + CELL / 2, y: 2 * CELL + CELL / 2 };
const ALLY_POS = { x: 4 * CELL + CELL / 2, y: 2 * CELL + CELL / 2 };
// All within Rend's radius (70px) of the ally.
const BLEEDING_A_POS = { x: 5 * CELL + CELL / 2, y: 2 * CELL + CELL / 2 };
const BLEEDING_B_POS = { x: 4 * CELL + CELL / 2, y: 3 * CELL + CELL / 2 };
const CLEAN_POS = { x: 3 * CELL + CELL / 2, y: 3 * CELL + CELL / 2 };

const CASTER_START_HP = 100;
const ALLY_START_HP = 50;
const ENEMY_HP = 100;
// Each bleed round-milestone tick drops a stack, so start with enough to still be bleeding at the cast.
const BLEED_STACKS = 6;

const EXPECTED_SHIELD = BLOOD_MEND_SHIELD_HP + BLOOD_MEND_SHIELD_PER_REND_HIT * BLEEDING_IDS.length;
// Shield sampled on the first tick after the active frame lands, then again once it has faded a while.
const LANDED_AT = BLOOD_MEND_WINDUP_DURATION + BLOOD_MEND_ACTIVE_DURATION + 0.02;
const FADED_AT = LANDED_AT + 1.5;
// Landing is sampled a tick or two late, so the shield may already have faded a fraction of a point.
const LANDED_SHIELD_TOLERANCE = 0.5;
const HEAL_TOLERANCE = 0.1;

interface Sample {
    shield: number;
    allyHp: number;
    enemyHp: Record<string, number>;
}

// Reset per buildEngine() call so repeated runs (admin UI re-invocation) start clean.
let beforeCast: Sample | null = null;
let landed: Sample | null = null;
let faded: Sample | null = null;

function toTick(seconds: number): number {
    return Math.ceil(seconds * 60);
}

function sample(engine: GameEngine): Sample | null {
    const ally = engine.getUnit(ALLY_ID);
    if (!ally) return null;
    const shield = ally.buffs.find((b) => b._type === SHIELD_BUFF_TYPE) as ShieldBuff | undefined;
    const enemyHp: Record<string, number> = {};
    for (const id of [...BLEEDING_IDS, CLEAN_ID]) enemyHp[id] = engine.getUnit(id)?.hp ?? NaN;
    return { shield: shield?.remainingHp ?? 0, allyHp: ally.hp, enemyHp };
}

export const bloodMendScenario: ScenarioDefinition = {
    id: 'blood_mend_committed_e2e',
    title: 'Blood Mend (0301): blood shield, +4 shield per Rend hit, and healing as it fades',
    category: 'ability',
    maxDurationMs: Math.ceil((FADED_AT + 1) * 1000),

    buildEngine() {
        beforeCast = null;
        landed = null;
        faded = null;
        const engine = buildTinyBattleEngine({ gridW: 8, gridH: 8, localPlayerId: P, grass: true });

        const add = (
            id: string,
            name: string,
            pos: { x: number; y: number },
            teamId: 'player' | 'enemy',
            hp: number,
            abilities?: string[],
        ) => {
            const unit = createUnitFromSpawnConfig({
                id, characterId: 'enemy_melee', name,
                x: pos.x, y: pos.y, teamId, ownerId: 'ai',
                abilities, hp: 100, unitAITreeId: 'static_test_no_ai',
            }, engine.eventBus);
            unit.hp = hp; // Below max so the heal is observable.
            initializeAbilityRuntimeForUnit(unit);
            engine.addUnit(unit, 'initialGameSpawn');
            return unit;
        };

        add(CASTER_ID, 'Caster', CASTER_POS, 'player', CASTER_START_HP, [BLOOD_MEND_ID]);
        add(ALLY_ID, 'Ally', ALLY_POS, 'player', ALLY_START_HP);
        const bleedingA = add(BLEEDING_IDS[0], 'Bleeding A', BLEEDING_A_POS, 'enemy', ENEMY_HP);
        const bleedingB = add(BLEEDING_IDS[1], 'Bleeding B', BLEEDING_B_POS, 'enemy', ENEMY_HP);
        add(CLEAN_ID, 'Not Bleeding', CLEAN_POS, 'enemy', ENEMY_HP);
        applyBleedStack(bleedingA, 0, 1, BLEED_STACKS);
        applyBleedStack(bleedingB, 0, 1, BLEED_STACKS);

        // Every other unit here is `ownerId:'ai'`. `LevelEventManager.runDefeatCheck` fires defeat once no
        // `teamId:'player'` unit is both alive AND `isPlayerControlled()` (`ownerId !== 'ai'`) — without a
        // real player-owned unit the battle is defeated on tick 1, before `assertPass` can run. This idle
        // keep-alive unit (never targeted, never ordered) avoids that.
        const keepAlivePlayer = createUnitFromSpawnConfig({
            id: 'blood_mend_keep_alive_player', characterId: 'enemy_melee', name: 'Keep-Alive Player',
            x: 0.5 * CELL, y: 0.5 * CELL, teamId: 'player', ownerId: P,
            hp: 100, unitAITreeId: 'static_test_no_ai',
        }, engine.eventBus);
        initializeAbilityRuntimeForUnit(keepAlivePlayer);
        engine.addUnit(keepAlivePlayer, 'initialGameSpawn');

        // A marker order after the last check keeps `pendingOrders` non-empty so the runner's idle
        // detector doesn't settle the scenario while the shield fades (see the ability-tests skill's
        // "Keeping the simulation running" section).
        engine.state.orderMgr.queueOrder(toTick(FADED_AT + 0.5), {
            unitId: CASTER_ID,
            abilityId: 'wait',
            targets: [],
        });

        return engine;
    },

    getInitialOrders() {
        return [
            { unitId: CASTER_ID, abilityId: BLOOD_MEND_ID, targets: [{ type: 'unit' as const, unitId: ALLY_ID }] },
        ];
    },

    assertPass(engine) {
        const caster = engine.getUnit(CASTER_ID);
        if (!caster) return false;

        if (engine.gameTime < BLOOD_MEND_WINDUP_DURATION - 0.02) beforeCast = sample(engine);
        if (!landed && engine.gameTime >= LANDED_AT) landed = sample(engine);
        if (!faded && engine.gameTime >= FADED_AT) faded = sample(engine);
        if (!beforeCast || !landed || !faded) return false;

        const decayed = landed.shield - faded.shield;
        return (
            caster.hp === CASTER_START_HP - BLOOD_MEND_HP_COST
            && Math.abs(landed.shield - EXPECTED_SHIELD) <= LANDED_SHIELD_TOLERANCE
            && BLEEDING_IDS.every((id) => landed!.enemyHp[id] === beforeCast!.enemyHp[id] - BLOOD_MEND_REND)
            && landed.enemyHp[CLEAN_ID] === beforeCast.enemyHp[CLEAN_ID]
            && decayed > 1
            && Math.abs((faded.allyHp - landed.allyHp) - decayed * BLOOD_MEND_DECAY_HEAL_FRACTION) <= HEAL_TOLERANCE
        );
    },

    failureMessage(engine) {
        const caster = engine.getUnit(CASTER_ID);
        return [
            `t=${engine.gameTime.toFixed(2)}s`,
            `caster hp=${caster?.hp} (expected ${CASTER_START_HP - BLOOD_MEND_HP_COST})`,
            `before=${JSON.stringify(beforeCast)}`,
            `landed=${JSON.stringify(landed)} (shield expected ~${EXPECTED_SHIELD}, bleeding enemies -${BLOOD_MEND_REND}, clean enemy unchanged)`,
            `faded=${JSON.stringify(faded)} (ally hp should rise by ${BLOOD_MEND_DECAY_HEAL_FRACTION} x shield lost)`,
        ].join('; ');
    },
};
