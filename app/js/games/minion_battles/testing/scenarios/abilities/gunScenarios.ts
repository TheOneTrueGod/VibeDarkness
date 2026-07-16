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

/**
 * Caster at (80, 200). Dummy at (230, 200) — 150px away, well within SMG max range (380px).
 * Single 'Spray direction' target aimed at the dummy. Assert the dummy takes damage from the
 * 8-shot spray by scenario end.
 *
 * Covers the single-target spray path (perShotTargets=false, numShots=8) and the tick-crossing
 * dispatch firing multiple shots from one behaviour across the spray window — distinct from
 * Pistol's perShotTargets=true, single-shot-per-target path.
 */
export const smgHitsDummyScenario: ScenarioDefinition = {
    id: 'smg_hits_dummy',
    title: 'SMG: dummy at mid range takes damage from the spray',
    category: 'ability',
    maxDurationMs: 5000,

    buildEngine() {
        const engine = buildTinyBattleEngine({
            gridW: 12,
            gridH: 8,
            localPlayerId: P,
            grass: true,
        });

        const unit = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: 80,
            y: 200,
            abilities: ['0204'],
        });
        unit.attachResource(new Ammo(), engine.eventBus);

        const dummy = createTargetDummyAtWorld(engine, 230, 200, { id: 'gun_dummy', hp: 100 });
        initializeAbilityRuntimeForUnit(dummy);
        engine.addUnit(dummy, 'initialGameSpawn');

        return engine;
    },

    getInitialOrders(engine) {
        const u = engine.getLocalPlayerUnit()!;
        const d = engine.getUnit('gun_dummy')!;
        return [
            {
                unitId: u.id,
                abilityId: '0204',
                targets: [{ type: 'pixel' as const, position: { x: d.x, y: d.y } }],
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

/**
 * Caster at (80, 200). Dummy at (140, 200) — 60px away, well within Shotgun max range (224px).
 * Kept tight (not just "close range" flavour) so the pellet cone's worst-case lateral spread
 * at the dummy's distance stays inside its hit radius — at 100px+ enough of the 6-pellet cone's
 * spread falls outside a small dummy's hitbox that the deterministic seed misses entirely.
 * Single 'Blast direction' target aimed at the dummy. Assert the dummy takes damage from at
 * least one of the 6 simultaneous pellets by scenario end.
 *
 * Covers the pelletsPerShot path (6 pellets fired together from one firing event) plus
 * pelletSpeedVariation (per-pellet randomized speed via engine.generateRandomInteger) —
 * distinct from Pistol/SMG's single-pellet-per-shot path.
 */
export const shotgunHitsDummyScenario: ScenarioDefinition = {
    id: 'shotgun_hits_dummy',
    title: 'Shotgun: dummy at close range takes damage from the pellet blast',
    category: 'ability',
    maxDurationMs: 5000,

    buildEngine() {
        const engine = buildTinyBattleEngine({
            gridW: 10,
            gridH: 8,
            localPlayerId: P,
            grass: true,
        });

        const unit = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: 80,
            y: 200,
            abilities: ['0205'],
        });
        unit.attachResource(new Ammo(), engine.eventBus);

        const dummy = createTargetDummyAtWorld(engine, 140, 200, { id: 'gun_dummy', hp: 100 });
        initializeAbilityRuntimeForUnit(dummy);
        engine.addUnit(dummy, 'initialGameSpawn');

        return engine;
    },

    getInitialOrders(engine) {
        const u = engine.getLocalPlayerUnit()!;
        const d = engine.getUnit('gun_dummy')!;
        return [
            {
                unitId: u.id,
                abilityId: '0205',
                targets: [{ type: 'pixel' as const, position: { x: d.x, y: d.y } }],
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
