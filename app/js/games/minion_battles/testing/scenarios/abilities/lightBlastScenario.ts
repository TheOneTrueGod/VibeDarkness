/**
 * Light Blast (0801) committed-run E2E contract.
 *
 * Playahead-specific pause/inject timing is covered by engine tests (Scenarios G/H in
 * `interactiveTargeting.test.ts`). This scenario confirms the headless committed path still
 * damages an enemy dummy and plants a torch light source at the blast pixel.
 */

import type { ScenarioDefinition } from '../../types';
import { DarknessLevel } from '../../../game/darknessLevels';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createTargetDummyAtWorld } from '../../fixtures/targetDummies';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import { Light } from '../../../resources/Light';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';

const P = TINY_BATTLE_PLAYER_ID;
const LIGHT_BLAST_ID = '0801';
/** Matches `0801Ability` `resourceCost.amount`. */
const LIGHT_BLAST_LIGHT_COST = 2;
/** Matches `0801Ability` `LIGHT_BLAST_DAMAGE`. */
const LIGHT_BLAST_DAMAGE = 8;

export const lightBlastCommittedScenario: ScenarioDefinition = {
    id: 'light_blast_committed_e2e',
    title: 'Light Blast (0801): committed cast damages dummy and leaves torch light',
    category: 'ability',
    maxDurationMs: 6000,
    renderLighting: true,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 12, gridH: 10, localPlayerId: P, grass: true });
        engine.setMissionLightConfig(true, 0);

        const playerX = 5 * CELL_SIZE + CELL_SIZE / 2;
        const playerY = 5 * CELL_SIZE + CELL_SIZE / 2;
        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: playerX,
            y: playerY,
            abilities: [LIGHT_BLAST_ID],
        });

        const light = new Light();
        player.attachResource(light, engine.eventBus);
        light.add(LIGHT_BLAST_LIGHT_COST);

        const blastPixel = { x: playerX + 30, y: playerY };
        const dummy = createTargetDummyAtWorld(engine, blastPixel.x, blastPixel.y, {
            id: 'target_dummy',
            hp: 100,
        });
        initializeAbilityRuntimeForUnit(dummy);
        engine.addUnit(dummy, 'initialGameSpawn');

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        const dummy = engine.getUnit('target_dummy')!;
        const blastPixel = { x: dummy.x, y: dummy.y };
        return [{
            unitId: player.id,
            abilityId: LIGHT_BLAST_ID,
            targets: [{ type: 'pixel' as const, position: blastPixel }],
        }];
    },

    assertPass(engine) {
        const dummy = engine.getUnit('target_dummy');
        if (!dummy || dummy.maxHp - dummy.hp < LIGHT_BLAST_DAMAGE) return false;
        const level = engine.getLightLevelAt(dummy.x, dummy.y);
        return level !== null && level > DarknessLevel.FULL_DARKNESS;
    },

    failureMessage(engine) {
        const dummy = engine.getUnit('target_dummy');
        const lost = dummy ? dummy.maxHp - dummy.hp : 0;
        const level = dummy ? engine.getLightLevelAt(dummy.x, dummy.y) : null;
        return [
            `dummy lost ${lost} hp (expected ≥${LIGHT_BLAST_DAMAGE})`,
            `light level at blast=${level} (expected > ${DarknessLevel.FULL_DARKNESS})`,
        ].join('; ');
    },
};
