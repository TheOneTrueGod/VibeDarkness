/**
 * Gather Light (0804) committed-run E2E contract.
 *
 * Self-cast: after windup + active, player gains Light resource and 10 random tiles in the 5×5 around
 * the caster each receive permanent base darkness of −(GATHER_LIGHT_DARKNESS_PER_LIGHT_GAINED × Light gained).
 */

import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import {
    GATHER_LIGHT_ABILITY_ID,
    GATHER_LIGHT_AMOUNT,
    GATHER_LIGHT_DEVOUR_BONUS,
    getGatherLightDarknessAmount,
} from '../../../card_defs/08_light_core/0804_GatherLight/0804Constants';
import { GATHER_LIGHT_DARKNESS_RADIUS, GATHER_LIGHT_TILE_COUNT } from '../../../abilities/gatherLightHelpers';
import { Light } from '../../../resources/Light';
import { LightSource } from '../../../game/lightSources/LightSource';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';

const P = TINY_BATTLE_PLAYER_ID;
const BASELINE_GLOBAL_LIGHT = 3;
const EXPECTED_DARKNESS_AMOUNT = getGatherLightDarknessAmount(GATHER_LIGHT_AMOUNT);

export const gatherLightCommittedScenario: ScenarioDefinition = {
    id: 'gather_light_committed_e2e',
    title: 'Gather Light (0804): grants Light and darkens 10 nearby tiles',
    category: 'ability',
    maxDurationMs: 4000,
    renderLighting: true,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 12, gridH: 10, localPlayerId: P, grass: true });
        engine.setMissionLightConfig(true, BASELINE_GLOBAL_LIGHT);

        const playerX = 5 * CELL_SIZE + CELL_SIZE / 2;
        const playerY = 5 * CELL_SIZE + CELL_SIZE / 2;
        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: playerX,
            y: playerY,
            abilities: [GATHER_LIGHT_ABILITY_ID],
        });

        const light = new Light();
        player.attachResource(light, engine.eventBus);

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{
            unitId: player.id,
            abilityId: GATHER_LIGHT_ABILITY_ID,
            targets: [],
        }];
    },

    assertPass(engine) {
        const player = engine.getLocalPlayerUnit();
        if (!player) return false;

        const light = player.getResource('light');
        if (!light || light.current !== GATHER_LIGHT_AMOUNT) return false;

        // Check the spawned darkness source directly rather than the displayed tile light level:
        // LightGrid eases toward its target by 10% of the remaining delta per light-tick
        // (GameEngine.runLightGameTick, ~6 ticks/s), which takes several real seconds to fully
        // converge — far longer than this scenario needs to run to prove the ability spawned the
        // right sources (one radius-0 source per chosen tile).
        const darknessSources = engine.lightSources.filter(
            (ls) => ls.active && ls.overlapMethod?.method === 'base' && ls.lightAmount < 0,
        );
        if (darknessSources.length !== GATHER_LIGHT_TILE_COUNT) return false;
        return darknessSources.every(
            (s) => s.lightAmount === EXPECTED_DARKNESS_AMOUNT && s.radius === GATHER_LIGHT_DARKNESS_RADIUS,
        );
    },

    failureMessage(engine) {
        const player = engine.getLocalPlayerUnit();
        const light = player?.getResource('light');
        const darknessSources = engine.lightSources.filter(
            (ls) => ls.active && ls.overlapMethod?.method === 'base' && ls.lightAmount < 0,
        );
        return [
            `light.current=${light?.current ?? 'missing'} (expected ${GATHER_LIGHT_AMOUNT})`,
            `darkness sources=${darknessSources.length} (expected ${GATHER_LIGHT_TILE_COUNT})`,
            ...darknessSources.map(
                (s) => `source amount=${s.lightAmount} radius=${s.radius} (expected ${EXPECTED_DARKNESS_AMOUNT}/${GATHER_LIGHT_DARKNESS_RADIUS})`,
            ),
        ].join('; ');
    },
};

const DEVOUR_SEED_ID = 'devour_seed_source';
const CASTER_X = 5 * CELL_SIZE + CELL_SIZE / 2;
const CASTER_Y = 5 * CELL_SIZE + CELL_SIZE / 2;

function buildDevourEngine(seedEmitter: boolean) {
    const engine = buildTinyBattleEngine({ gridW: 12, gridH: 10, localPlayerId: P, grass: true });
    engine.setMissionLightConfig(true, BASELINE_GLOBAL_LIGHT);

    const player = spawnTinyPlayerUnit(engine, {
        playerId: P,
        x: CASTER_X,
        y: CASTER_Y,
        abilities: [GATHER_LIGHT_ABILITY_ID],
    });
    player.attachResource(new Light(), engine.eventBus);

    if (seedEmitter) {
        // Positive emitter one tile away: inside Devour's 4x4-tile square around the caster.
        engine.addLightSource(new LightSource({
            id: DEVOUR_SEED_ID,
            x: CASTER_X + CELL_SIZE,
            y: CASTER_Y,
            lightAmount: 4,
            radius: 2,
            decay: { roundCreated: 0, initialLightAmount: 4, initialRadius: 2, roundsTotal: 1000 },
        }));
    }
    return engine;
}

function gatherLightOrders(engine: ReturnType<typeof buildTinyBattleEngine>) {
    const player = engine.getLocalPlayerUnit()!;
    return [{ unitId: player.id, abilityId: GATHER_LIGHT_ABILITY_ID, targets: [] }];
}

/** Positive emitters other than the seeded one — i.e. the bright source Gather Light drops at the caster. */
function countGatherSpawnedBrightSources(engine: ReturnType<typeof buildTinyBattleEngine>): number {
    return engine.lightSources.filter(
        (ls) => ls.active && ls.id !== DEVOUR_SEED_ID && ls.lightAmount > 0 && ls.overlapMethod?.method !== 'base',
    ).length;
}

function devourSeedActive(engine: ReturnType<typeof buildTinyBattleEngine>): boolean {
    return engine.lightSources.some((ls) => ls.id === DEVOUR_SEED_ID && ls.active);
}

export const gatherLightDevourScenario: ScenarioDefinition = {
    id: 'gather_light_devour_e2e',
    title: 'Gather Light (0804): Devour Light 1 eats a nearby emitter for +1 Light',
    category: 'ability',
    maxDurationMs: 4000,
    renderLighting: true,

    buildEngine: () => buildDevourEngine(true),
    getInitialOrders: gatherLightOrders,

    assertPass(engine) {
        const light = engine.getLocalPlayerUnit()?.getResource('light');
        if (!light || light.current !== GATHER_LIGHT_AMOUNT + GATHER_LIGHT_DEVOUR_BONUS) return false;
        if (devourSeedActive(engine)) return false;
        // Devour resolves before Gather Light drops its own bright source, so that source must survive.
        return countGatherSpawnedBrightSources(engine) >= 1;
    },

    failureMessage(engine) {
        const light = engine.getLocalPlayerUnit()?.getResource('light');
        return [
            `light.current=${light?.current ?? 'missing'} (expected ${GATHER_LIGHT_AMOUNT + GATHER_LIGHT_DEVOUR_BONUS})`,
            `seed active=${devourSeedActive(engine)} (expected false)`,
            `gather-spawned bright sources=${countGatherSpawnedBrightSources(engine)} (expected >= 1)`,
        ].join('; ');
    },
};

export const gatherLightNoDevourScenario: ScenarioDefinition = {
    id: 'gather_light_no_devour_e2e',
    title: 'Gather Light (0804): Devour Light 1 with no nearby emitter grants base Light only',
    category: 'ability',
    maxDurationMs: 4000,
    renderLighting: true,

    buildEngine: () => buildDevourEngine(false),
    getInitialOrders: gatherLightOrders,

    assertPass(engine) {
        const light = engine.getLocalPlayerUnit()?.getResource('light');
        if (!light || light.current !== GATHER_LIGHT_AMOUNT) return false;
        return countGatherSpawnedBrightSources(engine) >= 1;
    },

    failureMessage(engine) {
        const light = engine.getLocalPlayerUnit()?.getResource('light');
        return [
            `light.current=${light?.current ?? 'missing'} (expected ${GATHER_LIGHT_AMOUNT})`,
            `gather-spawned bright sources=${countGatherSpawnedBrightSources(engine)} (expected >= 1)`,
        ].join('; ');
    },
};
