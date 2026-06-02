/**
 * Swarmling ability-test scenarios.
 */

import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;
const REQUIRED_ATTACKS = 4;
const BITE_DAMAGE = 2;

// Player in the centre of a 10 × 8 grid.
const PLAYER_POS = { x: 4 * CELL + CELL / 2, y: 3 * CELL + CELL / 2 };  // (180, 140)

// Four swarmlings 120 px away in cardinal directions — outside bite AI range (70 px)
// so each must walk before it can attack.
const SWARMLING_SPAWNS = [
    { id: 'swarm_n', x: PLAYER_POS.x,       y: PLAYER_POS.y - 120 },  // (180, 20)
    { id: 'swarm_s', x: PLAYER_POS.x,       y: PLAYER_POS.y + 120 },  // (180, 260)
    { id: 'swarm_e', x: PLAYER_POS.x + 120, y: PLAYER_POS.y },        // (300, 140)
    { id: 'swarm_w', x: PLAYER_POS.x - 120, y: PLAYER_POS.y },        // (60, 140)
];

/**
 * Four swarmlings spawn outside bite range in cardinal directions, hunt the player down
 * via the hunt AI, and collectively land at least 4 bites.
 * Each swarmling carries two copies of Bite (E13) so it can snap twice per round.
 */
export const swarmlingHuntAndBiteScenario: ScenarioDefinition = {
    id: 'enemy_swarmling_hunt_and_bite',
    title: 'Swarmlings: 4 close from outside range and land 4 bites on the player',
    category: 'general',
    generalSection: 'Enemies',
    maxDurationMs: 15000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 10, gridH: 8, localPlayerId: P, grass: true });

        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: PLAYER_POS.x,
            y: PLAYER_POS.y,
            abilities: [],
        });

        for (const { id, x, y } of SWARMLING_SPAWNS) {
            const swarmling = createUnitFromSpawnConfig(
                {
                    id,
                    characterId: 'swarmling',
                    name: 'Swarmling',
                    x,
                    y,
                    teamId: 'enemy',
                    ownerId: 'ai',
                    abilities: ['0013', '0013'],
                    unitAITreeId: 'hunt',
                    aiSettings: { minRange: 0, maxRange: 70 },
                },
                engine.eventBus,
            );
            initializeAbilityRuntimeForUnit(swarmling);
            engine.addUnit(swarmling, 'initialGameSpawn');
        }

        // Keep the player non-idle so the runner doesn't exit before all bites land.
        // Queue waits every 1.5 s (90 ticks) to cover the full scenario window.
        for (const tick of [90, 180, 270, 360, 450, 540]) {
            engine.state.orderMgr.queueOrder(tick, {
                unitId: player.id,
                abilityId: 'wait',
                targets: [],
            });
        }

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{ unitId: player.id, abilityId: 'wait', targets: [] }];
    },

    assertPass(engine) {
        const player = engine.getLocalPlayerUnit();
        return Boolean(player && player.maxHp - player.hp >= BITE_DAMAGE * REQUIRED_ATTACKS);
    },

    failureMessage(engine) {
        const player = engine.getLocalPlayerUnit();
        const damageDealt = player ? player.maxHp - player.hp : 0;
        const attacksLanded = Math.floor(damageDealt / BITE_DAMAGE);
        const swarmInfo = SWARMLING_SPAWNS.map(({ id }) => {
            const s = engine.getUnit(id);
            if (!s) return `${id}:gone`;
            const active = s.activeAbilities.map((a) => a.abilityId).join(',');
            return `${id}:pos=(${s.x.toFixed(0)},${s.y.toFixed(0)}) active=[${active || '—'}]`;
        }).join(' | ');
        return `attacks landed: ${attacksLanded}/${REQUIRED_ATTACKS} (player hp=${player?.hp}/${player?.maxHp}) | ${swarmInfo}`;
    },
};
