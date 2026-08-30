/**
 * Strict lock-on / priority-fill AbilityTests.
 *
 * Second scenarios beyond the primary per-ability E2E are required here: the primary
 * scenarios cover happy-path damage, while these assert commit → leave shape → fill.
 * Units are placed at impact positions from t=0 with commit IDs already in order.targets
 * (equivalent to leaving between aim and resolve without mid-cast teleport).
 */

import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createTargetDummyAtWorld } from '../../fixtures/targetDummies';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import { Gravity } from '../../../resources/Gravity';
import { Light } from '../../../resources/Light';
import { LIFTED_BUFF_TYPE } from '../../../buffs/liftedBuffType';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import {
    GRAVITY_INVERSION_AOE_RADIUS,
    GRAVITY_INVERSION_GRAVITY_COST,
    GRAVITY_INVERSION_PREFIRE_TIME,
} from '../../../card_defs/09_gravity_core/gravityConstants';
import {
    LIGHT_BLAST_DAMAGE,
    LIGHT_BLAST_RADIUS,
} from '../../../card_defs/08_light_core/0801_LightBlast/0801Ability';
import { ENERGY_BLAST_EXPLOSION_DAMAGE } from '../../../card_defs/0114_EnergyBlast/0114Ability';
import { LIGHT_CONE_DAMAGE } from '../../../card_defs/08_light_core/0803_ImbuedBat/0803Ability';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = CELL_SIZE;

function addDummy(
    engine: ReturnType<typeof buildTinyBattleEngine>,
    id: string,
    x: number,
    y: number,
    hp = 200,
) {
    const dummy = createTargetDummyAtWorld(engine, x, y, { id, hp });
    initializeAbilityRuntimeForUnit(dummy);
    engine.addUnit(dummy, 'initialGameSpawn');
    return dummy;
}

/** Lift: committed leaver outside AoE is skipped; remaining committed + newcomer fill. */
export const liftStrictPriorityFillScenario: ScenarioDefinition = {
    id: 'lift_strict_priority_fill_e2e',
    title: 'Lift (0903): strict fill prefers remaining committed, drops leavers',
    category: 'ability',
    maxDurationMs: 4000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 12, gridH: 8, localPlayerId: P, grass: true });
        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: 2 * CELL + CELL / 2,
            y: 4 * CELL + CELL / 2,
            abilities: ['0903'],
        });
        const gravity = new Gravity();
        player.attachResource(gravity, engine.eventBus);
        gravity.add(GRAVITY_INVERSION_GRAVITY_COST + 5);

        const aim = { x: 6 * CELL + CELL / 2, y: 4 * CELL + CELL / 2 };
        // Leaver: committed but already outside AoE at impact.
        addDummy(engine, 'lift_leaver', aim.x + GRAVITY_INVERSION_AOE_RADIUS + 40, aim.y);
        addDummy(engine, 'lift_stayer', aim.x, aim.y);
        addDummy(engine, 'lift_newcomer', aim.x + 20, aim.y);

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        const aim = {
            x: engine.getUnit('lift_stayer')!.x,
            y: engine.getUnit('lift_stayer')!.y,
        };
        return [{
            unitId: player.id,
            abilityId: '0903',
            targets: [
                { type: 'unit', unitId: 'lift_leaver', lockRole: 'primary' },
                { type: 'unit', unitId: 'lift_stayer', lockRole: 'primary' },
                { type: 'pixel', position: aim },
            ],
        }];
    },

    assertPass(engine) {
        if (engine.gameTime < GRAVITY_INVERSION_PREFIRE_TIME + 0.05) return false;
        const leaver = engine.getUnit('lift_leaver');
        const stayer = engine.getUnit('lift_stayer');
        const newcomer = engine.getUnit('lift_newcomer');
        if (!leaver || !stayer || !newcomer) return false;
        return !leaver.hasBuff(LIFTED_BUFF_TYPE)
            && stayer.hasBuff(LIFTED_BUFF_TYPE)
            && newcomer.hasBuff(LIFTED_BUFF_TYPE);
    },

    failureMessage(engine) {
        const ids = ['lift_leaver', 'lift_stayer', 'lift_newcomer'] as const;
        return ids.map((id) => {
            const u = engine.getUnit(id);
            return `${id}: lifted=${u?.hasBuff(LIFTED_BUFF_TYPE) ?? false}`;
        }).join('; ');
    },
};

/** Light Blast: same priority-fill idea for enemy damage. */
export const lightBlastStrictPriorityFillScenario: ScenarioDefinition = {
    id: 'light_blast_strict_priority_fill_e2e',
    title: 'Light Blast (0801): strict fill drops leavers, damages newcomer',
    category: 'ability',
    maxDurationMs: 4000,
    renderLighting: true,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 12, gridH: 8, localPlayerId: P, grass: true });
        engine.setMissionLightConfig(true, 0);
        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: 2 * CELL + CELL / 2,
            y: 4 * CELL + CELL / 2,
            abilities: ['0801'],
        });
        const light = new Light();
        player.attachResource(light, engine.eventBus);
        light.add(2);

        const aim = { x: 5 * CELL + CELL / 2, y: 4 * CELL + CELL / 2 };
        addDummy(engine, 'lb_leaver', aim.x + LIGHT_BLAST_RADIUS + 40, aim.y);
        addDummy(engine, 'lb_stayer', aim.x, aim.y);
        addDummy(engine, 'lb_newcomer', aim.x + 15, aim.y);
        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        const aim = {
            x: engine.getUnit('lb_stayer')!.x,
            y: engine.getUnit('lb_stayer')!.y,
        };
        return [{
            unitId: player.id,
            abilityId: '0801',
            targets: [
                { type: 'unit', unitId: 'lb_leaver', lockRole: 'primary' },
                { type: 'unit', unitId: 'lb_stayer', lockRole: 'primary' },
                { type: 'pixel', position: aim },
            ],
        }];
    },

    assertPass(engine) {
        const leaver = engine.getUnit('lb_leaver');
        const stayer = engine.getUnit('lb_stayer');
        const newcomer = engine.getUnit('lb_newcomer');
        if (!leaver || !stayer || !newcomer) return false;
        if (engine.gameTime < 0.45) return false;
        return leaver.hp === leaver.maxHp
            && stayer.maxHp - stayer.hp >= LIGHT_BLAST_DAMAGE
            && newcomer.maxHp - newcomer.hp >= LIGHT_BLAST_DAMAGE;
    },

    failureMessage(engine) {
        const fmt = (id: string) => {
            const u = engine.getUnit(id);
            return `${id} lost ${u ? u.maxHp - u.hp : '?'}`;
        };
        return [fmt('lb_leaver'), fmt('lb_stayer'), fmt('lb_newcomer')].join('; ');
    },
};

/**
 * Energy Blast: commit at aim; leaver outside blast at land is not damaged.
 * Keep the flight path clear (no dummy on the aim pixel) so the projectile reaches
 * the land point and the explosion resolves against the ring of enemies.
 */
export const energyBlastStrictPriorityFillScenario: ScenarioDefinition = {
    id: 'energy_blast_strict_priority_fill_e2e',
    title: 'Energy Blast (0114): explosion priority fill drops leavers',
    category: 'ability',
    maxDurationMs: 5000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 12, gridH: 8, localPlayerId: P, grass: true });
        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: 2 * CELL + CELL / 2,
            y: 4 * CELL + CELL / 2,
            abilities: ['0114'],
        });
        const rt = player.abilityRuntime['0114'];
        if (rt) {
            rt.currentUses = 1;
            rt.maxUses = 1;
        }

        const aim = { x: player.x + 80, y: player.y };
        // Offset off the flight line so the projectile does not collide early.
        addDummy(engine, 'eb_leaver', aim.x, aim.y + 80);
        addDummy(engine, 'eb_stayer', aim.x, aim.y + 20);
        addDummy(engine, 'eb_newcomer', aim.x, aim.y - 20);
        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        const aim = { x: player.x + 80, y: player.y };
        return [{
            unitId: player.id,
            abilityId: '0114',
            targets: [
                { type: 'unit', unitId: 'eb_leaver', lockRole: 'primary' },
                { type: 'unit', unitId: 'eb_stayer', lockRole: 'primary' },
                { type: 'pixel', position: aim },
            ],
        }];
    },

    assertPass(engine) {
        if (engine.gameTime < 0.5) return false;
        const leaver = engine.getUnit('eb_leaver');
        const stayer = engine.getUnit('eb_stayer');
        const newcomer = engine.getUnit('eb_newcomer');
        if (!leaver || !stayer || !newcomer) return false;
        return leaver.hp === leaver.maxHp
            && stayer.maxHp - stayer.hp >= ENERGY_BLAST_EXPLOSION_DAMAGE
            && newcomer.maxHp - newcomer.hp >= ENERGY_BLAST_EXPLOSION_DAMAGE;
    },

    failureMessage(engine) {
        const fmt = (id: string) => {
            const u = engine.getUnit(id);
            return `${id} lost ${u ? u.maxHp - u.hp : '?'}`;
        };
        return [fmt('eb_leaver'), fmt('eb_stayer'), fmt('eb_newcomer')].join('; ');
    },
};

/**
 * Imbued Bat: companion cone commit leaves cone → not cone-damaged.
 * Primary swing tether unchanged (melee still hits the swing target).
 */
export const imbuedBatConeStrictFillScenario: ScenarioDefinition = {
    id: 'imbued_bat_cone_strict_fill_e2e',
    title: 'Imbued Bat (0803): cone strict fill drops leavers; swing still hits',
    category: 'ability',
    maxDurationMs: 4000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 12, gridH: 10, localPlayerId: P, grass: true });
        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: 3 * CELL + CELL / 2,
            y: 5 * CELL + CELL / 2,
            abilities: ['0803'],
        });
        const rt = player.abilityRuntime['0803'];
        if (rt) {
            rt.currentUses = 1;
            rt.maxUses = 1;
        }

        // Primary in melee swing range.
        addDummy(engine, 'ib_swing', player.x + 35, player.y, 500);
        // Cone leaver far off-axis / out of cone; stayer ahead in the arc.
        addDummy(engine, 'ib_cone_leaver', player.x - 80, player.y + 80, 500);
        addDummy(engine, 'ib_cone_stayer', player.x + 70, player.y, 500);
        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        const swing = engine.getUnit('ib_swing')!;
        return [{
            unitId: player.id,
            abilityId: '0803',
            targets: [
                { type: 'unit', unitId: 'ib_swing', lockRole: 'primary' },
                { type: 'unit', unitId: 'ib_cone_leaver', lockRole: 'companion' },
                { type: 'unit', unitId: 'ib_cone_stayer', lockRole: 'companion' },
                { type: 'pixel', position: { x: swing.x, y: swing.y } },
            ],
        }];
    },

    assertPass(engine) {
        if (engine.gameTime < 0.35) return false;
        const swing = engine.getUnit('ib_swing');
        const leaver = engine.getUnit('ib_cone_leaver');
        const stayer = engine.getUnit('ib_cone_stayer');
        if (!swing || !leaver || !stayer) return false;
        // Swing must connect (primary damage). Cone leaver untouched; stayer took cone damage.
        const swingHit = swing.maxHp - swing.hp > 0;
        const leaverUntouched = leaver.hp === leaver.maxHp;
        const stayerCone = stayer.maxHp - stayer.hp >= LIGHT_CONE_DAMAGE;
        return swingHit && leaverUntouched && stayerCone;
    },

    failureMessage(engine) {
        const fmt = (id: string) => {
            const u = engine.getUnit(id);
            return `${id} lost ${u ? u.maxHp - u.hp : '?'}`;
        };
        return [fmt('ib_swing'), fmt('ib_cone_leaver'), fmt('ib_cone_stayer')].join('; ');
    },
};
