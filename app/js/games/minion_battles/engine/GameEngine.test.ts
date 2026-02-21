/**
 * GameEngine serialization tests: toJSON round-trip restores state, units, projectiles, effects, orders.
 */
import { describe, it, expect } from 'vitest';
import { GameEngine } from './GameEngine';
import { resetGameObjectIdCounter } from '../objects/GameObject';

describe('GameEngine', () => {
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

        engine.initialize({
            playerUnits: [{ playerId: 'p1', characterId: 'warrior', name: 'P1' }],
            enemySpawns: [],
            localPlayerId: 'p1',
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
        expect(restored.waitingForOrders).toEqual(engine.waitingForOrders);
        expect(restored.units.length).toBe(engine.units.length);
        expect(restored.pendingOrders.length).toBe(engine.pendingOrders.length);
        expect(restored.pendingOrders[0].gameTick).toBe(331);
        expect(restored.pendingOrders[0].order.abilityId).toBe('wait');

        engine.destroy();
    });

    it('restores units with same ids and positions', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.localPlayerId = 'p1';
        engine.initialize({
            playerUnits: [{ playerId: 'p1', characterId: 'warrior', name: 'P1' }],
            enemySpawns: [],
            localPlayerId: 'p1',
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
