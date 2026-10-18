/**
 * Unit step pieces and frozen-unit rules (plan Step 5). A light UnitManager harness: real UnitManager,
 * TimeManager and terrain; stub engine for the global managers. Tick order mirrors `GameEngine.fixedUpdate`.
 */
import { describe, it, expect, vi } from 'vitest';
import { Unit } from '../units/Unit';
import { UnitManager } from '../managers/UnitManager';
import { OrderManager } from '../managers/OrderManager';
import { EventBus } from '../EventBus';
import type { EngineContext } from '../EngineContext';
import type { AIContext } from '../units/unitAI';
import { TerrainGrid, CELL_SIZE } from '../../terrain/TerrainGrid';
import { TerrainManager } from '../../terrain/TerrainManager';
import { TerrainType } from '../../terrain/TerrainType';
import { Buff } from '../../buffs/Buff';
import { FIXED_DT } from '../gameConstants';
import { TimeManager } from './TimeManager';
import { advanceUnitLocalClocks, collectUnitFocalRequests } from './actorClock';
import type { TimeModifier } from './TimeModifier';
import { MAX_STEP_PIECES_PER_TICK } from './timeConstants';
import { defineAbility } from '../../abilities/defineAbility';
import { AbilityPhase } from '../../abilities/abilityTimings';
import { registerAbilityForTest } from '../../abilities/AbilityRegistry';
import { executeUnitAbility } from '../units/unitAbilityLifecycle';

const CAST_ID = 'test_step_piece_cast';
const CastHalfSecondTwice = defineAbility({
    id: CAST_ID,
    name: 'Piece Probe',
    image: '',
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: 0,
    targets: [],
    abilityTimings: [
        { id: 'a', start: 0, end: 0.5, abilityPhase: AbilityPhase.Active },
        { id: 'b', start: 0.5, end: 1, abilityPhase: AbilityPhase.Cooldown },
    ],
    getTooltipText: () => ['Piece probe'],
    getRange: () => ({ minRange: 0, maxRange: 100 }),
});

class TempoBuff extends Buff {
    readonly _type = 'test_tempo';
    override readonly timeModifier: TimeModifier;
    constructor(tempo: number, seconds = 1000, opts: { freeze?: boolean } = {}) {
        super({ value: seconds, unit: 'seconds' });
        this.timeModifier = { sourceId: 'test', tempo, ...(opts.freeze ? { freeze: true } : {}) };
    }
}

function makeUnit(id: string, x: number, y: number, speed = 100): Unit {
    const u = new Unit({
        id,
        x,
        y,
        hp: 100,
        maxHp: 100,
        speed,
        teamId: 'player',
        ownerId: 'p1',
        characterId: 'swarmling',
        name: id,
        abilities: [],
    });
    u.moveJitter = 0;
    return u;
}

interface Harness {
    engine: EngineContext & { timeManager: TimeManager };
    units: Unit[];
    manager: UnitManager;
    terrain: TerrainManager;
    tick(): void;
}

function makeHarness(units: Unit[], terrain?: TerrainManager): Harness {
    const terrainManager = terrain ?? new TerrainManager(new TerrainGrid(60, 12, CELL_SIZE, TerrainType.Grass));
    const noop = new Proxy({}, { get: () => () => undefined });
    const engine = {
        gameTime: 0,
        gameTick: 0,
        roundNumber: 1,
        eventBus: new EventBus(),
        units,
        timeManager: new TimeManager(),
        terrainManager,
        terrainLayers: new Proxy({}, { get: (_t, k) => (k === 'getGroundMovementMultiplier' ? () => 1 : () => undefined) }),
        cellOccupancyManager: null,
        pathfindingManager: { tick: () => {} },
        crowdSpacingManager: { tick: () => {} },
        mapNetworkManager: { updateUnitNode: () => {} },
        getUnit: (id: string) => units.find((u) => u.id === id),
        generateRandomInteger: () => 0,
        addEffect: noop,
        addEffectEmitter: noop,
        trackAbilityUse: vi.fn(),
    } as unknown as EngineContext & { timeManager: TimeManager };
    const manager = new UnitManager(engine);
    manager.units = units;
    const aiContext = { ninjutsuManager: undefined } as unknown as AIContext;
    const tick = () => {
        engine.timeManager.resolveWorldPace(collectUnitFocalRequests(units), engine.gameTick + 1);
        const pace = engine.timeManager.worldPace;
        const worldDt = pace === 1 ? FIXED_DT : FIXED_DT * pace;
        const prev = engine.gameTime;
        (engine as { gameTime: number }).gameTime += worldDt;
        advanceUnitLocalClocks(units, engine, FIXED_DT, prev);
        (engine as { gameTick: number }).gameTick++;
        manager.gameTick(worldDt, engine, () => {}, aiContext);
    };
    return { engine, units, manager, terrain: terrainManager, tick };
}

const cx = (col: number) => col * CELL_SIZE + CELL_SIZE / 2;

describe('unit tempo and step pieces', () => {
    it('a tempo-2 unit walks twice the distance of a tempo-1 unit in the same world time', () => {
        const slow = makeUnit('slow', cx(1), cx(2));
        const fast = makeUnit('fast', cx(1), cx(6));
        fast.addBuff(new TempoBuff(2), 0, 1);
        slow.setMovement([{ col: 50, row: 2 }], undefined, 0);
        fast.setMovement([{ col: 50, row: 6 }], undefined, 0);
        const h = makeHarness([slow, fast]);
        for (let i = 0; i < 60; i++) h.tick();
        const slowDist = slow.x - cx(1);
        const fastDist = fast.x - cx(1);
        expect(slowDist).toBeGreaterThan(50);
        expect(fastDist / slowDist).toBeCloseTo(2, 3);
        // Local clock ran at tempo 2; world clock is untouched.
        expect(fast.localTime - slow.localTime).toBeGreaterThan(0.9);
    });

    it('pace 1 / tempo 1 stays a single piece: localTime tracks gameTime exactly', () => {
        const u = makeUnit('u', cx(1), cx(2));
        u.setMovement([{ col: 50, row: 2 }], undefined, 0);
        const h = makeHarness([u]);
        for (let i = 0; i < 30; i++) h.tick();
        expect(u.localTime).toBe(h.engine.gameTime);
        expect(u.timeDebt).toBe(0);
    });

    it('a 100x unit walking into a wall stops at the wall (no tunnelling)', () => {
        const terrainManager = new TerrainManager(new TerrainGrid(60, 12, CELL_SIZE, TerrainType.Grass));
        for (let row = 0; row < 12; row++) terrainManager.grid.set(10, row, TerrainType.Rock);
        const u = makeUnit('runner', cx(1), cx(5));
        u.addBuff(new TempoBuff(100), 0, 1);
        u.setMovement([{ col: 20, row: 5 }], undefined, 0);
        const h = makeHarness([u], terrainManager);
        for (let i = 0; i < 40; i++) {
            h.tick();
            expect(terrainManager.isPassable(u.x, u.y)).toBe(true);
            expect(u.x).toBeLessThan(10 * CELL_SIZE);
        }
        expect(u.x).toBeGreaterThan(8 * CELL_SIZE);
    });

    it('the piece budget holds: a huge step carries time debt and never hangs', () => {
        const u = makeUnit('blur', cx(1), cx(5), 5000);
        u.addBuff(new TempoBuff(100), 0, 1);
        u.setMovement([{ col: 55, row: 5 }], undefined, 0);
        const h = makeHarness([u]);
        const spy = vi.spyOn(u, 'tickMovement');
        h.tick();
        expect(spy.mock.calls.length).toBeLessThanOrEqual(MAX_STEP_PIECES_PER_TICK);
        expect(u.timeDebt).toBeGreaterThan(0);
        // Local clock lags the true clock by exactly the debt.
        expect(u.localTime).toBeLessThan(h.engine.gameTime * 100);
        for (let i = 0; i < 5; i++) h.tick();
        expect(h.terrain.isPassable(u.x, u.y)).toBe(true);
    });

    it('a hasted caster is cut at timeline boundaries and finishes its cast on local time', () => {
        registerAbilityForTest(CastHalfSecondTwice);
        const u = makeUnit('caster', cx(1), cx(2));
        u.abilities = [CAST_ID];
        u.abilityRuntime[CAST_ID] = { currentUses: 1, maxUses: 1, recoveryChargesByType: {}, active: true, replacedAbilityId: null };
        u.addBuff(new TempoBuff(7), 0, 1);
        const h = makeHarness([u]);
        h.tick();
        executeUnitAbility(u, CastHalfSecondTwice, [], h.engine);
        const spy = vi.spyOn(u, 'tickActiveAbilities');
        let ticks = 0;
        let maxCallsInTick = 0;
        while (u.activeAbilities.length > 0 && ticks < 60) {
            const before = spy.mock.calls.length;
            h.tick();
            maxCallsInTick = Math.max(maxCallsInTick, spy.mock.calls.length - before);
            ticks++;
        }
        // 1 s of cast at tempo 7 takes about 1 / (7 x FIXED_DT) = 8.6 ticks (plus the start/finish tick).
        expect(ticks).toBeGreaterThanOrEqual(9);
        expect(ticks).toBeLessThanOrEqual(11);
        // At least one tick straddled the 0.5 s timeline boundary and ran two ability pieces.
        expect(maxCallsInTick).toBeGreaterThan(1);
        expect(u.timeDebt).toBe(0);
    });

    it('a still 100x unit costs one piece', () => {
        const u = makeUnit('still', cx(1), cx(5));
        u.addBuff(new TempoBuff(100), 0, 1);
        const h = makeHarness([u]);
        const spy = vi.spyOn(u, 'tickMovement');
        h.tick();
        expect(spy).toHaveBeenCalledTimes(1);
        expect(u.timeDebt).toBe(0);
    });

    it('a frozen unit does not move or run AI, and its knockback resumes with the same remaining arc', () => {
        const knock = () => ({
            knockbackVector: { x: 120, y: 0 },
            knockbackAirTime: 0.4,
            knockbackSlideTime: 0.2,
            knockbackSource: { type: 'test' } as never,
            knockbackElapsed: 0,
        });
        const frozen = makeUnit('frozen', cx(1), cx(2));
        const control = makeUnit('control', cx(1), cx(6));
        frozen.knockback = knock();
        control.knockback = knock();
        // Freeze for 0.5 s of world time.
        frozen.addBuff(new TempoBuff(1, 0.5, { freeze: true }), 0, 1);
        const h = makeHarness([frozen, control]);
        for (let i = 0; i < 20; i++) h.tick();
        expect(frozen.localFrozen).toBe(true);
        expect(frozen.x).toBe(cx(1));
        expect(frozen.knockback?.knockbackElapsed).toBe(0);
        expect(control.knockback?.knockbackElapsed ?? 0.6).toBeGreaterThan(0.3);

        for (let i = 0; i < 120; i++) h.tick();
        expect(frozen.localFrozen).toBe(false);
        expect(frozen.knockback).toBeNull();
        expect(control.knockback).toBeNull();
        // Same total displacement: the arc was stored while frozen, not skipped.
        expect(frozen.x - cx(1)).toBeCloseTo(control.x - cx(1), 6);
        expect(frozen.x - cx(1)).toBeGreaterThan(120);
    });

    it('frozen units are not parallel waiters', () => {
        const player = makeUnit('hero', cx(1), cx(2));
        player.ownerId = 'p1';
        player.teamId = 'player';
        const h = makeHarness([player]);
        const orders = new OrderManager(h.engine, () => {});
        expect(orders.collectParallelWaiters().map((w) => w.unitId)).toEqual(['hero']);
        player.localFrozen = true;
        expect(orders.collectParallelWaiters()).toEqual([]);
        expect(orders.shouldPauseForOrders(player)).toBe(false);
    });

    it('orders for a frozen unit are held and apply on the first tick it thaws', () => {
        const player = makeUnit('hero', cx(1), cx(2));
        player.ownerId = 'p1';
        player.teamId = 'player';
        const h = makeHarness([player]);
        const orders = new OrderManager(h.engine, () => {});
        (h.engine as unknown as { mixOrderFingerprint: () => void }).mixOrderFingerprint = () => {};
        (h.engine as unknown as { pendingOrders: unknown[] }).pendingOrders = [];
        const order = {
            unitId: 'hero',
            abilityId: 'wait',
            targets: [],
            movePath: [{ col: 5, row: 2 }],
            endTurn: true,
        };
        player.localFrozen = true;
        h.engine.gameTick = 10;
        orders.queueOrder(10, order);
        expect(player.movement).toBeNull();
        expect(orders.pendingOrders.map((o) => o.gameTick)).toContain(11);

        // Still frozen next tick: re-held for tick 12.
        h.engine.gameTick = 11;
        const at11 = orders.pendingOrders.find((o) => o.gameTick === 11)!;
        orders.applyOrderLogic(at11.order);
        expect(player.movement).toBeNull();
        expect(orders.pendingOrders.some((o) => o.gameTick === 12)).toBe(true);

        // Thawed: applies.
        player.localFrozen = false;
        h.engine.gameTick = 12;
        orders.applyOrderLogic(order);
        expect(player.movement).not.toBeNull();
    });
});
