import { describe, it, expect } from 'vitest';
import { GameEngine } from './GameEngine';
import { resetGameObjectIdCounter } from './GameObject';
import {
    SERIALIZED_GAME_STATE_VERSION,
    UnsupportedCheckpointVersionError,
    upgradeSerializedGameState,
} from './serializedGameStateUpgrade';
import type { SerializedGameState } from './types';

function makeEngine(): GameEngine {
    resetGameObjectIdCounter(1);
    const engine = new GameEngine();
    engine.localPlayerId = 'p1';
    engine.gameTime = 2;
    engine.gameTick = 120;
    engine.roundNumber = 1;
    engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 7 });
    return engine;
}

describe('serialized game state versioning', () => {
    it('current version is at least 1 and toJSON stamps it', () => {
        expect(SERIALIZED_GAME_STATE_VERSION).toBeGreaterThanOrEqual(1);
        expect(makeEngine().toJSON().serializationVersion).toBe(SERIALIZED_GAME_STATE_VERSION);
    });

    it('loads a version-0 checkpoint (no version, with legacy cards) and drops cards', () => {
        const json = makeEngine().toJSON();
        const { serializationVersion: _v, ...rest } = json;
        const legacy = {
            ...rest,
            cards: { p1: [{ instanceId: 'card-1', cardDefId: '0001', abilityId: '0001', location: 'hand' }] },
        };
        const upgraded = upgradeSerializedGameState(legacy as unknown as SerializedGameState);
        expect(upgraded.serializationVersion).toBe(SERIALIZED_GAME_STATE_VERSION);
        expect('cards' in upgraded).toBe(false);
        // Input is not mutated.
        expect('cards' in legacy).toBe(true);
        expect('serializationVersion' in legacy).toBe(false);

        const restored = GameEngine.fromJSON(legacy as unknown as SerializedGameState, 'p1', null);
        expect(restored.gameTick).toBe(120);
        expect(restored.toJSON().serializationVersion).toBe(SERIALIZED_GAME_STATE_VERSION);
        // Legacy card data is gone; only the empty deploy-compat `cards: {}` is re-emitted.
        expect(restored.toJSON().cards).toEqual({});
    });

    it('round-trips a current checkpoint through toJSON / fromJSON', () => {
        const json = makeEngine().toJSON();
        expect(upgradeSerializedGameState(json)).toBe(json);
        const restored = GameEngine.fromJSON(JSON.parse(JSON.stringify(json)), 'p1', null);
        expect(restored.toJSON()).toEqual(json);
    });

    it('throws a clear error for a checkpoint from a newer build', () => {
        const json = { ...makeEngine().toJSON(), serializationVersion: SERIALIZED_GAME_STATE_VERSION + 1 };
        expect(() => GameEngine.fromJSON(json, 'p1', null)).toThrow(UnsupportedCheckpointVersionError);
        expect(() => upgradeSerializedGameState(json)).toThrow(/newer than this build/);
    });
});
