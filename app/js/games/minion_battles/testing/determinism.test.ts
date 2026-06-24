/**
 * Simulation determinism test: run the same scenario twice from scratch with
 * the same random seed and verify that getRuntimeFingerprintHex() matches at
 * every game tick.
 *
 * This test exercises DiggingClaws (0534) through a rock wall, which triggers:
 *   - ContinuousEmitter afterimage effects (created in doRenderTick)
 *   - IntervalEmitter rock-debris effects (created in fixedUpdate)
 *   - A conditional cancel pause mid-dash (auto-resolved with 'wait')
 *   - A slingshot knockback after re-entry
 *
 * Regression guard for the class of bug where non-game-tick code (doRenderTick)
 * increments objectIdSeq and shifts subsequent projectile/unit IDs.
 */

import { describe, expect, it } from 'vitest';
import { TerrainType } from '../terrain/TerrainType';
import { buildTinyBattleEngine, placePlayerAndDummy, TINY_BATTLE_PLAYER_ID } from './harness/buildTinyBattleEngine';
import type { GameEngine } from '../game/GameEngine';

const CELL = 40;
const P = TINY_BATTLE_PLAYER_ID;

// Rock block cols 5-6, rows 2-8: same layout as earthCoreDiggingClawsScenario
const ROCK_START_COL = 5;
const ROCK_END_COL   = 6;
const ROCK_START_ROW = 2;
const ROCK_END_ROW   = 8;

const PLAYER_POS  = { x: 2 * CELL + CELL / 2, y: 5 * CELL + CELL / 2 }; // (100, 220)
const DUMMY_POS   = { x: 4 * CELL + CELL / 2, y: 5 * CELL + CELL / 2 }; // (180, 220)
const TARGET_POS  = { x: ROCK_START_COL * CELL + CELL / 2, y: 5 * CELL + CELL / 2 }; // (220, 220)

function buildEngine(): GameEngine {
    const engine = buildTinyBattleEngine({ gridW: 14, gridH: 10, localPlayerId: P, grass: true });
    for (let col = ROCK_START_COL; col <= ROCK_END_COL; col++) {
        for (let row = ROCK_START_ROW; row <= ROCK_END_ROW; row++) {
            engine.terrainManager!.grid.set(col, row, TerrainType.Rock);
        }
    }
    placePlayerAndDummy(engine, {
        playerId: P,
        playerWorld: PLAYER_POS,
        dummyWorld: DUMMY_POS,
        abilities: ['0534'],
    });
    return engine;
}

// Mirrors SimulationRunner.maybeAutoResolveConditionalCancel (not exported).
function autoResolveConditionalCancel(engine: GameEngine): void {
    const batch = engine.waitingForOrders;
    if (!batch) return;
    const pausedWaiter = batch.waiters.find((w) =>
        engine.getUnit(w.unitId)?.activeAbilities.some((a) => a.conditionalCancelPaused),
    );
    if (!pausedWaiter) return;
    if (engine.state.orderMgr.hasPendingOrderForUnit(pausedWaiter.unitId, batch.atTick)) return;
    engine.state.orderMgr.applyOrder({ unitId: pausedWaiter.unitId, abilityId: 'wait', targets: [] });
}

describe('simulation determinism', () => {
    it('two independent DiggingClaws runs produce identical fingerprints at every tick', () => {
        const engines: [GameEngine, GameEngine] = [buildEngine(), buildEngine()];

        // Apply the same initial order to both engines.
        for (const engine of engines) {
            const player = engine.getLocalPlayerUnit()!;
            engine.state.orderMgr.applyOrder({
                unitId: player.id,
                abilityId: '0534',
                targets: [{ type: 'pixel', position: TARGET_POS }],
            });
        }

        // Step both engines in lockstep until idle (ability fully resolved).
        const MAX_TICKS = 400;
        for (let step = 0; step < MAX_TICKS; step++) {
            // Resolve any conditional cancel pauses before stepping.
            for (const engine of engines) {
                autoResolveConditionalCancel(engine);
            }

            // Stop when the ability has settled and the engine is waiting for new orders.
            // Both engines are identical, so checking the first is sufficient.
            if (engines[0].isScenarioRunnerBattleIdle()) break;

            for (const engine of engines) {
                engine.stepSimulationFixedTicks(1);
            }

            const tick = engines[0].gameTick;
            const fp0 = engines[0].getRuntimeFingerprintHex();
            const fp1 = engines[1].getRuntimeFingerprintHex();
            expect(fp0, `fingerprint mismatch at gameTick=${tick}`).toBe(fp1);
        }

        for (const engine of engines) engine.destroy();
    });
});
