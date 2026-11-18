/**
 * Fused body (destructible seed): the fuse bursts on expiry, killing it first fizzles instead, health scales with
 * player count, and the telegraph window (last 1.5 s) is readable and fires one event when it opens.
 */

import { describe, expect, it } from 'vitest';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../testing/harness/buildTinyBattleEngine';
import type { GameEngine } from './GameEngine';
import type { Unit } from './units/Unit';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import { serializeUnit } from './units/unitToJSON';
import { applySerializedUnitState } from './units/unitFromJSON';
import { createUnitFromSpawnConfig } from './units/index';
import { getUnitDefEntry } from './units/unit_defs/unitDef';
import { spawnFusedBody, scaledFusedBodyHp } from './units/components/fusedBodySpawn';
import {
    FUSED_BODY_TELEGRAPH_SECONDS,
    fusedBodyTelegraphArea,
    getFusedBodyStatus,
    peekFusedBodyState,
} from './units/components/fusedBodyComponent';
import { registerFusedBodyEffect } from './units/components/fusedBodyHooks';
import { POD_SEED_REACTION_LEAD_SEC } from '../card_defs/16_enemy_garden_heart/gardenHeartConstants';

const P = TINY_BATTLE_PLAYER_ID;
const TICKS_PER_SEC = 60;
const cell = (n: number): number => n * CELL_SIZE + CELL_SIZE / 2;

function makeEngine(playerCount = 1): { engine: GameEngine; player: Unit } {
    const engine = buildTinyBattleEngine({ gridW: 24, gridH: 16, localPlayerId: P, grass: true });
    const player = spawnTinyPlayerUnit(engine, { playerId: P, x: cell(10), y: cell(8), abilities: [] });
    engine.enemyScalingPlayerCount = playerCount;
    return { engine, player };
}

function spawnSeed(engine: GameEngine): Unit {
    const seed = spawnFusedBody(engine, { characterId: 'pod_seed', x: cell(10), y: cell(8), unitId: 'seed' });
    if (!seed) throw new Error('seed did not spawn');
    return seed;
}

function step(engine: GameEngine, seconds: number): void {
    const ticks = Math.round(seconds * TICKS_PER_SEC);
    for (let i = 0; i < ticks; i++) {
        const batch = engine.waitingForOrders;
        if (batch) {
            for (const waiter of batch.waiters) {
                engine.state.orderMgr.applyOrder({ unitId: waiter.unitId, abilityId: 'wait', targets: [], endTurn: true });
            }
            engine.tryResumeParallel();
        }
        engine.stepSimulationFixedTicks(1);
    }
}

const options = getUnitDefEntry('pod_seed')!.components![0].options as {
    fuseSeconds: number;
    onExpiry: { params: { damage: number } };
};

describe('fused body', () => {
    it('bursts when the fuse runs out: damages enemies in reach and leaves the field', () => {
        const { engine, player } = makeEngine();
        const seed = spawnSeed(engine);
        const before = player.hp;
        step(engine, options.fuseSeconds - 0.5);
        expect(player.hp).toBe(before);
        expect(seed.isAlive()).toBe(true);
        step(engine, 1);
        expect(player.hp).toBe(before - options.onExpiry.params.damage);
        expect(seed.isAlive()).toBe(false);
        expect(peekFusedBodyState(seed)?.outcome).toBe('expired');
        engine.destroy();
    });

    it('killing it first fizzles: no damage, and the expiry burst never fires', () => {
        const { engine, player } = makeEngine();
        const seed = spawnSeed(engine);
        const before = player.hp;
        const fizzles: string[] = [];
        const off = registerFusedBodyEffect('areaDamage', () => fizzles.push('burst'));
        try {
            step(engine, 2);
            seed.takeDamage(seed.maxHp, player.id, engine.eventBus);
            expect(peekFusedBodyState(seed)?.outcome).toBe('killed');
            step(engine, options.fuseSeconds + 1);
            expect(fizzles).toEqual([]);
            expect(player.hp).toBe(before);
        } finally {
            off();
        }
        engine.destroy();
    });

    it('health scales with player count like other enemies', () => {
        expect(scaledFusedBodyHp(20, 1)).toBe(20);
        expect(scaledFusedBodyHp(20, 3)).toBe(60);
        const solo = makeEngine(1);
        expect(spawnSeed(solo.engine).maxHp).toBe(20);
        solo.engine.destroy();
        const trio = makeEngine(3);
        const seed = spawnSeed(trio.engine);
        expect(seed.hp).toBe(60);
        expect(seed.maxHp).toBe(60);
        trio.engine.destroy();
    });

    it('exposes a telegraph window for the last 1.5 s and announces it once', () => {
        const { engine } = makeEngine();
        const seed = spawnSeed(engine);
        const opened: number[] = [];
        engine.eventBus.on('fused_body_telegraph_started', (e) => opened.push(e.secondsLeft));

        expect(fusedBodyTelegraphArea(seed)).toBeUndefined();
        step(engine, options.fuseSeconds - FUSED_BODY_TELEGRAPH_SECONDS - 0.5);
        expect(getFusedBodyStatus(seed)?.telegraphing).toBe(false);
        expect(opened).toEqual([]);

        step(engine, 0.75);
        const status = getFusedBodyStatus(seed)!;
        expect(status.telegraphing).toBe(true);
        expect(status.elapsedInTelegraph).toBeGreaterThan(0);
        expect(status.elapsedInTelegraph).toBeLessThan(FUSED_BODY_TELEGRAPH_SECONDS);
        expect(fusedBodyTelegraphArea(seed)).toMatchObject({ x: seed.x, y: seed.y, radiusPx: 96 });
        expect(opened).toHaveLength(1);
        expect(opened[0]).toBeLessThanOrEqual(FUSED_BODY_TELEGRAPH_SECONDS);

        step(engine, 0.5);
        expect(opened).toHaveLength(1);
        engine.destroy();
    });

    it('opens its reaction frame once, 0.2 s before the burst, not when the telegraph opens', () => {
        const { engine } = makeEngine();
        const seed = spawnSeed(engine);
        const frames: number[] = [];
        engine.eventBus.on('fused_body_reaction_frame', (e) => frames.push(e.secondsLeft));

        step(engine, options.fuseSeconds - FUSED_BODY_TELEGRAPH_SECONDS + 0.2);
        expect(getFusedBodyStatus(seed)?.telegraphing).toBe(true);
        expect(frames).toEqual([]);

        step(engine, FUSED_BODY_TELEGRAPH_SECONDS - 0.2 - POD_SEED_REACTION_LEAD_SEC - 0.05);
        expect(frames).toEqual([]);
        step(engine, 0.1);
        expect(frames).toHaveLength(1);
        expect(frames[0]).toBeLessThanOrEqual(POD_SEED_REACTION_LEAD_SEC);
        expect(frames[0]).toBeGreaterThan(POD_SEED_REACTION_LEAD_SEC - 0.1);
        expect(peekFusedBodyState(seed)?.outcome).toBeNull(); // the burst is still to come

        step(engine, 0.5);
        expect(frames).toHaveLength(1);
        engine.destroy();
    });

    it('round-trips the fuse through serialization', () => {
        const { engine } = makeEngine();
        const seed = spawnSeed(engine);
        step(engine, 4);
        const data = JSON.parse(JSON.stringify(serializeUnit(seed, 0))) as Record<string, unknown>;

        const restored = createUnitFromSpawnConfig(
            { id: 'seed2', characterId: 'pod_seed', name: 'Seed', hp: 20, x: 0, y: 0, teamId: 'enemy', ownerId: 'ai' },
            engine.eventBus,
            engine,
        );
        applySerializedUnitState(restored, data, engine.eventBus, 0);
        const a = getFusedBodyStatus(seed)!;
        const b = getFusedBodyStatus(restored)!;
        expect(b.remaining).toBeCloseTo(a.remaining, 6);
        expect(b.telegraphing).toBe(true);
        expect(b.outcome).toBeNull();
        engine.destroy();
    });
});
