import { describe, expect, it, vi } from 'vitest';
import { defineAbility } from '../../abilities/defineAbility';
import { AbilityPhase } from '../../abilities/abilityTimings';
import { registerAbilityForTest } from '../../abilities/AbilityRegistry';
import { executeUnitAbility } from '../units/unitAbilityLifecycle';
import { tickUnitActiveAbilities } from '../units/unitAbilityTick';
import { Unit } from '../units/Unit';
import { EventBus } from '../EventBus';
import type { EngineContext } from '../EngineContext';
import { serializeUnit } from '../units/unitToJSON';
import { Buff } from '../../buffs/Buff';
import { FIXED_DT } from '../gameConstants';
import { TimeManager } from './TimeManager';
import type { TimeModifier } from './TimeModifier';
import {
    advanceUnitLocalClocks,
    collectUnitFocalRequests,
    getActorTempo,
    getCastElapsed,
    localNow,
} from './actorClock';

const ABILITY_ID = 'test_actor_clock_cast';

const CastOneSecond = defineAbility({
    id: ABILITY_ID,
    name: 'Clock Probe',
    image: '',
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: 0,
    targets: [],
    abilityTimings: [{ id: 'active', start: 0, end: 1, abilityPhase: AbilityPhase.Active }],
    getTooltipText: () => ['Clock probe'],
    getRange: () => ({ minRange: 0, maxRange: 100 }),
});

class TempoBuff extends Buff {
    readonly _type = 'test_tempo';
    override readonly timeModifier: TimeModifier;
    constructor(tempo: number, focal: boolean, opts: { freeze?: boolean } = {}) {
        super({ value: 100, unit: 'seconds' });
        this.timeModifier = {
            sourceId: 'test',
            tempo,
            ...(focal ? { focal: {} } : {}),
            ...(opts.freeze ? { freeze: true } : {}),
        };
    }
}

class OwnerClockBuff extends Buff {
    readonly _type = 'test_owner_clock';
    override readonly clock = 'owner' as const;
    constructor(seconds: number) {
        super({ value: seconds, unit: 'seconds' });
    }
}

function makeUnit(id = 'caster'): Unit {
    const unit = new Unit({
        id,
        x: 100,
        y: 100,
        hp: 100,
        maxHp: 100,
        speed: 100,
        teamId: 'player',
        ownerId: 'p1',
        characterId: 'player',
        name: id,
        abilities: [ABILITY_ID],
    });
    unit.abilityRuntime[ABILITY_ID] = {
        currentUses: 1,
        maxUses: 1,
        recoveryChargesByType: {},
        active: true,
        replacedAbilityId: null,
    };
    return unit;
}

interface ClockEngine extends EngineContext {
    timeManager: TimeManager;
}

function makeEngine(units: Unit[]): ClockEngine {
    return {
        gameTime: 0,
        gameTick: 0,
        roundNumber: 1,
        eventBus: new EventBus(),
        units,
        timeManager: new TimeManager(),
        terrainManager: null,
        getUnit: (id: string) => units.find((u) => u.id === id),
        trackAbilityUse: vi.fn(),
        addEffectEmitter: vi.fn(),
        addEffect: vi.fn(),
    } as unknown as ClockEngine;
}

/** One engine tick, in the same order as `GameEngine.fixedUpdate` (pace, gameTime, local clocks, units). */
function tick(engine: ClockEngine, units: Unit[]): void {
    engine.timeManager.resolveWorldPace(collectUnitFocalRequests(units), engine.gameTick + 1);
    const pace = engine.timeManager.worldPace;
    const worldDt = pace === 1 ? FIXED_DT : FIXED_DT * pace;
    const prev = engine.gameTime;
    engine.gameTime += worldDt;
    engine.gameTick++;
    advanceUnitLocalClocks(units, engine, FIXED_DT, prev);
    for (const u of units) tickUnitActiveAbilities(u, worldDt, engine, vi.fn());
}

function ticksToFinishCast(unit: Unit, engine: ClockEngine): number {
    registerAbilityForTest(CastOneSecond);
    tick(engine, [unit]); // start the local clock
    executeUnitAbility(unit, CastOneSecond, [], engine);
    let ticks = 0;
    while (unit.activeAbilities.length > 0 && ticks < 1000) {
        tick(engine, [unit]);
        ticks++;
    }
    return ticks;
}

describe('actorClock', () => {
    it('getActorTempo multiplies buff modifiers and freezes on freeze', () => {
        const unit = makeUnit();
        expect(getActorTempo(unit)).toBe(1);
        unit.addBuff(new TempoBuff(2, false), 0, 1);
        expect(getActorTempo(unit)).toBe(2);
        unit.addBuff(new TempoBuff(1.5, false), 0, 1);
        expect(getActorTempo(unit)).toBe(3);
        unit.addBuff(new TempoBuff(1, false, { freeze: true }), 0, 1);
        expect(getActorTempo(unit)).toBe(0);
    });

    it('focal buffs request world pace 1/tempo; local ones do not', () => {
        const a = makeUnit('a');
        const b = makeUnit('b');
        expect(collectUnitFocalRequests([a, b])).toEqual([]);
        a.addBuff(new TempoBuff(2, true), 0, 1);
        b.addBuff(new TempoBuff(2, false), 0, 1);
        expect(collectUnitFocalRequests([a, b])).toEqual([0.5]);
    });

    it('pace 1, tempo 1: localTime tracks gameTime bit for bit, even for a late-starting clock', () => {
        const unit = makeUnit();
        const engine = makeEngine([unit]);
        for (let i = 0; i < 50; i++) tick(engine, [unit]);
        const late = makeUnit('late');
        const units = [unit, late];
        for (let i = 0; i < 200; i++) tick(engine, units);
        expect(unit.localTime).toBe(engine.gameTime);
        expect(late.localTime).toBe(engine.gameTime);
    });

    it('a tempo-2 unit finishes a cast in half the world time; tempo 1 is unchanged', () => {
        const base = makeUnit();
        const baseEngine = makeEngine([base]);
        const baseTicks = ticksToFinishCast(base, baseEngine);

        const fast = makeUnit();
        fast.addBuff(new TempoBuff(2, false), 0, 1);
        const fastEngine = makeEngine([fast]);
        const fastTicks = ticksToFinishCast(fast, fastEngine);

        expect(Math.abs(baseTicks - 60)).toBeLessThanOrEqual(1);
        expect(Math.abs(fastTicks - 30)).toBeLessThanOrEqual(1);
    });

    it('a focal tempo-2 unit looks normal speed: same ticks as tempo 1, half the world time', () => {
        const fast = makeUnit();
        fast.addBuff(new TempoBuff(2, true), 0, 1);
        const engine = makeEngine([fast]);
        const t0 = engine.gameTime;
        const ticks = ticksToFinishCast(fast, engine);
        expect(Math.abs(ticks - 60)).toBeLessThanOrEqual(1);
        expect(engine.gameTime - t0).toBeLessThan(0.55);
        expect(engine.timeManager.worldPace).toBe(0.5);
    });

    it('getCastElapsed reads the unit local clock and falls back to world time before it starts', () => {
        const unit = makeUnit();
        const engine = makeEngine([unit]);
        expect(localNow(unit, 5)).toBe(5);
        expect(getCastElapsed(unit, { startTime: 2 }, { gameTime: 5 })).toBe(3);
        tick(engine, [unit]);
        unit.localTime = 10;
        expect(getCastElapsed(unit, { startTime: 4 }, { gameTime: 99 })).toBe(6);
    });

    it('owner-clock buff expiry follows local time, not world time', () => {
        const unit = makeUnit();
        const engine = makeEngine([unit]);
        unit.addBuff(new TempoBuff(0.5, false), 0, 1);
        tick(engine, [unit]);
        const buff = new OwnerClockBuff(1);
        unit.addBuff(buff, engine.gameTime, 1);
        expect(buff.appliedAtTime).toBe(unit.localTime);
        // 1.5 world seconds at tempo 0.5 is 0.75 local seconds: still alive.
        while (engine.gameTime < 1.5) tick(engine, [unit]);
        expect(buff.isExpired(engine.gameTime, 1, unit.localTime)).toBe(false);
        // A world-clock reading would call it expired; the owner clock does not.
        expect(engine.gameTime - buff.appliedAtTime >= 1).toBe(true);
        while (!buff.isExpired(engine.gameTime, 1, unit.localTime)) tick(engine, [unit]);
        expect(engine.gameTime).toBeGreaterThan(1.99);
    });

    it('round-trips localTime and timeDebt through unit JSON', () => {
        const unit = makeUnit();
        const engine = makeEngine([unit]);
        for (let i = 0; i < 10; i++) tick(engine, [unit]);
        unit.timeDebt = 0.125;
        const json = JSON.parse(JSON.stringify(serializeUnit(unit, 0))) as Record<string, unknown>;
        const restored = Unit.fromJSON(json, new EventBus(), 0);
        expect(restored.localTime).toBe(unit.localTime);
        expect(restored.localClockActive).toBe(true);
        expect(restored.timeDebt).toBe(0.125);
    });

    it('a unit whose clock never started serializes without clock fields', () => {
        const json = serializeUnit(makeUnit(), 0);
        expect('localTime' in json).toBe(false);
        expect('timeDebt' in json).toBe(false);
    });
});
