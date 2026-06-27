import type { ScenarioDefinition } from '../../types';
import { DarknessLevel } from '../../../game/darknessLevels';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
const P = TINY_BATTLE_PLAYER_ID;
const PLAYER_POS = { x: 120, y: 200 };
// Target is 160 px away — well within the 200 px max range of Throw Torch.
const TARGET_POS = { x: 280, y: 200 };

export const throwTorchHitsDummyScenario: ScenarioDefinition = {
    id: 'throw_torch_hits_dummy',
    title: 'Throw Torch (0601) creates a light source at the target location',
    category: 'ability',
    maxDurationMs: 6000,
    renderLighting: true,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 16, gridH: 10, localPlayerId: P, grass: true });
        engine.setMissionLightConfig(true, 0);
        spawnTinyPlayerUnit(engine, { playerId: P, x: PLAYER_POS.x, y: PLAYER_POS.y, abilities: ['0601'] });
        return engine;
    },

    getInitialOrders(engine) {
        const u = engine.getLocalPlayerUnit()!;
        return [{
            unitId: u.id,
            abilityId: '0601',
            targets: [{ type: 'pixel' as const, position: TARGET_POS }],
        }];
    },

    assertPass(engine) {
        const level = engine.getLightLevelAt(TARGET_POS.x, TARGET_POS.y);
        return level !== null && level > DarknessLevel.FULL_DARKNESS;
    },

    failureMessage(engine) {
        const level = engine.getLightLevelAt(TARGET_POS.x, TARGET_POS.y);
        return `Expected light level > ${DarknessLevel.FULL_DARKNESS} at target after torch lands, got ${level}`;
    },
};
