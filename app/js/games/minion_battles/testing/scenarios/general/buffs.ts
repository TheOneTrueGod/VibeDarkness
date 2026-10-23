import type { ScenarioDefinition } from '../../types';
import { BLEED_BUFF_TYPE } from '../../../buffs/BleedBuff';
import {
    buildTinyBattleEngine,
    placePlayerAndDummy,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import {
    NODE_JAGGED_EDGE,
    SWORD_TREE_ID,
    SWORD_ROOT_NODE_ID,
} from '../../../../../researchTrees/trees/weaponTreeIds';

const P = TINY_BATTLE_PLAYER_ID;

/** Swing Sword with Jagged Edge research applies bleed stacks on a melee hit. */
export const swingSwordAppliesBleedScenario: ScenarioDefinition = {
    id: 'buff_swing_sword_bleed',
    title: 'Swing Sword with Jagged Edge applies bleed debuff on hit',
    category: 'general',
    generalSection: 'Debuffs',
    maxDurationMs: 5000,
    buildEngine() {
        const research = { [P]: { [SWORD_TREE_ID]: [SWORD_ROOT_NODE_ID, NODE_JAGGED_EDGE] } };
        const engine = buildTinyBattleEngine({
            gridW: 14,
            gridH: 10,
            localPlayerId: P,
            grass: true,
            playerResearchTreesByPlayer: research,
        });
        placePlayerAndDummy(engine, {
            playerId: P,
            playerWorld: { x: 200, y: 220 },
            dummyWorld: { x: 280, y: 220 },
            abilities: ['0112'],
            playerResearchTreesByPlayer: research,
        });
        return engine;
    },
    getInitialOrders(engine) {
        const u = engine.getLocalPlayerUnit()!;
        const d = engine.getUnit('target_dummy')!;
        return [
            {
                unitId: u.id,
                abilityId: '0112',
                targets: [{ type: 'pixel', position: { x: d.x, y: d.y } }],
            },
        ];
    },
    assertPass(engine) {
        const d = engine.getUnit('target_dummy');
        return Boolean(d?.hasBuff(BLEED_BUFF_TYPE));
    },
    failureMessage(engine) {
        const d = engine.getUnit('target_dummy');
        const types = d?.buffs.map((b) => b._type).join(',') ?? '';
        return `dummy buffs=[${types}] hp=${d?.hp}`;
    },
};
