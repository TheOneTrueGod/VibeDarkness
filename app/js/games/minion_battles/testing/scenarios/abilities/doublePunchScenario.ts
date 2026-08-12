/**
 * Double Punch death-fallback scenario.
 *
 * Verifies that punch2 still animates and hits when punch1 kills its target.
 *
 * Setup:
 *   - Player (warrior, Double Punch) at centre-left.
 *   - E1 directly in front, at punch range, with HP == PUNCH_DAMAGE (8) so punch1 kills it.
 *   - E2 at the exact same world position as E1, also with HP == PUNCH_DAMAGE.
 *   - Both punches target E1 via unit targeting.
 *
 * Expected:
 *   - Punch1 kills E1. The dead-target refresh pass downgrades the target entry from
 *     { type: 'unit', unitId: e1.id } to { type: 'pixel', position: e1's last position }.
 *   - Punch2 fires toward that pixel, hitting E2 (co-located) and killing it.
 *
 * Regression catch:
 *   Without the fix, punch2 resolves slide direction as {0,0} (caster's feet), so E2 survives.
 */

import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createTargetDummyAtWorld } from '../../fixtures/targetDummies';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import { UnitTag } from '../../../game/units/unitTag';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;
const PLAYER_POS = { x: 3 * CELL + CELL / 2, y: 2 * CELL + CELL / 2 };
// E1 and E2 sit 38px to the right of the player — inside punch MAX_RANGE (30px) + unit radius (20px) = 50px.
const ENEMY_POS = { x: PLAYER_POS.x + 38, y: PLAYER_POS.y };
// Must match PUNCH_DAMAGE in 0116Ability.ts so punch1 kills E1 in one shot.
const PUNCH_DAMAGE = 8;

export const doublePunchDeathFallbackScenario: ScenarioDefinition = {
    id: 'double_punch_death_fallback',
    title: 'Double Punch (0116): punch2 hits when punch1 kills its target',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine: () => {
        const engine = buildTinyBattleEngine({ gridW: 8, gridH: 6, localPlayerId: P, grass: true });

        spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: PLAYER_POS.x,
            y: PLAYER_POS.y,
            abilities: ['0116'],
        });

        // E1: dies from punch1 (HP == PUNCH_DAMAGE).
        // CrowdSpacingAnchor: keep E1/E2 co-located — soft packing would separate them before punch2.
        const e1 = createTargetDummyAtWorld(engine, ENEMY_POS.x, ENEMY_POS.y, {
            id: 'dp_e1',
            hp: PUNCH_DAMAGE,
        });
        e1.tags = [UnitTag.CrowdSpacingAnchor];
        initializeAbilityRuntimeForUnit(e1);
        engine.addUnit(e1, 'initialGameSpawn');

        // E2: co-located with E1; should die from punch2 when it fires at E1's last position.
        const e2 = createTargetDummyAtWorld(engine, ENEMY_POS.x, ENEMY_POS.y, {
            id: 'dp_e2',
            hp: PUNCH_DAMAGE,
        });
        e2.tags = [UnitTag.CrowdSpacingAnchor];
        initializeAbilityRuntimeForUnit(e2);
        engine.addUnit(e2, 'initialGameSpawn');

        return engine;
    },
    getInitialOrders: (engine) => {
        const player = engine.getLocalPlayerUnit()!;
        const e1 = engine.getUnit('dp_e1')!;
        // Target both punches at E1 via unit targeting.  When E1 dies, the
        // refreshActiveTargets pass converts both entries to pixel targets at E1's position.
        const t1 = { type: 'unit' as const, unitId: e1.id };
        return [
            {
                unitId: player.id,
                abilityId: '0116',
                targets: [t1, t1],
                targetsByLabel: { 'Target 1': t1, 'Target 2': t1 },
            },
        ];
    },
    assertPass: (engine) => {
        const e1 = engine.getUnit('dp_e1');
        const e2 = engine.getUnit('dp_e2');
        // Both enemies must be dead for the scenario to pass.
        // e1 is killed by punch1; e2 (co-located) is killed by punch2 hitting E1's last position.
        const e1Dead = !e1 || !e1.isAlive();
        const e2Dead = !e2 || !e2.isAlive();
        return e1Dead && e2Dead;
    },
    failureMessage: (engine) => {
        const e1 = engine.getUnit('dp_e1');
        const e2 = engine.getUnit('dp_e2');
        const e1Alive = e1 && e1.isAlive();
        const e2Alive = e2 && e2.isAlive();
        if (e1Alive && e2Alive) {
            return 'Both E1 and E2 survived — punch1 may not have fired or dealt no damage.';
        }
        if (e1Alive) {
            return `E1 survived (hp=${e1.hp}) — punch1 did not kill E1 as expected.`;
        }
        if (e2Alive) {
            return (
                `E2 survived (hp=${e2.hp}) — punch2 likely fired at the caster's position ` +
                `instead of E1's last known position (dead-target fallback bug).`
            );
        }
        return 'Unknown failure.';
    },
};
