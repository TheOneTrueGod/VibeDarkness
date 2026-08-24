/**
 * Gravity Shield (0904) — ally absorb shield that lands at GRAVITY_SHIELD_HP and
 * drains to 0 over one round through the real order path.
 */

import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import { Gravity } from '../../../resources/Gravity';
import { SHIELD_BUFF_TYPE, type ShieldBuff } from '../../../buffs/ShieldBuff';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { ROUND_DURATION } from '../../../game/gameConstants';
import {
    GRAVITY_SHIELD_ACTIVE_DURATION,
    GRAVITY_SHIELD_DURATION_ROUNDS,
    GRAVITY_SHIELD_GRAVITY_COST,
    GRAVITY_SHIELD_HP,
    GRAVITY_SHIELD_PREFIRE_TIME,
} from '../../../card_defs/09_gravity_core/gravityConstants';
import { GravityShieldAbility } from '../../../card_defs/09_gravity_core/0904_GravityShield/0904Ability';

const P = TINY_BATTLE_PLAYER_ID;
const GRAVITY_SHIELD_ID = GravityShieldAbility.id;
const ALLY_ID = 'gravity_shield_ally';

const PLAYER_POS = { x: 2 * CELL_SIZE + CELL_SIZE / 2, y: 3 * CELL_SIZE + CELL_SIZE / 2 };
const ALLY_POS = { x: 4 * CELL_SIZE + CELL_SIZE / 2, y: 3 * CELL_SIZE + CELL_SIZE / 2 };

const SHIELD_LANDS_AT = GRAVITY_SHIELD_PREFIRE_TIME + GRAVITY_SHIELD_ACTIVE_DURATION;
const NOMINAL_SHIELD_LIFETIME_SECONDS = GRAVITY_SHIELD_DURATION_ROUNDS * ROUND_DURATION;
const FINAL_CHECK_TIME = SHIELD_LANDS_AT + NOMINAL_SHIELD_LIFETIME_SECONDS + 0.15;
const KEEP_ALIVE_TIME = FINAL_CHECK_TIME + 0.5;

function toTick(seconds: number): number {
    return Math.ceil(seconds * 60);
}

let shieldWasApplied = false;

function allyShield(engine: { getUnit(id: string): { buffs: { _type: string }[] } | undefined }): ShieldBuff | undefined {
    const ally = engine.getUnit(ALLY_ID);
    return ally?.buffs.find((b) => b._type === SHIELD_BUFF_TYPE) as ShieldBuff | undefined;
}

export const gravityShieldScenario: ScenarioDefinition = {
    id: 'gravity_shield_absorb_drain_e2e',
    title: 'Gravity Shield (0904): grants a high-armour shield that drains in one round',
    category: 'ability',
    maxDurationMs: Math.ceil((FINAL_CHECK_TIME + 1) * 1000),

    buildEngine() {
        shieldWasApplied = false;
        const engine = buildTinyBattleEngine({
            gridW: 10,
            gridH: 8,
            localPlayerId: P,
            grass: true,
        });

        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: PLAYER_POS.x,
            y: PLAYER_POS.y,
            abilities: [GRAVITY_SHIELD_ID],
        });
        const gravity = new Gravity();
        player.attachResource(gravity, engine.eventBus);
        gravity.add(GRAVITY_SHIELD_GRAVITY_COST + 5);

        const ally = createUnitFromSpawnConfig({
            id: ALLY_ID,
            characterId: 'enemy_melee',
            name: 'Ally',
            x: ALLY_POS.x,
            y: ALLY_POS.y,
            teamId: 'player',
            ownerId: 'ai',
            hp: 80,
            unitAITreeId: 'static_test_no_ai',
        }, engine.eventBus);
        initializeAbilityRuntimeForUnit(ally);
        engine.addUnit(ally, 'initialGameSpawn');

        engine.state.orderMgr.queueOrder(toTick(KEEP_ALIVE_TIME), {
            unitId: player.id,
            abilityId: 'wait',
            targets: [],
        });

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{
            unitId: player.id,
            abilityId: GRAVITY_SHIELD_ID,
            targets: [{ type: 'unit', unitId: ALLY_ID }],
        }];
    },

    assertPass(engine) {
        if (engine.gameTime < SHIELD_LANDS_AT + 0.02) return false;

        const shield = allyShield(engine);
        if (shield && shield.remainingHp > GRAVITY_SHIELD_HP * 0.5) {
            shieldWasApplied = true;
        }

        if (engine.gameTime < FINAL_CHECK_TIME) return false;
        return shieldWasApplied && shield === undefined;
    },

    failureMessage(engine) {
        const shield = allyShield(engine);
        return [
            `t=${engine.gameTime.toFixed(2)}s`,
            `applied=${shieldWasApplied}`,
            `shield=${shield ? shield.remainingHp.toFixed(2) : 'removed'}`,
        ].join('; ');
    },
};
