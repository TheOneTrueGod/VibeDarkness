import { describe, expect, it } from 'vitest';
import { GameEngine } from './GameEngine';
import { getBattleVariable, setBattleVariable } from './battleVariables';
import { buildTinyBattleEngine, TINY_BATTLE_PLAYER_ID } from '../testing/harness/buildTinyBattleEngine';

describe('battle variables', () => {
    it('read 0 until set, and a host with no bag is left alone', () => {
        const host = { battleVariables: {} as Record<string, number> };
        expect(getBattleVariable(host, 'x')).toBe(0);
        setBattleVariable(host, 'x', 3);
        expect(getBattleVariable(host, 'x')).toBe(3);
        expect(getBattleVariable({}, 'x')).toBe(0);
        expect(() => setBattleVariable({}, 'x', 1)).not.toThrow();
        expect(getBattleVariable(undefined, 'x')).toBe(0);
    });

    it('live on the engine, survive a checkpoint, and reset for a new game', () => {
        const engine = buildTinyBattleEngine({ gridW: 8, gridH: 8, localPlayerId: TINY_BATTLE_PLAYER_ID, grass: true });
        setBattleVariable(engine, 'gardenGrowthPhase', 3);
        const restored = GameEngine.fromJSON(JSON.parse(JSON.stringify(engine.toJSON())), TINY_BATTLE_PLAYER_ID, engine.terrainManager, {
            checkpointRuntimeFingerprintHex: engine.getRuntimeFingerprintHex(),
        });
        expect(getBattleVariable(restored, 'gardenGrowthPhase')).toBe(3);
        engine.prepareForNewGame({ localPlayerId: TINY_BATTLE_PLAYER_ID, randomSeed: 1 });
        expect(getBattleVariable(engine, 'gardenGrowthPhase')).toBe(0);
        engine.destroy();
        restored.destroy();
    });
});
