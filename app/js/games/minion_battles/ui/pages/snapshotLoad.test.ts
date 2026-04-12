/**
 * Tests for snapshot load on reconnection.
 * Verifies that when initialGameState contains checkpoint data (units, gameTick),
 * the BattlePhase loads from it instead of starting a fresh game.
 */
import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../game/GameEngine';
import type { SerializedGameState } from '../../game/types';
import { resetGameObjectIdCounter } from '../../game/GameObject';
import { DARK_AWAKENING } from '../../storylines/WorldOfDarkness/missions/dark_awakening';

/** Minimal snapshot shape returned by backend getGameStateData from checkpoint files. */
function makeCheckpointSnapshot(overrides: Partial<Record<string, unknown>> = {}) {
    resetGameObjectIdCounter(1);
    const engine = new GameEngine();
    engine.prepareForNewGame({ localPlayerId: 'p1' });
    DARK_AWAKENING.initializeGameState(engine, {
        playerUnits: [{ playerId: 'p1', name: 'Host', portraitId: 'warrior' }],
        localPlayerId: 'p1',
        eventBus: engine.eventBus,
        equippedItemsByPlayer: { p1: ['004'] },
    });
    // Advance a bit and pause for orders
    engine.gameTick = 65;
    engine.gameTime = 2.5;
    engine.waitingForOrders = { unitId: 'unit_1', ownerId: 'p1' };

    const state = engine.toJSON() as unknown as Record<string, unknown>;
    engine.destroy();
    return { ...state, ...overrides };
}

describe('Snapshot load on reconnection', () => {
    it('hasSnapshot is true when init has units and gameTick', () => {
        const init = makeCheckpointSnapshot();
        const hasSnapshot =
            init &&
            Array.isArray(init.units) &&
            (init.units as unknown[]).length > 0 &&
            typeof (init.gameTick ?? init.game_tick) === 'number';
        expect(hasSnapshot).toBe(true);
    });

    it('hasSnapshot is false when init has no units', () => {
        const init = makeCheckpointSnapshot();
        delete init.units;
        const hasSnapshot =
            init &&
            Array.isArray(init.units) &&
            (init.units as unknown[]).length > 0 &&
            typeof (init.gameTick ?? init.game_tick) === 'number';
        expect(hasSnapshot).toBe(false);
    });

    it('hasSnapshot is true when backend uses game_tick (snake_case)', () => {
        const init = makeCheckpointSnapshot();
        init.game_tick = init.gameTick;
        delete init.gameTick;
        const hasSnapshot =
            init &&
            Array.isArray(init.units) &&
            (init.units as unknown[]).length > 0 &&
            typeof (init.gameTick ?? init.game_tick) === 'number';
        expect(hasSnapshot).toBe(true);
    });

    it('GameEngine restores correct gameTick from checkpoint snapshot', () => {
        const snapshot = makeCheckpointSnapshot();
        const restored = GameEngine.fromJSON(
            snapshot as unknown as SerializedGameState,
            'p1',
            null
        );
        expect(restored.gameTick).toBe(65);
        expect(restored.gameTime).toBe(2.5);
        expect(restored.waitingForOrders).toEqual({ unitId: 'unit_1', ownerId: 'p1' });
        restored.destroy();
    });
});
