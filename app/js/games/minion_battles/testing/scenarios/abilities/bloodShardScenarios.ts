/**
 * Blood Shard (0304) + Blood Splinters research committed-run E2E contract. See
 * `card_defs/03_blood_mage/AGENTS.md` for the design intent.
 *
 * Caster at (100, 200) aims Blood Shard at a dummy 150px to the right. A bleeding enemy (6 stacks)
 * stands off to the side of the throw line, in range: it bursts a splinter that damages it, eats 4
 * of its bleed stacks, then flies to the dummy. The dummy takes the main shard plus the splinter.
 */

import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    placePlayerAndDummy,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import { applyBleedStack } from '../../../buffs/bleedRuntime';
import { BleedBuff } from '../../../buffs/BleedBuff';
import {
    BLOOD_MAGE_NODE_SPLINTERS,
    BLOOD_MAGE_TREE_ID,
} from '../../../../../researchTrees/trees/blood_mage';
import {
    BLOOD_SHARD_DAMAGE,
    BLOOD_SHARD_PROFILE,
    BLOOD_SPLINTER_BLEED_CONSUMED,
    BLOOD_SPLINTER_FLIGHT_DAMAGE,
    BLOOD_SPLINTER_HOST_DAMAGE,
    BloodShardAbility_0304,
} from '../../../card_defs/03_blood_mage/0304_BloodShard/0304Ability';

const P = TINY_BATTLE_PLAYER_ID;
const SHARD_ID = BloodShardAbility_0304.id;

const CASTER_POS = { x: 100, y: 200 };
const DUMMY_POS = { x: 250, y: 200 };
// Off the throw line (90px below it) but within Blood Shard's range of the caster.
const HOST_POS = { x: 160, y: 290 };
const START_HP = 100;
const START_STACKS = 6;
const HOST_ID = 'splinter_host';

// Release, then the main shard (150px) and the splinter (~127px) fly at Blood Shard speed.
const CHECK_TIME = BLOOD_SHARD_PROFILE.windupEnd + 0.25;

/**
 * The first bleed round-milestone tick lands before the shard releases, so the host's hp and stacks
 * are sampled on the last tick before release and the splinter's effect is asserted as a delta.
 */
let beforeRelease: { hp: number; stacks: number } | null = null;

function stacksOf(engine: { getUnit(id: string): { buffs: unknown[] } | undefined }, id: string): number {
    const bleed = engine.getUnit(id)?.buffs.find((b): b is BleedBuff => b instanceof BleedBuff);
    return bleed?.stacks ?? 0;
}

export const bloodShardSplintersScenario: ScenarioDefinition = {
    id: 'blood_shard_splinters_e2e',
    title: 'Blood Shard (0304) with Blood Splinters: a bleeding enemy bursts a shard that hits the target',
    category: 'ability',
    maxDurationMs: 4000,

    buildEngine() {
        beforeRelease = null;
        const research = { [P]: { [BLOOD_MAGE_TREE_ID]: [BLOOD_MAGE_NODE_SPLINTERS] } };
        const engine = buildTinyBattleEngine({
            gridW: 16,
            gridH: 10,
            localPlayerId: P,
            grass: true,
            playerResearchTreesByPlayer: research,
        });
        const { dummy } = placePlayerAndDummy(engine, {
            playerId: P,
            playerWorld: CASTER_POS,
            dummyWorld: DUMMY_POS,
            abilities: [SHARD_ID],
            playerResearchTreesByPlayer: research,
        });
        dummy.hp = START_HP;
        dummy.maxHp = START_HP;

        const host = createUnitFromSpawnConfig({
            id: HOST_ID, characterId: 'enemy_melee', name: 'Bleeding Host',
            x: HOST_POS.x, y: HOST_POS.y, teamId: 'enemy', ownerId: 'ai',
            hp: START_HP, unitAITreeId: 'static_test_no_ai',
        }, engine.eventBus);
        initializeAbilityRuntimeForUnit(host);
        engine.addUnit(host, 'initialGameSpawn');
        applyBleedStack(host, 0, 1, START_STACKS);
        return engine;
    },

    getInitialOrders(engine) {
        const caster = engine.getLocalPlayerUnit()!;
        return [{
            unitId: caster.id,
            abilityId: SHARD_ID,
            targets: [{ type: 'pixel' as const, position: DUMMY_POS }],
        }];
    },

    assertPass(engine) {
        const host = engine.getUnit(HOST_ID);
        const dummy = engine.getUnit('target_dummy');
        if (!host || !dummy) return false;
        if (engine.gameTime < BLOOD_SHARD_PROFILE.windupEnd - 0.05) {
            beforeRelease = { hp: host.hp, stacks: stacksOf(engine, HOST_ID) };
        }
        if (engine.gameTime < CHECK_TIME || !beforeRelease) return false;
        return (
            host.hp === beforeRelease.hp - BLOOD_SPLINTER_HOST_DAMAGE
            && stacksOf(engine, HOST_ID) === beforeRelease.stacks - BLOOD_SPLINTER_BLEED_CONSUMED
            && dummy.hp === START_HP - BLOOD_SHARD_DAMAGE - BLOOD_SPLINTER_FLIGHT_DAMAGE
        );
    },

    failureMessage(engine) {
        const host = engine.getUnit(HOST_ID);
        const dummy = engine.getUnit('target_dummy');
        return [
            `t=${engine.gameTime.toFixed(2)}s`,
            `host hp=${host?.hp} (expected ${(beforeRelease?.hp ?? NaN) - BLOOD_SPLINTER_HOST_DAMAGE})`,
            `host stacks=${stacksOf(engine, HOST_ID)} (expected ${(beforeRelease?.stacks ?? NaN) - BLOOD_SPLINTER_BLEED_CONSUMED})`,
            `dummy hp=${dummy?.hp} (expected ${START_HP - BLOOD_SHARD_DAMAGE - BLOOD_SPLINTER_FLIGHT_DAMAGE})`,
        ].join('; ');
    },
};
