import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createTargetDummyAtWorld } from '../../fixtures/targetDummies';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';

const P = TINY_BATTLE_PLAYER_ID;

/**
 * BeastClaw hits targets inside the front quad and misses targets behind the caster.
 *
 * Caster at (200, 200), targeting (300, 200) (far right, beyond max range).
 * BOX_SIZE=28, REACH=10, caster radius=20:
 *   box centre at 200 + 20 + min(10+20, large) = 200 + 20 + 30 = 250
 *   box spans x: 236–264, y: 186–214
 * Dummy A at (250, 200) — inside the quad → should take damage from both swings.
 * Dummy B at (150, 200) — behind the caster → should NOT take damage.
 */
export const beastClawFrontHitBackMissScenario: ScenarioDefinition = {
    id: 'beast_claw_front_hit_back_miss',
    title: 'Beast Claw: dummy in front quad takes damage; dummy behind caster does not',
    category: 'ability',
    maxDurationMs: 5000,

    buildEngine() {
        const engine = buildTinyBattleEngine({
            gridW: 14,
            gridH: 12,
            localPlayerId: P,
            grass: true,
        });

        spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: 200,
            y: 200,
            abilities: ['0611'],
        });

        // Front dummy — inside the claw quad when targeting (300, 200).
        const frontDummy = createTargetDummyAtWorld(engine, 250, 200, { id: 'dummy_front', hp: 500 });
        initializeAbilityRuntimeForUnit(frontDummy);
        engine.addUnit(frontDummy, 'initialGameSpawn');

        // Back dummy — behind the caster, should never be reached.
        const backDummy = createTargetDummyAtWorld(engine, 150, 200, { id: 'dummy_back', hp: 500 });
        initializeAbilityRuntimeForUnit(backDummy);
        engine.addUnit(backDummy, 'initialGameSpawn');

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{
            unitId: player.id,
            abilityId: '0611',
            targets: [{ type: 'pixel', position: { x: 300, y: 200 } }],
        }];
    },

    assertPass(engine) {
        const front = engine.getUnit('dummy_front');
        const back = engine.getUnit('dummy_back');
        // Front dummy must have taken damage; back dummy must be untouched.
        return Boolean(front && front.hp < front.maxHp) &&
               Boolean(back && back.hp === back.maxHp);
    },

    failureMessage(engine) {
        const front = engine.getUnit('dummy_front');
        const back = engine.getUnit('dummy_back');
        return `front hp=${front?.hp}/${front?.maxHp} (expected <max), back hp=${back?.hp}/${back?.maxHp} (expected ==max)`;
    },
};
