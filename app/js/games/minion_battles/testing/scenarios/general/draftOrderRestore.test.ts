/**
 * Draft order restoration scenario: a player unit at an order pause with a DRAFT order
 * survives a toJSON → fromJSON round-trip while staying paused, then a confirmed order
 * resolves the turn.
 *
 * This test covers the regression from Step 1 of the draft-order safety plan:
 * drafts (endTurn: false) must never satisfy a waiter on restore.
 */
import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../../game/GameEngine';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import type { SerializedGameState } from '../../../game/types';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';

const FIXED_DT = 1 / 60;

/**
 * Create a tiny single-player battle engine.
 * Player at (5, 5), no enemies. When order pause is reached, player must submit an order.
 */
function buildDraftOrderTestEngine(): GameEngine {
    const engine = buildTinyBattleEngine({
        gridW: 10,
        gridH: 10,
        localPlayerId: TINY_BATTLE_PLAYER_ID,
        grass: true,
    });

    spawnTinyPlayerUnit(engine, {
        playerId: TINY_BATTLE_PLAYER_ID,
        x: 5 * CELL_SIZE + CELL_SIZE / 2,
        y: 5 * CELL_SIZE + CELL_SIZE / 2,
        abilities: ['wait'],
    });

    return engine;
}

/**
 * Advance the engine until it reaches an order pause.
 */
function advanceUntilOrderPause(engine: GameEngine, maxSteps = 50): void {
    for (let i = 0; i < maxSteps; i++) {
        (engine as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
        if (engine.waitingForOrders != null) return;
    }
    throw new Error('expected order pause within maxSteps');
}

describe('Draft order restoration scenario', () => {
    it('draft order does not satisfy pause on restore; confirmed order does', () => {
        const engine = buildDraftOrderTestEngine();
        const player = engine.getLocalPlayerUnit();
        expect(player).toBeTruthy();
        const playerId = player!.id;

        // Advance to order pause
        advanceUntilOrderPause(engine);
        expect(engine.waitingForOrders).not.toBeNull();
        expect(engine.isPaused).toBe(true);

        const pauseTick = engine.gameTick;
        const playerPosBeforeDraft = { x: player!.x, y: player!.y };

        // Apply a DRAFT order (endTurn: false)
        engine.state.orderMgr.applyOrder({
            unitId: playerId,
            abilityId: 'wait',
            targets: [],
            movePath: [{ col: 6, row: 5 }],
            endTurn: false, // Draft — does NOT confirm
        });

        // Pause should still be active
        expect(engine.waitingForOrders).not.toBeNull();
        expect(engine.isPaused).toBe(true);

        // Serialize and restore
        const snap = engine.toJSON() as SerializedGameState;
        engine.destroy();

        const restored = GameEngine.fromJSON(snap, TINY_BATTLE_PLAYER_ID, null);

        // After restore, pause should still be active (draft does not satisfy)
        // Pause must remain after restoring a draft order.
        expect(restored.waitingForOrders).not.toBeNull();
        expect(restored.isPaused).toBe(true);
        expect(restored.gameTick).toBe(pauseTick);

        const restoredPlayer = restored.getUnit(playerId);
        expect(restoredPlayer).toBeTruthy();

        // Advance a few ticks with pause still active: engine should not auto-advance
        for (let i = 0; i < 10; i++) {
            (restored as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
            expect(restored.isPaused).toBe(true);
        }
        expect(restored.gameTick).toBe(pauseTick); // No progress

        // Unit must not have walked the draft path while paused.
        expect({ x: restoredPlayer!.x, y: restoredPlayer!.y }).toEqual(playerPosBeforeDraft);

        // Now apply a CONFIRMED order (endTurn: true)
        restored.state.orderMgr.applyOrder({
            unitId: playerId,
            abilityId: 'wait',
            targets: [],
            movePath: [{ col: 6, row: 5 }],
            endTurn: true, // Confirmed — resolves the pause
        });

        // Pause should clear
        expect(restored.waitingForOrders).toBeNull(); // pause must clear after confirmed order
        expect(restored.isPaused).toBe(false);

        // Advance and verify the engine resumes
        let resumed = false;
        for (let i = 0; i < 20; i++) {
            (restored as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
            if (restored.gameTick > pauseTick) {
                resumed = true;
                break;
            }
        }
        expect(resumed).toBe(true); // engine should resume after confirmed order

        restored.destroy();
    });
});
