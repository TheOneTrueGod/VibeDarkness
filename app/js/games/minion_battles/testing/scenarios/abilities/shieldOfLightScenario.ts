/**
 * Shield of Light (0805) — self-cast absorb shield that lands at LIGHT_SHIELD_HP and
 * drains to 0 over one round through the real order path.
 */

import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { Light } from '../../../resources/Light';
import { SHIELD_BUFF_TYPE, type ShieldBuff } from '../../../buffs/ShieldBuff';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { ROUND_DURATION } from '../../../game/gameConstants';
import {
    LIGHT_SHIELD_ACTIVE_DURATION,
    LIGHT_SHIELD_DURATION_ROUNDS,
    LIGHT_SHIELD_HP,
    LIGHT_SHIELD_LIGHT_COST,
    LIGHT_SHIELD_PREFIRE_TIME,
    SHIELD_OF_LIGHT_ABILITY_ID,
} from '../../../card_defs/08_light_core/0805_ShieldOfLight/0805Constants';
import { ShieldOfLightAbility } from '../../../card_defs/08_light_core/0805_ShieldOfLight/0805Ability';

const P = TINY_BATTLE_PLAYER_ID;
const SHIELD_OF_LIGHT_ID = ShieldOfLightAbility.id;

const PLAYER_POS = { x: 3 * CELL_SIZE + CELL_SIZE / 2, y: 3 * CELL_SIZE + CELL_SIZE / 2 };

const SHIELD_LANDS_AT = LIGHT_SHIELD_PREFIRE_TIME + LIGHT_SHIELD_ACTIVE_DURATION;
const NOMINAL_SHIELD_LIFETIME_SECONDS = LIGHT_SHIELD_DURATION_ROUNDS * ROUND_DURATION;
const FINAL_CHECK_TIME = SHIELD_LANDS_AT + NOMINAL_SHIELD_LIFETIME_SECONDS + 0.15;
const KEEP_ALIVE_TIME = FINAL_CHECK_TIME + 0.5;

function toTick(seconds: number): number {
    return Math.ceil(seconds * 60);
}

let shieldWasApplied = false;

function playerShield(engine: { getLocalPlayerUnit(): { buffs: { _type: string }[] } | null | undefined }): ShieldBuff | undefined {
    const player = engine.getLocalPlayerUnit();
    return player?.buffs.find((b) => b._type === SHIELD_BUFF_TYPE) as ShieldBuff | undefined;
}

export const shieldOfLightScenario: ScenarioDefinition = {
    id: 'shield_of_light_absorb_drain_e2e',
    title: 'Shield of Light (0805): grants a high-armour shield that drains in one round',
    category: 'ability',
    maxDurationMs: Math.ceil((FINAL_CHECK_TIME + 1) * 1000),

    buildEngine() {
        shieldWasApplied = false;
        const engine = buildTinyBattleEngine({
            gridW: 8,
            gridH: 8,
            localPlayerId: P,
            grass: true,
        });

        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: PLAYER_POS.x,
            y: PLAYER_POS.y,
            abilities: [SHIELD_OF_LIGHT_ID],
        });
        const light = new Light();
        player.attachResource(light, engine.eventBus);
        light.add(LIGHT_SHIELD_LIGHT_COST + 2);

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
            abilityId: SHIELD_OF_LIGHT_ABILITY_ID,
            targets: [],
        }];
    },

    assertPass(engine) {
        if (engine.gameTime < SHIELD_LANDS_AT + 0.02) return false;

        const shield = playerShield(engine);
        if (shield && shield.theme === 'light' && shield.remainingHp > LIGHT_SHIELD_HP * 0.5) {
            shieldWasApplied = true;
        }

        if (engine.gameTime < FINAL_CHECK_TIME) return false;
        return shieldWasApplied && shield === undefined;
    },

    failureMessage(engine) {
        const shield = playerShield(engine);
        return [
            `t=${engine.gameTime.toFixed(2)}s`,
            `applied=${shieldWasApplied}`,
            `theme=${shield?.theme ?? 'removed'}`,
            `shield=${shield ? shield.remainingHp.toFixed(2) : 'removed'}`,
        ].join('; ');
    },
};
