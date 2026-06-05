import type { ScenarioDefinition } from '../../types';
import { asCardDefId } from '../../../card_defs';
import {
    buildTinyBattleEngine,
    seedHandWithAbilities,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createTargetDummyAtWorld } from '../../fixtures/targetDummies';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';

const P = TINY_BATTLE_PLAYER_ID;

/**
 * Spawn positions for the 4 dummies.
 * Caster at (235, 260), targeting (280, 260) — distance equals maxRange (45px).
 * Perpendicular bar: center (280, 260), endpoints (280, 220)-(280, 300).
 * Three dummies at x=280 within the bar; one far below (outside bar).
 */
const DUMMY_POSITIONS = [
    { x: 280, y: 240 },
    { x: 280, y: 260 },
    { x: 280, y: 280 },
    { x: 280, y: 360 }, // outside the bar — should NOT be hit
] as const;

export const swingBatHitsThreeTargetsScenario: ScenarioDefinition = {
    id: 'swing_bat_hits_three_targets',
    title: 'Swing Bat hits 3 out of 4 target dummies and deals damage with knockback',
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
            x: 235,
            y: 260,
            abilities: ['0115'],
        });
        for (let i = 0; i < DUMMY_POSITIONS.length; i++) {
            const { x, y } = DUMMY_POSITIONS[i];
            const du = createTargetDummyAtWorld(engine, x, y, { id: `target_dummy_${i}`, hp: 400 });
            initializeAbilityRuntimeForUnit(du);
            engine.addUnit(du, 'initialGameSpawn');
        }
        seedHandWithAbilities(engine, P, [{ cardDefId: asCardDefId('0115'), abilityId: '0115' }]);
        return engine;
    },

    getInitialOrders(engine) {
        const u = engine.getLocalPlayerUnit()!;
        return [{ unitId: u.id, abilityId: '0115', targets: [{ type: 'pixel', position: { x: 280, y: 260 } }] }];
    },

    assertPass(engine) {
        const hurt = engine.units.filter(u => u.teamId === 'enemy' && u.isAlive() && u.hp < u.maxHp);
        if (hurt.length !== 3) return false;
        return hurt.every(u => u.knockback !== null);
    },

    failureMessage(engine) {
        const hurt = engine.units.filter(u => u.teamId === 'enemy' && u.isAlive() && u.hp < u.maxHp);
        const knockedBack = hurt.filter(u => u.knockback !== null);
        return `enemies damaged=${hurt.length} (expected 3), with active knockback=${knockedBack.length} (expected 3)`;
    },

    describeState(engine) {
        return engine.units
            .filter(u => u.teamId === 'enemy')
            .map(u => `[${u.id}] hp=${u.hp}/${u.maxHp} pos=(${Math.round(u.x)},${Math.round(u.y)}) kb=${u.knockback !== null}`)
            .join('\n');
    },
};
