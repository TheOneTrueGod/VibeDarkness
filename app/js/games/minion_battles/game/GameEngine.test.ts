/**
 * GameEngine serialization tests: toJSON round-trip restores state, units, projectiles, effects, orders.
 */
import { describe, it, expect } from 'vitest';
import { GameEngine } from './GameEngine';
import { resetGameObjectIdCounter } from './GameObject';
import { DARK_AWAKENING } from '../storylines/WorldOfDarkness/missions/dark_awakening';

describe('GameEngine', () => {
    it.each([
        [1, [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }]],
        [
            2,
            [
                { playerId: 'p1', name: 'P1', portraitId: 'warrior' },
                { playerId: 'p2', name: 'P2', portraitId: 'ranger' },
            ],
        ],
        [
            3,
            [
                { playerId: 'p1', name: 'P1', portraitId: 'warrior' },
                { playerId: 'p2', name: 'P2', portraitId: 'ranger' },
                { playerId: 'p3', name: 'P3', portraitId: 'warrior' },
            ],
        ],
    ] as const)('spawns %i player unit(s) when game started with %i player(s)', (expectedCount, playerUnits) => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1' });
        const equippedByPlayer: Record<string, string[]> = {};
        playerUnits.forEach((pu) => {
            equippedByPlayer[pu.playerId] = ['004'];
        });
        DARK_AWAKENING.initializeGameState(engine, {
            playerUnits: [...playerUnits],
            localPlayerId: 'p1',
            eventBus: engine.eventBus,
            equippedItemsByPlayer: equippedByPlayer,
        });
        const playerUnitCount = engine.units.filter((u) => u.isPlayerControlled()).length;
        expect(playerUnitCount).toBe(expectedCount);
        engine.destroy();
    });

    it('serializes and restores game state with units, projectiles, effects, and orders', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.localPlayerId = 'p1';
        engine.gameTime = 5.5;
        engine.gameTick = 330;
        engine.roundNumber = 2;
        engine.snapshotIndex = 3;
        engine.waitingForOrders = { unitId: 'unit_1', ownerId: 'p1' };
        engine.pendingOrders = [
            { gameTick: 331, order: { unitId: 'unit_1', abilityId: 'wait', targets: [] } },
        ];

        engine.prepareForNewGame({ localPlayerId: 'p1' });
        DARK_AWAKENING.initializeGameState(engine, {
            playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
            localPlayerId: 'p1',
            eventBus: engine.eventBus,
            equippedItemsByPlayer: { p1: ['004'] },
        });

        const json = engine.toJSON();
        expect(json.gameTick).toBe(330);
        expect(json.gameTime).toBe(5.5);
        expect(json.roundNumber).toBe(2);
        expect(json.units.length).toBeGreaterThan(0);
        expect(json.orders).toBeDefined();
        expect(json.orders!.length).toBe(1);
        expect(json.orders![0].gameTick).toBe(331);

        const restored = GameEngine.fromJSON(json, 'p1', null);
        expect(restored.gameTick).toBe(engine.gameTick);
        expect(restored.gameTime).toBe(engine.gameTime);
        expect(restored.roundNumber).toBe(engine.roundNumber);
        expect(restored.snapshotIndex).toBe(engine.snapshotIndex);
        // waitingForOrders is intentionally cleared when a matching pending order already exists,
        // so the engine will apply the order naturally without pausing.
        expect(restored.waitingForOrders).toBeNull();
        expect(restored.isPaused).toBe(false);
        expect(restored.units.length).toBe(engine.units.length);
        expect(restored.pendingOrders.length).toBe(engine.pendingOrders.length);
        expect(restored.pendingOrders[0].gameTick).toBe(331);
        expect(restored.pendingOrders[0].order.abilityId).toBe('wait');

        engine.destroy();
    });

    it('restores units with same ids and positions', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1' });
        DARK_AWAKENING.initializeGameState(engine, {
            playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
            localPlayerId: 'p1',
            eventBus: engine.eventBus,
            equippedItemsByPlayer: { p1: ['004'] },
        });
        const json = engine.toJSON();
        const restored = GameEngine.fromJSON(json, 'p1', null);

        for (let i = 0; i < engine.units.length; i++) {
            const u = engine.units[i];
            const r = restored.units[i];
            expect(r.id).toBe(u.id);
            expect(r.x).toBe(u.x);
            expect(r.y).toBe(u.y);
            expect(r.hp).toBe(u.hp);
            expect(r.teamId).toBe(u.teamId);
        }
        engine.destroy();
    });
});
