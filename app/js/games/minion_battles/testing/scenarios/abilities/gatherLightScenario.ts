/**
 * Gather Light (0804) committed-run E2E contract.
 *
 * Self-cast: after windup + active, player gains Light resource and the 3×3 around
 * the caster receives permanent base darkness of −(GATHER_LIGHT_DARKNESS_PER_LIGHT_GAINED × Light gained).
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
    getGatherLightDarknessAmount,
} from '../../../card_defs/08_light_core/0804_GatherLight/0804Constants';
import { GATHER_LIGHT_DARKNESS_RADIUS } from '../../../abilities/gatherLightHelpers';
import { Light } from '../../../resources/Light';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';

const P = TINY_BATTLE_PLAYER_ID;
const BASELINE_GLOBAL_LIGHT = 3;
const EXPECTED_DARKNESS_AMOUNT = getGatherLightDarknessAmount(GATHER_LIGHT_AMOUNT);

export const gatherLightCommittedScenario: ScenarioDefinition = {
    id: 'gather_light_committed_e2e',
    title: 'Gather Light (0804): grants Light and darkens caster tile',
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
        // right source. (One flat radius-1 source, not nine overlapping radius-0 sources — see
        // the comment in gatherLightHelpers.ts:applyGatherLightDarkness.)
        const darknessSources = engine.lightSources.filter(
            (ls) => ls.active && ls.overlapMethod?.method === 'base' && ls.lightAmount < 0,
        );
        if (darknessSources.length !== 1) return false;
        const [source] = darknessSources;
        return source.lightAmount === EXPECTED_DARKNESS_AMOUNT && source.radius === GATHER_LIGHT_DARKNESS_RADIUS;
    },

    failureMessage(engine) {
        const player = engine.getLocalPlayerUnit();
        const light = player?.getResource('light');
        const darknessSources = engine.lightSources.filter(
            (ls) => ls.active && ls.overlapMethod?.method === 'base' && ls.lightAmount < 0,
        );
        return [
            `light.current=${light?.current ?? 'missing'} (expected ${GATHER_LIGHT_AMOUNT})`,
            `darkness sources=${darknessSources.length} (expected 1)`,
            ...darknessSources.map(
                (s) => `source amount=${s.lightAmount} radius=${s.radius} (expected ${EXPECTED_DARKNESS_AMOUNT}/${GATHER_LIGHT_DARKNESS_RADIUS})`,
            ),
        ].join('; ');
    },
};
