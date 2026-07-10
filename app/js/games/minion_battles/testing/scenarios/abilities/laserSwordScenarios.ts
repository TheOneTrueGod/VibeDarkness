import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createTargetDummyAtWorld } from '../../fixtures/targetDummies';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';

const P = TINY_BATTLE_PLAYER_ID;

export const laserSwordHitsTwoTargetsScenario: ScenarioDefinition = {
    id: 'laser_sword_hits_two_targets',
    title: 'Laser Sword hits up to two enemies from a spread of three',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine() {
        const engine = buildTinyBattleEngine({
            gridW: 18,
            gridH: 14,
            localPlayerId: P,
            grass: true,
        });
        spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: 200,
            y: 260,
            abilities: ['0105'],
        });
        for (let i = 0; i < 3; i++) {
            const y = 200 + i * 60;
            const du = createTargetDummyAtWorld(engine, 280, y, { id: `target_dummy_${i}`, hp: 400 });
            initializeAbilityRuntimeForUnit(du);
            engine.addUnit(du, 'initialGameSpawn');
        }
        return engine;
    },
    getInitialOrders(engine) {
        const u = engine.getLocalPlayerUnit()!;
        return [{ unitId: u.id, abilityId: '0105', targets: [{ type: 'pixel', position: { x: 280, y: 260 } }] }];
    },
    assertPass(engine) {
        const hurt = engine.units.filter((u) => u.teamId === 'enemy' && u.isAlive() && u.hp < u.maxHp);
        return hurt.length === 2;
    },
    failureMessage(engine) {
        const hurt = engine.units.filter((u) => u.teamId === 'enemy' && u.isAlive() && u.hp < u.maxHp);
        return `enemies damaged=${hurt.length} (expected exactly 2)`;
    },
};
