/**
 * Regression for lobby BBA219: module-level light-source ids leaked across ITS
 * rollback / snapshot restore, so host and client fingerprinted different `ls_*`
 * ids for the same spawn event despite matching randomSeed and gameplay state.
 */
import { describe, it, expect } from 'vitest';
import { resetGameObjectIdCounter } from '../GameObject';
import { GameEngine } from '../GameEngine';
import { spawnBrightLight } from '../../abilities/brightKeyword';
import {
    buildTinyBattleEngine,
    TINY_BATTLE_PLAYER_ID,
} from '../../testing/harness/buildTinyBattleEngine';
import { LightSource } from './LightSource';

/** Magnitude 3 — round-decay bright light (same family as Light Blast). */
const BRIGHT_MAGNITUDE = 3;

function spawnAutoIdLight(engine: GameEngine, x: number, y: number): string {
    const before = new Set(engine.lightSources.map((ls) => ls.id));
    spawnBrightLight(engine, x, y, BRIGHT_MAGNITUDE);
    const created = engine.lightSources.find((ls) => !before.has(ls.id));
    if (!created?.id) throw new Error('expected auto-id light source');
    return created.id;
}

describe('LightSource id determinism after restore', () => {
    it('rollback-style restore assigns the same auto id as a clean run from the mark', () => {
        resetGameObjectIdCounter(1);
        const engine = buildTinyBattleEngine({
            gridW: 8,
            gridH: 8,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });
        const mark = engine.toJSON();
        const terrain = engine.terrainManager;

        // Preview path: spawn once (bumps allocator / would have bumped a module counter).
        const previewId = spawnAutoIdLight(engine, 100, 100);
        expect(previewId).toMatch(/^ls_\d+$/);

        // ITS rollback / snapshot restore rebuilds the engine from the mark.
        const afterRollback = GameEngine.fromJSON(mark, TINY_BATTLE_PLAYER_ID, terrain);
        const committedId = spawnAutoIdLight(afterRollback, 100, 100);

        // Peer that never previewed: single spawn from the same mark.
        const clean = GameEngine.fromJSON(mark, TINY_BATTLE_PLAYER_ID, terrain);
        const cleanId = spawnAutoIdLight(clean, 100, 100);

        expect(committedId).toBe(cleanId);
        // Preview consumed the same sequence slot; after restore that slot is reused.
        expect(committedId).toBe(previewId);
    });

    it('preserves explicit light source ids', () => {
        resetGameObjectIdCounter(1);
        const engine = buildTinyBattleEngine({
            gridW: 8,
            gridH: 8,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });
        engine.addLightSource(new LightSource({
            id: 'lantern_torch_unit_1',
            x: 10,
            y: 10,
            lightAmount: 4,
            radius: 2,
            decay: {
                roundCreated: 1,
                initialLightAmount: 4,
                initialRadius: 2,
                roundsTotal: 999,
            },
        }));
        expect(engine.lightSources.some((ls) => ls.id === 'lantern_torch_unit_1')).toBe(true);
    });
});
