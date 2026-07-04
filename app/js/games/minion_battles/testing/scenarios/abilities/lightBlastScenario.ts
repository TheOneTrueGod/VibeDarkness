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
import { LIGHT_BLAST_DAMAGE, LIGHT_BLAST_MAX_RANGE, LIGHT_BLAST_MAX_TARGETS } from '../../../card_defs/08_light_core/0801_LightBlast/0801Ability';

const P = TINY_BATTLE_PLAYER_ID;
const LIGHT_BLAST_ID = '0801';
/** Matches `0801Ability` `resourceCost.amount`. */
const LIGHT_BLAST_LIGHT_COST = 1;

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

/** Click beyond max range clamps blast to range edge; dummy at click misses, dummy at clamp point is hit. */
export const lightBlastRangeCapScenario: ScenarioDefinition = {
    id: 'light_blast_range_cap_e2e',
    title: 'Light Blast (0801): out-of-range click clamps to max range',
    category: 'ability',
    maxDurationMs: 6000,
    renderLighting: true,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 20, gridH: 10, localPlayerId: P, grass: true });
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

        const clampedX = playerX + LIGHT_BLAST_MAX_RANGE;
        const beyondClickX = playerX + LIGHT_BLAST_MAX_RANGE + 120;

        const dummyAtClamp = createTargetDummyAtWorld(engine, clampedX, playerY, {
            id: 'dummy_at_clamp',
            hp: 100,
        });
        const dummyBeyond = createTargetDummyAtWorld(engine, beyondClickX, playerY, {
            id: 'dummy_beyond',
            hp: 100,
        });
        initializeAbilityRuntimeForUnit(dummyAtClamp);
        initializeAbilityRuntimeForUnit(dummyBeyond);
        engine.addUnit(dummyAtClamp, 'initialGameSpawn');
        engine.addUnit(dummyBeyond, 'initialGameSpawn');

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        const beyondDummy = engine.getUnit('dummy_beyond')!;
        return [{
            unitId: player.id,
            abilityId: LIGHT_BLAST_ID,
            targets: [{ type: 'pixel' as const, position: { x: beyondDummy.x, y: beyondDummy.y } }],
        }];
    },

    assertPass(engine) {
        const atClamp = engine.getUnit('dummy_at_clamp');
        const beyond = engine.getUnit('dummy_beyond');
        if (!atClamp || atClamp.maxHp - atClamp.hp < LIGHT_BLAST_DAMAGE) return false;
        if (!beyond || beyond.maxHp - beyond.hp > 0) return false;
        const level = engine.getLightLevelAt(atClamp.x, atClamp.y);
        return level !== null && level > DarknessLevel.FULL_DARKNESS;
    },

    failureMessage(engine) {
        const atClamp = engine.getUnit('dummy_at_clamp');
        const beyond = engine.getUnit('dummy_beyond');
        const clampLost = atClamp ? atClamp.maxHp - atClamp.hp : 0;
        const beyondLost = beyond ? beyond.maxHp - beyond.hp : 0;
        const level = atClamp ? engine.getLightLevelAt(atClamp.x, atClamp.y) : null;
        return [
            `dummy at clamp lost ${clampLost} hp (expected ≥${LIGHT_BLAST_DAMAGE})`,
            `dummy beyond lost ${beyondLost} hp (expected 0)`,
            `light at clamp=${level} (expected > ${DarknessLevel.FULL_DARKNESS})`,
        ].join('; ');
    },
};

/** Six enemies in blast radius; only the closest five take damage. */
export const lightBlastHitCapScenario: ScenarioDefinition = {
    id: 'light_blast_hit_cap_e2e',
    title: `Light Blast (0801): damages at most ${LIGHT_BLAST_MAX_TARGETS} enemies in blast`,
    category: 'ability',
    maxDurationMs: 6000,

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

        const blastX = playerX + 30;
        const blastY = playerY;
        for (let i = 0; i < LIGHT_BLAST_MAX_TARGETS + 1; i++) {
            const id = `dummy_${i}`;
            const dummy = createTargetDummyAtWorld(engine, blastX + i * 4, blastY, {
                id,
                hp: 100,
            });
            initializeAbilityRuntimeForUnit(dummy);
            engine.addUnit(dummy, 'initialGameSpawn');
        }

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        const firstDummy = engine.getUnit('dummy_0')!;
        return [{
            unitId: player.id,
            abilityId: LIGHT_BLAST_ID,
            targets: [{ type: 'pixel' as const, position: { x: firstDummy.x, y: firstDummy.y } }],
        }];
    },

    assertPass(engine) {
        let damagedCount = 0;
        let undamagedFar = true;
        for (let i = 0; i < LIGHT_BLAST_MAX_TARGETS + 1; i++) {
            const dummy = engine.getUnit(`dummy_${i}`);
            if (!dummy) return false;
            const lost = dummy.maxHp - dummy.hp;
            if (lost >= LIGHT_BLAST_DAMAGE) damagedCount++;
            if (i === LIGHT_BLAST_MAX_TARGETS && lost > 0) undamagedFar = false;
        }
        return damagedCount === LIGHT_BLAST_MAX_TARGETS && undamagedFar;
    },

    failureMessage(engine) {
        const lines: string[] = [];
        for (let i = 0; i < LIGHT_BLAST_MAX_TARGETS + 1; i++) {
            const dummy = engine.getUnit(`dummy_${i}`);
            const lost = dummy ? dummy.maxHp - dummy.hp : -1;
            lines.push(`dummy_${i} lost ${lost} hp`);
        }
        return lines.join('; ');
    },
};
