/**
 * Time Stop entry point, events, exempt actors and the frozen-hit policy (plan Step 7). Real GameEngine.
 */
import { describe, it, expect } from 'vitest';
import { GameEngine } from '../GameEngine';
import { resetGameObjectIdCounter } from '../GameObject';
import { DARK_AWAKENING } from '../../storylines/WorldOfDarkness/missions/001_dark_awakening';
import { FIXED_DT } from '../gameConstants';
import { fingerprintToHex } from '../Fingerprint';
import { Unit } from '../units/Unit';
import { defineAbility } from '../../abilities/defineAbility';
import { AbilityPhase } from '../../abilities/abilityTimings';
import { registerAbilityForTest } from '../../abilities/AbilityRegistry';
import { executeUnitAbility } from '../units/unitAbilityLifecycle';
import { MAX_TIME_STOP_TICK_SECONDS } from './timeConstants';
import type { TimeStopEndedEvent, TimeStopStartedEvent, WorldPaceChangedEvent } from '../EventBus';

const CAST_ID = 'test_time_stop_cast';
const OneSecondCast = defineAbility({
    id: CAST_ID,
    name: 'Time Stop Probe',
    image: '',
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: 0,
    targets: [],
    abilityTimings: [{ id: 'active', start: 0, end: 1, abilityPhase: AbilityPhase.Active }],
    getTooltipText: () => ['probe'],
    getRange: () => ({ minRange: 0, maxRange: 100 }),
});

function makeEngine(): GameEngine {
    resetGameObjectIdCounter(1);
    const engine = new GameEngine();
    engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
    DARK_AWAKENING.initializeGameState(engine, {
        playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
        localPlayerId: 'p1',
        eventBus: engine.eventBus,
        equippedItemsByPlayer: { p1: ['004'] },
    });
    engine.isPaused = false;
    return engine;
}

function runTicks(engine: GameEngine, n: number): void {
    const target = engine.gameTick + n;
    let guard = 0;
    while (engine.gameTick < target && guard++ < n * 4 + 20) {
        (engine as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
        const waiting = engine.waitingForOrders;
        if (waiting) {
            for (const waiter of waiting.waiters) {
                if (engine.state.orderMgr.hasAnyPendingOrderForUnit(waiter.unitId, waiting.atTick)) continue;
                engine.state.orderMgr.queueOrder(waiting.atTick, {
                    unitId: waiter.unitId,
                    abilityId: 'wait',
                    targets: [],
                    endTurn: true,
                });
            }
            engine.tryResumeParallel();
        }
    }
}

/** A sturdy, harmless-by-distance enemy-side unit to freeze. */
function addVictim(engine: GameEngine, id = 'victim', hp = 100): Unit {
    const hero = engine.units.find((u) => u.isPlayerControlled())!;
    const victim = new Unit({
        id,
        x: hero.x + 600,
        y: hero.y,
        hp,
        maxHp: hp,
        speed: 0,
        teamId: 'enemy',
        ownerId: 'ai',
        characterId: 'swarmling',
        name: id,
        abilities: [],
    });
    engine.state.unitManager.addUnit(victim);
    return victim;
}

function heroOf(engine: GameEngine): Unit {
    return engine.units.find((u) => u.isPlayerControlled())!;
}

const ticksFor = (seconds: number) => Math.round(seconds / FIXED_DT);

describe('Time Stop', () => {
    it('exempt caster keeps casting, others freeze, gameTime holds, and the stop ends on its tick-time duration', () => {
        registerAbilityForTest(OneSecondCast);
        const engine = makeEngine();
        const hero = heroOf(engine);
        const victim = addVictim(engine);
        hero.abilities = [...hero.abilities, CAST_ID];
        hero.abilityRuntime[CAST_ID] = { currentUses: 1, maxUses: 1, recoveryChargesByType: {}, active: true, replacedAbilityId: null };
        runTicks(engine, 3);

        const started: TimeStopStartedEvent[] = [];
        const ended: TimeStopEndedEvent[] = [];
        const paces: WorldPaceChangedEvent[] = [];
        engine.eventBus.on('time_stop_started', (e) => started.push(e));
        engine.eventBus.on('time_stop_ended', (e) => ended.push(e));
        engine.eventBus.on('world_pace_changed', (e) => paces.push(e));

        executeUnitAbility(hero, OneSecondCast, [], engine);
        const stop = engine.startTimeStop({ sourceActorId: hero.id, durationTickSeconds: 30 * FIXED_DT, exemptActorIds: [hero.id] });
        expect(started).toHaveLength(1);
        expect(started[0]).toMatchObject({ id: stop.id, sourceActorId: hero.id, durationTicks: 30, exemptRate: 1 });

        const gameTime0 = engine.gameTime;
        const heroLocal0 = hero.localTime;
        const victimLocal0 = victim.localTime;
        const tickBefore = engine.gameTick;
        runTicks(engine, 30);
        expect(engine.gameTick - tickBefore).toBe(30);
        expect(engine.gameTime).toBe(gameTime0);
        expect(victim.localTime).toBe(victimLocal0);
        expect(victim.localFrozen).toBe(true);
        expect(hero.localTime - heroLocal0).toBeCloseTo(30 * FIXED_DT, 9);
        const cast = hero.activeAbilities.find((a) => a.abilityId === CAST_ID);
        expect(cast).toBeDefined();
        expect(engine.tickTime).toBeCloseTo(engine.gameTick * FIXED_DT, 12);
        expect(paces).toEqual([{ previousPace: 1, worldPace: 0, gameTick: tickBefore + 1 }]);
        expect(ended).toHaveLength(0);

        runTicks(engine, 1);
        expect(ended).toEqual([{ id: stop.id, sourceActorId: hero.id, reason: 'expired', gameTick: engine.gameTick }]);
        expect(paces).toHaveLength(2);
        expect(paces[1]).toMatchObject({ previousPace: 0, worldPace: 1 });
        expect(engine.gameTime).toBeGreaterThan(gameTime0);
        expect(victim.localFrozen).toBe(false);
        engine.destroy();
    });

    it('clamps the duration to MAX_TIME_STOP_TICK_SECONDS', () => {
        const engine = makeEngine();
        const stop = engine.startTimeStop({ durationTickSeconds: 999 });
        expect(stop.durationTicks).toBe(ticksFor(MAX_TIME_STOP_TICK_SECONDS));
        engine.destroy();
    });

    it('endTimeStop ends it early and emits time_stop_ended', () => {
        const engine = makeEngine();
        const ended: TimeStopEndedEvent[] = [];
        engine.eventBus.on('time_stop_ended', (e) => ended.push(e));
        const stop = engine.startTimeStop({ durationTickSeconds: 2 });
        runTicks(engine, 2);
        expect(engine.worldPace).toBe(0);
        expect(engine.endTimeStop(stop.id)).toBe(true);
        expect(engine.endTimeStop(stop.id)).toBe(false);
        expect(ended).toMatchObject([{ id: stop.id, reason: 'ended' }]);
        runTicks(engine, 1);
        expect(engine.worldPace).toBe(1);
        engine.destroy();
    });
});

describe('frozen-hit policy', () => {
    it("'immediate' (default) hits kill a frozen unit", () => {
        const engine = makeEngine();
        const victim = addVictim(engine, 'victim', 50);
        engine.startTimeStop({ durationTickSeconds: 1 });
        runTicks(engine, 2);
        expect(victim.localFrozen).toBe(true);
        victim.takeDamage(20, null, engine.eventBus);
        expect(victim.hp).toBe(30);
        victim.takeDamage(500, null, engine.eventBus);
        expect(victim.hp).toBe(0);
        expect(victim.isAlive()).toBe(false);
        engine.destroy();
    });

    it("'onResume' (Time Stop def) queues hits and lands them in order on thaw", () => {
        const engine = makeEngine();
        const victim = addVictim(engine, 'victim', 100);
        const hits: number[] = [];
        engine.eventBus.on('damage_taken', (e) => {
            if (e.unitId === 'victim') hits.push(e.amount);
        });
        engine.startTimeStop({ durationTickSeconds: 20 * FIXED_DT, frozenHitPolicy: 'onResume' });
        runTicks(engine, 5);
        victim.takeDamage(10, null, engine.eventBus);
        victim.takeDamage(25, null, engine.eventBus, { frozenHitPolicy: 'immediate' }); // stop's policy wins
        expect(victim.hp).toBe(100);
        expect(victim.pendingFrozenHits.map((h) => h.amount)).toEqual([10, 25]);
        runTicks(engine, 15);
        expect(victim.hp).toBe(100);
        runTicks(engine, 2);
        expect(victim.localFrozen).toBe(false);
        expect(victim.pendingFrozenHits).toHaveLength(0);
        expect(hits).toEqual([10, 25]);
        expect(victim.hp).toBe(65);
        engine.destroy();
    });

    it('per-hit option applies when the Time Stop def has no policy; a stop policy beats it', () => {
        const engine = makeEngine();
        const victim = addVictim(engine, 'victim', 100);
        const stop = engine.startTimeStop({ durationTickSeconds: 2 });
        runTicks(engine, 2);
        victim.takeDamage(10, null, engine.eventBus, { frozenHitPolicy: 'onResume' });
        expect(victim.hp).toBe(100);
        expect(victim.pendingFrozenHits).toHaveLength(1);
        engine.endTimeStop(stop.id);
        engine.startTimeStop({ durationTickSeconds: 2, frozenHitPolicy: 'immediate' });
        runTicks(engine, 1);
        victim.takeDamage(10, null, engine.eventBus, { frozenHitPolicy: 'onResume' });
        expect(victim.hp).toBe(90);
        engine.destroy();
    });

    it('a queued lethal hit kills the unit on resume', () => {
        const engine = makeEngine();
        const victim = addVictim(engine, 'victim', 20);
        engine.startTimeStop({ durationTickSeconds: 10 * FIXED_DT, frozenHitPolicy: 'onResume' });
        runTicks(engine, 3);
        victim.takeDamage(100, null, engine.eventBus);
        expect(victim.isAlive()).toBe(true);
        runTicks(engine, 10);
        expect(victim.isAlive()).toBe(false);
        engine.destroy();
    });

    it('checkpoint round-trip mid-stop keeps the Time Stop and queued hits', () => {
        const engine = makeEngine();
        const victim = addVictim(engine, 'victim', 100);
        engine.startTimeStop({ durationTickSeconds: 20 * FIXED_DT, frozenHitPolicy: 'onResume' });
        runTicks(engine, 5);
        victim.takeDamage(30, null, engine.eventBus);
        const json = JSON.parse(JSON.stringify(engine.toJSON()));
        const restored = GameEngine.fromJSON(json, 'p1', engine.terrainManager, {
            checkpointRuntimeFingerprintHex: fingerprintToHex(engine.runtimeFingerprint),
        });
        restored.isPaused = false;
        const restoredVictim = restored.units.find((u) => u.id === 'victim')!;
        expect(restored.timeManager.timeStops).toHaveLength(1);
        expect(restoredVictim.pendingFrozenHits.map((h) => h.amount)).toEqual([30]);

        runTicks(engine, 30);
        runTicks(restored, 30);
        expect(restoredVictim.hp).toBe(70);
        expect(victim.hp).toBe(70);
        expect(restored.gameTime).toBe(engine.gameTime);
        expect(restored.gameTick).toBe(engine.gameTick);
        expect(restored.worldPace).toBe(1);
        engine.destroy();
        restored.destroy();
    });
});

describe('Time Stop checkpoint determinism', () => {
    // The hero is frozen with no order yet when the checkpoint is taken. A restore that saw it as thawed (localFrozen
    // not round-tripped) inferred an order pause the canonical run never formed, so the pause after the stop shifted.
    it('a run restored mid Time Stop matches the uninterrupted run on runtime fingerprint after the stop ends', () => {
        const engine = makeEngine();
        addVictim(engine);
        engine.startTimeStop({ durationTickSeconds: 20 * FIXED_DT });
        runTicks(engine, 5);
        const json = JSON.parse(JSON.stringify(engine.toJSON()));
        const restored = GameEngine.fromJSON(json, 'p1', engine.terrainManager, {
            checkpointRuntimeFingerprintHex: fingerprintToHex(engine.runtimeFingerprint),
        });
        restored.isPaused = false;
        expect(fingerprintToHex(restored.runtimeFingerprint)).toBe(fingerprintToHex(engine.runtimeFingerprint));

        for (let i = 0; i < 60; i++) {
            runTicks(engine, 1);
            runTicks(restored, 1);
            expect(restored.gameTick).toBe(engine.gameTick);
            expect(fingerprintToHex(restored.runtimeFingerprint), `tick ${engine.gameTick}`).toBe(
                fingerprintToHex(engine.runtimeFingerprint),
            );
        }
        engine.destroy();
        restored.destroy();
    });
});
