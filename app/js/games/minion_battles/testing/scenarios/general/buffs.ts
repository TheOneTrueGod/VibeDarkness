import type { ScenarioDefinition } from '../../types';
import { asCardDefId } from '../../../card_defs';
import { BLEED_BUFF_TYPE } from '../../../buffs/BleedBuff';
import {
    buildTinyBattleEngine,
    placePlayerAndDummy,
    seedHandWithAbilities,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';

/** Swing Sword applies bleed stacks on a melee hit. */
export const swingSwordAppliesBleedScenario: ScenarioDefinition = {
    id: 'buff_swing_sword_bleed',
    title: 'Swing Sword applies bleed debuff on hit',
    category: 'general',
    generalSection: 'Debuffs',
    maxDurationMs: 5000,
    buildEngine() {
        const engine = buildTinyBattleEngine({
            gridW: 14,
            gridH: 10,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });
        placePlayerAndDummy(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            playerWorld: { x: 200, y: 220 },
            dummyWorld: { x: 280, y: 220 },
            abilities: ['0112'],
        });
        seedHandWithAbilities(engine, TINY_BATTLE_PLAYER_ID, [{ cardDefId: asCardDefId('0112'), abilityId: '0112' }]);
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
