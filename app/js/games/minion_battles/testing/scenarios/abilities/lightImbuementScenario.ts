/**
 * Gather Light + Imbued Bat E2E scenario (Light Imbuement research gated).
 *
 * Setup:
 *   - Player (warrior) at centre-left with abilities 0115 (Swing Bat), 0804 (Gather Light),
 *     and 0803 (Imbued Bat, pre-loaded via swap network).
 *   - Player owns the Light Imbuement research node so Gather Light applies LightImbueBuff.
 *   - One target dummy directly in front, within melee range.
 *
 * Order sequence:
 *   1. Use Gather Light (0804) — windup then grants Light + LightImbueBuff, triggering
 *      the swap: Swing Bat hidden → Imbued Bat activated with 1 use.
 *   2. Use Imbued Bat (0803) targeting the dummy — melee swing plus light AoE fires.
 *
 * Expected:
 *   - After Gather Light completes, Swing Bat is hidden and Imbued Bat is active with 1 use.
 *   - The dummy took damage (primary swing + possibly light AoE).
 *   - No engine errors during either cast.
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
import { GATHER_LIGHT_ABILITY_ID } from '../../../card_defs/08_light_core/0804_GatherLight/0804Constants';
import { IMBUED_BAT_ABILITY_ID } from '../../../card_defs/08_light_core/0803_ImbuedBat/0803Constants';
import { LIGHT_TREE_ID, LIGHT_NODE_IMBUEMENT } from '../../../../../researchTrees/trees/light';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;

// Player slightly left of centre; dummy in melee range to the right.
const PLAYER_POS = { x: 3 * CELL + CELL / 2, y: 5 * CELL + CELL / 2 }; // (140, 220)
// 35 px to the right — within Swing Bat / Imbued Bat max range (25 px + unit radius).
const DUMMY_POS  = { x: PLAYER_POS.x + 35, y: PLAYER_POS.y };

const SWING_BAT_ABILITY_ID = '0115';

const SWING_BAT_INITIAL_SLOT = 0;

export const lightImbuementAndImbuedBatScenario: ScenarioDefinition = {
    id: 'light_imbuement_imbued_bat_e2e',
    title: 'Gather Light (0804) + Light Imbuement research → Imbued Bat (0803): full cast flow deals damage',
    category: 'ability',
    // Gather Light windup + Imbued Bat cast.
    maxDurationMs: 8000,

    buildEngine() {
        const engine = buildTinyBattleEngine({
            gridW: 12,
            gridH: 10,
            localPlayerId: P,
            grass: true,
            playerResearchTreesByPlayer: {
                [P]: { [LIGHT_TREE_ID]: [LIGHT_NODE_IMBUEMENT] },
            },
        });

        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: PLAYER_POS.x,
            y: PLAYER_POS.y,
            // Include Swing Bat, Gather Light, and Imbued Bat so the swap network is fully wired.
            abilities: [SWING_BAT_ABILITY_ID, GATHER_LIGHT_ABILITY_ID, IMBUED_BAT_ABILITY_ID],
        });

        // Light resource attached so Imbued Bat / other abilities in the bar have something to draw on.
        const light = new Light();
        player.attachResource(light, engine.eventBus);

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
            // 1. Cast Gather Light (self-cast, no target needed) — applies imbue with research.
            {
                unitId: player.id,
                abilityId: GATHER_LIGHT_ABILITY_ID,
                targets: [],
            },
            // 2. Cast Imbued Bat at the dummy (swap network will have activated it after step 1).
            {
                unitId: player.id,
                abilityId: IMBUED_BAT_ABILITY_ID,
                targets: [{ type: 'pixel' as const, position: { x: dummy.x, y: dummy.y } }],
            },
        ];
    },

    assertPass(engine) {
        const player = engine.getLocalPlayerUnit();
        const dummy = engine.getUnit('imbue_dummy');
        if (!player || !dummy) return false;
        // Dummy must have taken at least some damage (primary swing is 10 base).
        if (dummy.hp >= dummy.maxHp) return false;
        // After Imbued Bat exhausts, Swing Bat returns to its original bar slot.
        return player.abilities.indexOf(SWING_BAT_ABILITY_ID) === SWING_BAT_INITIAL_SLOT;
    },

    failureMessage(engine) {
        const player = engine.getLocalPlayerUnit();
        const dummy = engine.getUnit('imbue_dummy');
        if (!dummy) return 'Target dummy was removed from the engine.';
        if (!player) return 'Player unit was removed from the engine.';
        if (dummy.hp >= dummy.maxHp) {
            return `Dummy took no damage (hp=${dummy.hp}/${dummy.maxHp}). Gather Light may not have applied the imbue buff, the swap did not fire, or Imbued Bat did not connect.`;
        }
        if (player.abilities.indexOf(SWING_BAT_ABILITY_ID) !== SWING_BAT_INITIAL_SLOT) {
            return `Swing Bat is not in its original bar slot after the full cast (index=${player.abilities.indexOf(SWING_BAT_ABILITY_ID)}, expected=${SWING_BAT_INITIAL_SLOT}).`;
        }
        return 'Scenario failed for an unknown reason.';
    },

    describeState(engine) {
        const dummy  = engine.getUnit('imbue_dummy');
        const player = engine.getLocalPlayerUnit();
        const r0803  = player?.abilityRuntime[IMBUED_BAT_ABILITY_ID];
        const r0115  = player?.abilityRuntime[SWING_BAT_ABILITY_ID];
        const r0804  = player?.abilityRuntime[GATHER_LIGHT_ABILITY_ID];
        return [
            `dummy: hp=${dummy ? `${dummy.hp}/${dummy.maxHp}` : 'gone'}`,
            `0115 active=${r0115?.active} uses=${r0115?.currentUses}`,
            `0804 active=${r0804?.active} uses=${r0804?.currentUses}`,
            `0803 active=${r0803?.active} uses=${r0803?.currentUses} replacedId=${r0803?.replacedAbilityId}`,
        ].join(' | ');
    },
};
