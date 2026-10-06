/**
 * Lay Hands (0806) E2E scenarios.
 *
 * Layout (cells are 40 px): the player stands at the centre. A punch dummy sits 35 px to the right,
 * inside punch reach. A light emitter sits 70 px to the left (inside the 5×5 reach square), with a
 * blast dummy 30 px below it (inside the blast radius, far from the punch dummy).
 */

import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createTargetDummyAtWorld } from '../../fixtures/targetDummies';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import { LightSource } from '../../../game/lightSources/LightSource';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import {
    LAY_HANDS_ABILITY_ID,
    LAY_HANDS_EXPLOSION_DAMAGE,
    LAY_HANDS_PUNCH_DAMAGE,
} from '../../../card_defs/08_light_core/0806_LayHands/0806Constants';

const P = TINY_BATTLE_PLAYER_ID;
const PLAYER = { x: 5 * CELL_SIZE + CELL_SIZE / 2, y: 5 * CELL_SIZE + CELL_SIZE / 2 };
const PUNCH_DUMMY_POS = { x: PLAYER.x + 35, y: PLAYER.y };
const EMITTER_POS = { x: PLAYER.x - 70, y: PLAYER.y };
const BLAST_DUMMY_POS = { x: EMITTER_POS.x, y: EMITTER_POS.y + 30 };
const EMITTER_ID = 'lay_hands_emitter';
const PUNCH_DUMMY_ID = 'lay_hands_punch_dummy';
const BLAST_DUMMY_ID = 'lay_hands_blast_dummy';
const DUMMY_HP = 500;

type Engine = ReturnType<typeof buildTinyBattleEngine>;

function buildEngine(options: { emitter: boolean; punchDummy: boolean }): Engine {
    const engine = buildTinyBattleEngine({ gridW: 12, gridH: 10, localPlayerId: P, grass: true });
    spawnTinyPlayerUnit(engine, {
        playerId: P,
        x: PLAYER.x,
        y: PLAYER.y,
        abilities: [LAY_HANDS_ABILITY_ID],
    });
    const addDummy = (id: string, pos: { x: number; y: number }) => {
        const dummy = createTargetDummyAtWorld(engine, pos.x, pos.y, { id, hp: DUMMY_HP });
        initializeAbilityRuntimeForUnit(dummy);
        engine.addUnit(dummy, 'initialGameSpawn');
    };
    if (options.punchDummy) addDummy(PUNCH_DUMMY_ID, PUNCH_DUMMY_POS);
    addDummy(BLAST_DUMMY_ID, BLAST_DUMMY_POS);
    if (options.emitter) {
        engine.addLightSource(new LightSource({
            id: EMITTER_ID,
            x: EMITTER_POS.x,
            y: EMITTER_POS.y,
            lightAmount: 4,
            radius: 2,
            decay: { roundCreated: 0, initialLightAmount: 4, initialRadius: 2, roundsTotal: 1000 },
        }));
    }
    return engine;
}

function lost(engine: Engine, id: string): number {
    const u = engine.getUnit(id);
    return u ? u.maxHp - u.hp : -1;
}

function emitterActive(engine: Engine): boolean {
    return engine.lightSources.some((ls) => ls.id === EMITTER_ID && ls.active);
}

function punchOrder(engine: Engine) {
    const player = engine.getLocalPlayerUnit()!;
    const dummy = engine.getUnit(PUNCH_DUMMY_ID)!;
    return [{
        unitId: player.id,
        abilityId: LAY_HANDS_ABILITY_ID,
        targets: [{ type: 'unit' as const, unitId: dummy.id }],
    }];
}

function describe(engine: Engine): string {
    return [
        `punch dummy lost=${lost(engine, PUNCH_DUMMY_ID)}`,
        `blast dummy lost=${lost(engine, BLAST_DUMMY_ID)}`,
        `emitter active=${emitterActive(engine)}`,
    ].join(' | ');
}

export const layHandsPunchAndBlastScenario: ScenarioDefinition = {
    id: 'lay_hands_punch_and_blast',
    title: 'Lay Hands (0806): punches the target and detonates the nearest light emitter',
    category: 'ability',
    maxDurationMs: 4000,
    buildEngine: () => buildEngine({ emitter: true, punchDummy: true }),
    getInitialOrders: punchOrder,
    assertPass: (engine) =>
        lost(engine, PUNCH_DUMMY_ID) === LAY_HANDS_PUNCH_DAMAGE
        && lost(engine, BLAST_DUMMY_ID) === LAY_HANDS_EXPLOSION_DAMAGE
        && !emitterActive(engine),
    failureMessage: (engine) =>
        `${describe(engine)} (expected punch=${LAY_HANDS_PUNCH_DAMAGE}, blast=${LAY_HANDS_EXPLOSION_DAMAGE}, emitter consumed)`,
    describeState: describe,
};

export const layHandsNoEmitterScenario: ScenarioDefinition = {
    id: 'lay_hands_no_emitter',
    title: 'Lay Hands (0806): with no emitter in reach it only punches',
    category: 'ability',
    maxDurationMs: 4000,
    buildEngine: () => buildEngine({ emitter: false, punchDummy: true }),
    getInitialOrders: punchOrder,
    assertPass: (engine) =>
        lost(engine, PUNCH_DUMMY_ID) === LAY_HANDS_PUNCH_DAMAGE && lost(engine, BLAST_DUMMY_ID) === 0,
    failureMessage: (engine) => `${describe(engine)} (expected punch only)`,
    describeState: describe,
};

export const layHandsMissStillDetonatesScenario: ScenarioDefinition = {
    id: 'lay_hands_miss_still_detonates',
    title: 'Lay Hands (0806): the emitter still explodes when the punch hits nothing',
    category: 'ability',
    maxDurationMs: 4000,
    buildEngine: () => buildEngine({ emitter: true, punchDummy: false }),
    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{
            unitId: player.id,
            abilityId: LAY_HANDS_ABILITY_ID,
            targets: [{ type: 'pixel' as const, position: { x: PUNCH_DUMMY_POS.x, y: PUNCH_DUMMY_POS.y } }],
        }];
    },
    assertPass: (engine) =>
        lost(engine, BLAST_DUMMY_ID) === LAY_HANDS_EXPLOSION_DAMAGE && !emitterActive(engine),
    failureMessage: (engine) => `${describe(engine)} (expected blast only, emitter consumed)`,
    describeState: describe,
};
