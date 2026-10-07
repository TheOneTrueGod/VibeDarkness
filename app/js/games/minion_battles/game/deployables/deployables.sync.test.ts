import { describe, it, expect } from 'vitest';
import { resetGameObjectIdCounter } from '../GameObject';
import { GameEngine } from '../GameEngine';
import { LightSource } from '../lightSources/LightSource';
import { buildTinyBattleEngine, TINY_BATTLE_PLAYER_ID } from '../../testing/harness/buildTinyBattleEngine';
import { REACH_5X5_HALF_EXTENT } from './Deployable';

function buildEngine(lightTeam: 'player' | 'enemy' = 'player'): GameEngine {
    resetGameObjectIdCounter(1);
    const engine = buildTinyBattleEngine({
        gridW: 8,
        gridH: 8,
        localPlayerId: TINY_BATTLE_PLAYER_ID,
        grass: true,
    });
    engine.addLightSource(
        new LightSource({
            id: 'torch_1',
            x: 100,
            y: 100,
            lightAmount: 4,
            radius: 2,
            decay: { roundCreated: 1, initialLightAmount: 4, initialRadius: 2, roundsTotal: 999 },
            ownerUnitId: 'u1',
            ownerAbilityId: 'throw_torch',
            teamId: lightTeam,
        }),
    );
    engine.terrainLayers.add({
        id: 'bramble_1',
        layer: 'ground',
        effectType: 'bramble_slow',
        placedAtGameTime: 0,
        ownerUnitId: 'u1',
        ownerAbilityId: 'bramble_patch',
        teamId: 'player',
        area: { type: 'cell', col: 2, row: 2 },
        params: {},
    });
    return engine;
}

const query = (engine: GameEngine) =>
    engine.findDeployables({
        castingTeam: 'player',
        near: { x: 100, y: 100 },
        halfExtent: REACH_5X5_HALF_EXTENT * 4,
    });

describe('deployables engine wiring and sync', () => {
    it('finds owned light and bramble through the engine, and consumes them', () => {
        const engine = buildEngine();
        const found = query(engine);
        expect(found.map((d) => d.id).sort()).toEqual(['bramble_1', 'torch_1']);

        const torch = found.find((d) => d.id === 'torch_1')!;
        const bramble = found.find((d) => d.id === 'bramble_1')!;
        expect(engine.consumeDeployable(torch)).toBe(true);
        expect(engine.lightSources.find((l) => l.id === 'torch_1')?.active).toBe(false);
        expect(engine.consumeDeployable(bramble)).toBe(true);
        expect(engine.terrainLayers.allEffects.has('bramble_1')).toBe(false);
        expect(query(engine)).toEqual([]);
    });

    it('keeps working after fromJSON replaces terrain layers and light contents', () => {
        const engine = buildEngine();
        const before = query(engine);
        const hexBefore = engine.getRuntimeFingerprintHex();

        const restored = GameEngine.fromJSON(engine.toJSON(), TINY_BATTLE_PLAYER_ID, engine.terrainManager, {
            checkpointRuntimeFingerprintHex: hexBefore,
        });
        expect(restored.state.terrainLayers).not.toBe(engine.state.terrainLayers);
        expect(query(restored)).toEqual(before);
        expect(restored.getRuntimeFingerprintHex()).toBe(hexBefore);

        const bramble = query(restored).find((d) => d.id === 'bramble_1')!;
        expect(restored.consumeDeployable(bramble)).toBe(true);
        expect(restored.terrainLayers.allEffects.has('bramble_1')).toBe(false);
    });

    it('fingerprints differ when only a light source teamId differs', () => {
        const a = buildEngine('player');
        const b = buildEngine('enemy');
        expect(a.getRuntimeFingerprintHex()).not.toBe(b.getRuntimeFingerprintHex());
    });
});
