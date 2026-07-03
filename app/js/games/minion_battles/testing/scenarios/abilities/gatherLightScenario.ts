/**
 * Gather Light (0804) committed-run E2E contract.
 *
 * Self-cast: after windup + active, player gains Light resource and caster tile
 * receives a permanent base-darkness offset of 1.
 */

import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { GATHER_LIGHT_AMOUNT } from '../../../card_defs/08_light_core/0804_GatherLight/0804Ability';
import { GATHER_LIGHT_DARKNESS_AMOUNT } from '../../../abilities/gatherLightHelpers';
import { Light } from '../../../resources/Light';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';

const P = TINY_BATTLE_PLAYER_ID;
const GATHER_LIGHT_ID = '0804';
const BASELINE_GLOBAL_LIGHT = 3;

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
            abilities: [GATHER_LIGHT_ID],
        });

        const light = new Light();
        player.attachResource(light, engine.eventBus);

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{
            unitId: player.id,
            abilityId: GATHER_LIGHT_ID,
            targets: [],
        }];
    },

    assertPass(engine) {
        const player = engine.getLocalPlayerUnit();
        if (!player) return false;

        const light = player.getResource('light');
        if (!light || light.current !== GATHER_LIGHT_AMOUNT) return false;

        const tileLevel = engine.getLightLevelAt(player.x, player.y);
        const expectedLevel = BASELINE_GLOBAL_LIGHT + GATHER_LIGHT_DARKNESS_AMOUNT;
        return tileLevel === expectedLevel;
    },

    failureMessage(engine) {
        const player = engine.getLocalPlayerUnit();
        const light = player?.getResource('light');
        const tileLevel = player ? engine.getLightLevelAt(player.x, player.y) : null;
        const expectedLevel = BASELINE_GLOBAL_LIGHT + GATHER_LIGHT_DARKNESS_AMOUNT;
        return [
            `light.current=${light?.current ?? 'missing'} (expected ${GATHER_LIGHT_AMOUNT})`,
            `caster tile light=${tileLevel} (expected ${expectedLevel})`,
        ].join('; ');
    },
};
