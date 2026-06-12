import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createTargetDummyAtWorld } from '../../fixtures/targetDummies';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import { Ammo } from '../../../resources/Ammo';

const P = TINY_BATTLE_PLAYER_ID;

/**
 * Caster at (80, 200). Dummy at (280, 200) — 200px away, well within pistol max range (520px).
 * All 3 shots aimed at the dummy. At 1400 px/s the first projectile arrives ~0.14s after
 * launch (first shot fires at t=0.5s). Assert the dummy takes damage by scenario end.
 *
 * Covers the perShotTargets=true path (3 separate pixel targets) and the factory's
 * tick-crossing behaviour-driven shot dispatch.
 */
export const pistolHitsDummyScenario: ScenarioDefinition = {
    id: 'pistol_hits_dummy',
    title: 'Pistol: dummy at mid range takes damage from at least one shot',
    category: 'ability',
    maxDurationMs: 5000,

    buildEngine() {
        const engine = buildTinyBattleEngine({
            gridW: 14,
            gridH: 8,
            localPlayerId: P,
            grass: true,
        });

        const unit = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: 80,
            y: 200,
            abilities: ['0203'],
        });
        // Pistol requires ammo > 0 (allowPartialIfPositive). Attach Ammo resource.
        unit.attachResource(new Ammo(), engine.eventBus);

        const dummy = createTargetDummyAtWorld(engine, 280, 200, { id: 'gun_dummy', hp: 100 });
        initializeAbilityRuntimeForUnit(dummy);
        engine.addUnit(dummy, 'initialGameSpawn');

        return engine;
    },

    getInitialOrders(engine) {
        const u = engine.getLocalPlayerUnit()!;
        const d = engine.getUnit('gun_dummy')!;
        const aim = { type: 'pixel' as const, position: { x: d.x, y: d.y } };
        return [
            {
                unitId: u.id,
                abilityId: '0203',
                targets: [aim, aim, aim],
            },
        ];
    },

    assertPass(engine) {
        const d = engine.getUnit('gun_dummy');
        return d != null && d.hp < d.maxHp;
    },

    failureMessage(engine) {
        const d = engine.getUnit('gun_dummy');
        return d
            ? `dummy hp=${d.hp}/${d.maxHp} at gameTime=${engine.gameTime.toFixed(2)}`
            : 'dummy missing';
    },
};
