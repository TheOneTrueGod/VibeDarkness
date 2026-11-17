/**
 * Phase `clampHitAtThreshold` and the `burrow` transition preset: close -> sink -> travel -> rise, untargetable for
 * the whole transition, resurfacing at a sprout point chosen by a pluggable rule.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../testing/harness/buildTinyBattleEngine';
import { createTargetDummyAtWorld } from '../testing/fixtures/targetDummies';
import { GameEngine } from './GameEngine';
import type { Unit } from './units/Unit';
import { getUnitDefEntry } from './units/unit_defs/unitDef';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import { burrowPreset, type BurrowTransitionDef, type UnitPhaseDef } from './units/components/phaseDef';
import { peekPhaseState } from './units/components/phaseComponent';
import {
    getBurrowVisual,
    registerBurrowCallback,
    registerSproutExclusionSource,
    registerSproutPointRule,
} from './units/components/phaseBurrow';

const P = TINY_BATTLE_PLAYER_ID;
const TICKS_PER_SEC = 60;
const cell = (n: number): number => n * CELL_SIZE + CELL_SIZE / 2;

const DUMMY_DEF = getUnitDefEntry('target_dummy')!;
beforeEach(() => {
    DUMMY_DEF.phases = undefined;
});
afterEach(() => {
    DUMMY_DEF.phases = undefined;
});

function makeEngine(): GameEngine {
    const engine = buildTinyBattleEngine({ gridW: 24, gridH: 16, localPlayerId: P, grass: true });
    spawnTinyPlayerUnit(engine, { playerId: P, x: cell(0), y: cell(0), abilities: [] });
    return engine;
}

function spawnPhased(engine: GameEngine, phases: UnitPhaseDef[]): Unit {
    DUMMY_DEF.phases = phases;
    const unit = createTargetDummyAtWorld(engine, cell(12), cell(8), { id: 'phased', hp: 100 });
    engine.addUnit(unit, 'initialGameSpawn');
    return unit;
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

const hit = (engine: GameEngine, unit: Unit, amount: number): number => unit.takeDamage(amount, null, engine.eventBus);

const NEAR = { x: cell(2), y: cell(2) };
const FAR = { x: cell(20), y: cell(14) };
const MID = { x: cell(12), y: cell(2) };

const BURROW: BurrowTransitionDef = {
    closeSeconds: 0.2,
    sinkSeconds: 0.3,
    travelSeconds: 1,
    riseSeconds: 0.3,
    sproutPoints: [NEAR, FAR, MID],
};

const burrowPhase = (burrow: BurrowTransitionDef = BURROW): UnitPhaseDef => ({
    id: 'p2',
    enterWhen: { kind: 'health_below_percent', threshold: 0.75 },
    clampHitAtThreshold: true,
    transition: burrowPreset(burrow, 'Burrowing'),
});

describe('clampHitAtThreshold', () => {
    it('a hit far past the threshold leaves health at exactly the threshold and enters the phase', () => {
        const engine = makeEngine();
        const unit = spawnPhased(engine, [{ id: 'p2', enterWhen: { kind: 'health_below_percent', threshold: 0.75 }, clampHitAtThreshold: true }]);
        hit(engine, unit, 60);
        expect(unit.hp).toBe(75);
        expect(peekPhaseState(unit)!.index).toBe(1);
        engine.destroy();
    });

    it('without the option the same hit skips past the threshold (invulnerableSeconds does not clamp it)', () => {
        const engine = makeEngine();
        const unit = spawnPhased(engine, [
            {
                id: 'p2',
                enterWhen: { kind: 'health_below_percent', threshold: 0.75 },
                transition: { kind: 'none', durationSeconds: 1, invulnerableSeconds: 1 },
            },
        ]);
        hit(engine, unit, 60);
        expect(unit.hp).toBe(40);
        engine.destroy();
    });

    it('a hit that would kill the unit is held at the threshold and the unit survives', () => {
        const engine = makeEngine();
        const unit = spawnPhased(engine, [{ id: 'p2', enterWhen: { kind: 'health_below_percent', threshold: 0.75 }, clampHitAtThreshold: true }]);
        hit(engine, unit, 9999);
        expect(unit.isAlive()).toBe(true);
        expect(unit.hp).toBe(75);
        engine.destroy();
    });

    it('a hit that stays above the threshold is untouched, and only the next unentered phase clamps', () => {
        const engine = makeEngine();
        const unit = spawnPhased(engine, [
            { id: 'p2', enterWhen: { kind: 'health_below_percent', threshold: 0.75 }, clampHitAtThreshold: true },
            { id: 'p3', enterWhen: { kind: 'health_below_percent', threshold: 0.5 }, clampHitAtThreshold: true },
        ]);
        hit(engine, unit, 10);
        expect(unit.hp).toBe(90);
        hit(engine, unit, 80); // would cross both
        expect(unit.hp).toBe(75); // stopped at the first
        expect(peekPhaseState(unit)!.index).toBe(1);
        hit(engine, unit, 80);
        expect(unit.hp).toBe(50);
        expect(peekPhaseState(unit)!.index).toBe(2);
        engine.destroy();
    });
});

describe('burrow transition', () => {
    it('crossing 75% with a large hit leaves health at exactly 75%, untargetable through the stages, ending at a sprout point', () => {
        const e2 = makeEngine();
        const u2 = spawnPhased(e2, [burrowPhase()]);
        hit(e2, u2, 90);
        expect(u2.hp).toBe(75);
        expect(peekPhaseState(u2)!.burrow?.stage).toBe('close');
        expect(u2.isInvincible()).toBe(true);
        expect(u2.canAct()).toBe(false);
        expect(hit(e2, u2, 10)).toBe(0);

        const seen: string[] = [];
        const total = BURROW.closeSeconds + BURROW.sinkSeconds + BURROW.travelSeconds + BURROW.riseSeconds;
        for (let t = 0; t < Math.round((total + 0.1) * TICKS_PER_SEC); t++) {
            step(e2, 1 / TICKS_PER_SEC);
            const b = peekPhaseState(u2)!.burrow;
            if (b) {
                expect(u2.isInvincible()).toBe(true);
                expect(u2.canAct()).toBe(false);
                if (seen[seen.length - 1] !== b.stage) seen.push(b.stage);
            }
        }
        expect(seen).toEqual(['close', 'sink', 'travel', 'rise']);
        expect(peekPhaseState(u2)!.burrow).toBeNull();
        expect(u2.isInvincible()).toBe(false);
        expect(u2.canAct()).toBe(true);
        expect([u2.x, u2.y]).toEqual([FAR.x, FAR.y]); // farthest from the player at (0,0)
        expect(u2.hp).toBe(75);
        e2.destroy();
    });

    it('runs the named callback when each stage begins, in order', () => {
        const stages: string[] = [];
        registerBurrowCallback('t_record', (_u, _e, stage) => stages.push(stage));
        const engine = makeEngine();
        const unit = spawnPhased(engine, [
            burrowPhase({ ...BURROW, callbacks: { close: 't_record', sink: 't_record', travel: 't_record', rise: 't_record' } }),
        ]);
        hit(engine, unit, 60);
        step(engine, 2.2);
        expect(stages).toEqual(['close', 'sink', 'travel', 'rise']);
        engine.destroy();
    });

    it('farthestFromParty skips candidates inside an exclusion zone (static and from a registered source)', () => {
        const engine = makeEngine();
        const unit = spawnPhased(engine, [
            burrowPhase({ ...BURROW, minDistanceFromExclusions: cell(1), exclusionZones: [{ x: FAR.x, y: FAR.y, radius: CELL_SIZE * 2 }] }),
        ]);
        hit(engine, unit, 60);
        expect([peekPhaseState(unit)!.burrow!.toX, peekPhaseState(unit)!.burrow!.toY]).toEqual([MID.x, MID.y]);
        engine.destroy();

        registerSproutExclusionSource('t_old_briar', () => [{ x: FAR.x, y: FAR.y, radius: CELL_SIZE }, { x: MID.x, y: MID.y, radius: CELL_SIZE }]);
        const e2 = makeEngine();
        const u2 = spawnPhased(e2, [burrowPhase({ ...BURROW, exclusionSources: ['t_old_briar'] })]);
        hit(e2, u2, 60);
        expect([peekPhaseState(u2)!.burrow!.toX, peekPhaseState(u2)!.burrow!.toY]).toEqual([NEAR.x, NEAR.y]);
        e2.destroy();
    });

    it('when every candidate is excluded it still resurfaces at a valid point', () => {
        const engine = makeEngine();
        const unit = spawnPhased(engine, [
            burrowPhase({ ...BURROW, exclusionZones: [{ x: cell(12), y: cell(8), radius: CELL_SIZE * 100 }] }),
        ]);
        hit(engine, unit, 60);
        step(engine, 2.2);
        expect([unit.x, unit.y]).toEqual([FAR.x, FAR.y]);
        engine.destroy();
    });

    it('the point rule is pluggable by id', () => {
        registerSproutPointRule('t_first', (candidates) => candidates[0] ?? null);
        const engine = makeEngine();
        const unit = spawnPhased(engine, [burrowPhase({ ...BURROW, pointRule: 't_first' })]);
        hit(engine, unit, 60);
        step(engine, 2.2);
        expect([unit.x, unit.y]).toEqual([NEAR.x, NEAR.y]);
        engine.destroy();
    });

    it('the visual read reports depth: surfaced while closing, under while travelling', () => {
        const engine = makeEngine();
        const unit = spawnPhased(engine, [burrowPhase()]);
        expect(getBurrowVisual(peekPhaseState(unit), engine.tickTime)).toBeNull();
        hit(engine, unit, 60);
        expect(getBurrowVisual(peekPhaseState(unit), engine.tickTime)).toMatchObject({ stage: 'close', depth: 0 });
        step(engine, 0.2 + 0.3 + 0.5);
        expect(getBurrowVisual(peekPhaseState(unit), engine.tickTime)).toMatchObject({ stage: 'travel', depth: 1 });
        engine.destroy();
    });

    it('survives a checkpoint mid-travel and lands at the same point', () => {
        const engine = makeEngine();
        const unit = spawnPhased(engine, [burrowPhase()]);
        hit(engine, unit, 60);
        step(engine, 0.8);
        expect(peekPhaseState(unit)!.burrow!.stage).toBe('travel');

        const restored = GameEngine.fromJSON(JSON.parse(JSON.stringify(engine.toJSON())), P, engine.terrainManager, {
            checkpointRuntimeFingerprintHex: engine.getRuntimeFingerprintHex(),
        });
        const rUnit = restored.getUnit(unit.id)!;
        expect(peekPhaseState(rUnit)!.burrow).toEqual(peekPhaseState(unit)!.burrow);
        step(engine, 1.5);
        step(restored, 1.5);
        expect(peekPhaseState(rUnit)!.burrow).toBeNull();
        expect([rUnit.x, rUnit.y]).toEqual([unit.x, unit.y]);
        expect([rUnit.x, rUnit.y]).toEqual([FAR.x, FAR.y]);
        expect(rUnit.canAct()).toBe(true);
        engine.destroy();
        restored.destroy();
    });
});
