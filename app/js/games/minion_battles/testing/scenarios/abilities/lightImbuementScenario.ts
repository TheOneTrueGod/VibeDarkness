/**
 * Light Imbuement + Imbued Bat E2E scenario.
 *
 * Setup:
 *   - Player (warrior) at centre-left with abilities 0115 (Swing Bat), 0802 (Light Imbuement),
 *     and 0803 (Imbued Bat, pre-loaded via swap network).
 *   - One target dummy directly in front, within melee range.
 *   - Player has 100 Light (enough to pay the 20-Light cost for Light Imbuement).
 *
 * Order sequence:
 *   1. Use Light Imbuement (0802) — charges for 2 s then applies LightImbueBuff, triggering
 *      the swap: Swing Bat hidden → Imbued Bat activated with 1 use.
 *   2. Use Imbued Bat (0803) targeting the dummy — melee swing plus light AoE fires.
 *
 * Expected:
 *   - The dummy took damage (primary swing + possibly light AoE).
 *   - No engine errors during either cast.
 *
 * Assertions are intentionally high-level (HP decreased) — exact damage numbers are
 * covered by unit tests; this scenario validates the full cast flow end-to-end.
 */

import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createTargetDummyAtWorld } from '../../fixtures/targetDummies';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import { Light } from '../../../resources/Light';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;

// Player slightly left of centre; dummy in melee range to the right.
const PLAYER_POS = { x: 3 * CELL + CELL / 2, y: 5 * CELL + CELL / 2 }; // (140, 220)
// 35 px to the right — within Swing Bat / Imbued Bat max range (25 px + unit radius).
const DUMMY_POS  = { x: PLAYER_POS.x + 35, y: PLAYER_POS.y };

const LIGHT_AMOUNT = 100; // plenty to cover the 20-Light cost

export const lightImbuementAndImbuedBatScenario: ScenarioDefinition = {
    id: 'light_imbuement_imbued_bat_e2e',
    title: 'Light Imbuement (0802) → Imbued Bat (0803): full cast flow deals damage',
    category: 'ability',
    // Light Imbuement has a 2-second windup; allow enough budget for both casts.
    maxDurationMs: 8000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 12, gridH: 10, localPlayerId: P, grass: true });

        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: PLAYER_POS.x,
            y: PLAYER_POS.y,
            // Include all three abilities so the swap network is fully wired.
            abilities: ['0115', '0802', '0803'],
        });

        // Attach enough Light to pay the 20-Light cost.
        const light = new Light();
        player.attachResource(light, engine.eventBus);
        light.add(LIGHT_AMOUNT);

        // Target dummy in melee range.
        const dummy = createTargetDummyAtWorld(engine, DUMMY_POS.x, DUMMY_POS.y, {
            id: 'imbue_dummy',
            hp: 500,
        });
        initializeAbilityRuntimeForUnit(dummy);
        engine.addUnit(dummy, 'initialGameSpawn');

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        const dummy  = engine.getUnit('imbue_dummy')!;

        return [
            // 1. Cast Light Imbuement (self-cast, no target needed).
            {
                unitId: player.id,
                abilityId: '0802',
                targets: [],
            },
            // 2. Cast Imbued Bat at the dummy (swap network will have activated it after step 1).
            {
                unitId: player.id,
                abilityId: '0803',
                targets: [{ type: 'pixel' as const, position: { x: dummy.x, y: dummy.y } }],
            },
        ];
    },

    assertPass(engine) {
        const dummy = engine.getUnit('imbue_dummy');
        if (!dummy) return false;
        // Dummy must have taken at least some damage (primary swing is 10 base).
        return dummy.hp < dummy.maxHp;
    },

    failureMessage(engine) {
        const dummy = engine.getUnit('imbue_dummy');
        if (!dummy) return 'Target dummy was removed from the engine.';
        return `Dummy took no damage (hp=${dummy.hp}/${dummy.maxHp}). Either Light Imbuement did not apply the buff, the swap did not fire, or Imbued Bat did not connect.`;
    },

    describeState(engine) {
        const dummy  = engine.getUnit('imbue_dummy');
        const player = engine.getLocalPlayerUnit();
        const r0803  = player?.abilityRuntime['0803'];
        const r0115  = player?.abilityRuntime['0115'];
        const r0802  = player?.abilityRuntime['0802'];
        return [
            `dummy: hp=${dummy ? `${dummy.hp}/${dummy.maxHp}` : 'gone'}`,
            `0115 active=${r0115?.active} uses=${r0115?.currentUses}`,
            `0802 active=${r0802?.active} uses=${r0802?.currentUses}`,
            `0803 active=${r0803?.active} uses=${r0803?.currentUses} replacedId=${r0803?.replacedAbilityId}`,
        ].join(' | ');
    },
};
