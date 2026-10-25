/**
 * Pins the exact checkpoint shape written by `GameEngine.toJSON` (and the fromJSON -> toJSON round trip).
 * The golden file was generated before `toJSON` / `fromJSON` moved into `engineSerialization.ts`;
 * any diff means the checkpoint format changed (see `game-engine` skill, "Checkpoint versioning").
 */
import { describe, expect, it } from 'vitest';
import {
    buildTinyBattleEngine,
    placeTargetDummy,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../testing/harness/buildTinyBattleEngine';
import { resetGameObjectIdCounter } from './GameObject';
import { GameEngine } from './GameEngine';
import type { SerializedGameState } from './types';

const P = TINY_BATTLE_PLAYER_ID;

function stripVolatile(state: SerializedGameState): SerializedGameState {
    // performanceLog holds wall-clock timings; everything else must be deterministic.
    const { performanceLog: _performanceLog, ...rest } = state;
    return rest as SerializedGameState;
}

function buildEngine(): GameEngine {
    resetGameObjectIdCounter(1);
    const engine = buildTinyBattleEngine({ gridW: 24, gridH: 16, localPlayerId: P, grass: true });
    spawnTinyPlayerUnit(engine, { playerId: P, x: 100, y: 100, abilities: [] });
    placeTargetDummy(engine, { x: 400, y: 300 });
    engine.registerPlayerControl([], { boss: P });
    // Answer every parallel order pause with a wait so the sim keeps ticking (round start, light tick, ...).
    for (let i = 0; i < 130; i++) {
        const batch = engine.waitingForOrders;
        if (batch) {
            for (const w of batch.waiters) {
                engine.state.orderMgr.applyOrder({ unitId: w.unitId, abilityId: 'wait', targets: [], endTurn: true });
            }
            engine.tryResumeParallel();
        }
        engine.stepSimulationFixedTicks(1);
    }
    return engine;
}

describe('engine serialization', () => {
    it('toJSON output is byte-identical to the golden checkpoint', async () => {
        const engine = buildEngine();
        const json = JSON.stringify(stripVolatile(engine.toJSON()), null, 2);
        await expect(json).toMatchFileSnapshot('./__snapshots__/engineSerialization.toJSON.json');
    });

    it('fromJSON -> toJSON round trips to the same JSON', () => {
        const engine = buildEngine();
        const first = stripVolatile(engine.toJSON());
        const restored = GameEngine.fromJSON(
            JSON.parse(JSON.stringify(first)) as SerializedGameState,
            P,
            engine.terrainManager,
        );
        const second = stripVolatile(restored.toJSON());
        expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    });
});
