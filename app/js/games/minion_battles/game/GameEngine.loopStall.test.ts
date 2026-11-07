/**
 * GameEngine loop keeps simulating when requestAnimationFrame stalls (hidden / minimized page).
 * In co-op the host drives ticks, so a stalled host loop froze the battle for every player
 * (docs/ideas/plans/0003 P0.8).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from './GameEngine';
import { resetGameObjectIdCounter } from './GameObject';
import { DARK_AWAKENING } from '../storylines/WorldOfDarkness/missions/001_dark_awakening';

type RafCallback = (ts: number) => void;

function makeEngine(): GameEngine {
    resetGameObjectIdCounter(1);
    const engine = new GameEngine();
    engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
    DARK_AWAKENING.initializeGameState(engine, {
        playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
        localPlayerId: 'p1',
        eventBus: engine.eventBus,
        equippedItemsByPlayer: { p1: ['001'] },
    });
    // New games start paused until the session binds; the live session clears it the same way.
    engine.isPaused = false;
    return engine;
}

describe('GameEngine loop when requestAnimationFrame stalls', () => {
    let pendingRaf: Map<number, RafCallback>;
    let nextRafId: number;

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
        pendingRaf = new Map();
        nextRafId = 1;
        vi.stubGlobal('requestAnimationFrame', (cb: RafCallback) => {
            const id = nextRafId++;
            pendingRaf.set(id, cb);
            return id;
        });
        vi.stubGlobal('cancelAnimationFrame', (id: number) => {
            pendingRaf.delete(id);
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('keeps advancing ticks from the fallback timer when no animation frame ever fires', () => {
        const engine = makeEngine();
        const startTick = engine.gameTick;
        engine.start();
        // A hidden page: rAF callbacks are queued but never run.
        vi.advanceTimersByTime(2000);
        // 2s at 60 Hz is 120 ticks; allow for the stall-detection delay and an early order pause.
        expect(engine.gameTick).toBeGreaterThan(startTick);
        expect(engine.waitingForOrders != null || engine.gameTick - startTick >= 90).toBe(true);
        engine.destroy();
    });

    it('never keeps more than one animation frame pending while the fallback runs', () => {
        const engine = makeEngine();
        engine.start();
        vi.advanceTimersByTime(1000);
        expect(pendingRaf.size).toBeLessThanOrEqual(1);
        engine.destroy();
    });

    it('stops the fallback timer on stop()', () => {
        const engine = makeEngine();
        engine.start();
        vi.advanceTimersByTime(500);
        engine.stop();
        const tick = engine.gameTick;
        vi.advanceTimersByTime(1000);
        expect(engine.gameTick).toBe(tick);
        engine.destroy();
    });

    it('does not double-step when animation frames are running normally', () => {
        const engine = makeEngine();
        const startTick = engine.gameTick;
        engine.start();
        // Deliver a frame every 16ms for 1s, like a visible page.
        for (let i = 0; i < 60; i++) {
            vi.advanceTimersByTime(16);
            const [[id, cb]] = [...pendingRaf.entries()];
            pendingRaf.delete(id);
            cb(performance.now());
        }
        // About 58 ticks in 960ms; the fallback must not add its own steps on top.
        const advanced = engine.gameTick - startTick;
        if (engine.waitingForOrders == null) {
            expect(advanced).toBeLessThanOrEqual(62);
        }
        expect(advanced).toBeGreaterThan(0);
        engine.destroy();
    });
});

describe('GameEngine loop does not drain leftover frame time while paused (P0.16)', () => {
    let pendingRaf: Map<number, RafCallback>;
    let nextRafId: number;

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
        pendingRaf = new Map();
        nextRafId = 1;
        vi.stubGlobal('requestAnimationFrame', (cb: RafCallback) => {
            const id = nextRafId++;
            pendingRaf.set(id, cb);
            return id;
        });
        vi.stubGlobal('cancelAnimationFrame', (id: number) => {
            pendingRaf.delete(id);
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    function deliverFrame(advanceMs: number): void {
        vi.advanceTimersByTime(advanceMs);
        const [[id, cb]] = [...pendingRaf.entries()];
        pendingRaf.delete(id);
        cb(performance.now());
    }

    // Playtest 0003, lobby 9A0775: an ITS preview pauses the engine (isPaused, no order batch) mid-frame.
    // The frame's leftover accumulator then drained through real ticks on the following frames while the
    // in-place persist was in flight, so the host formed the caster's next order pause 1-4 ticks late.
    it('a pause set mid-frame stops ticks on later frames', () => {
        const engine = makeEngine();
        // Like a host ITS preview: order pauses are dropped, so the only thing holding the engine is isPaused.
        engine.isSequentialTargetingPreview = true;
        const internals = engine as unknown as { fixedUpdate: (dt: number) => void };
        const original = internals.fixedUpdate.bind(engine);
        let calls = 0;
        internals.fixedUpdate = (dt: number) => {
            original(dt);
            calls++;
            if (calls === 1) engine.isPaused = true; // like isITSPreviewComplete pausing the preview
        };
        engine.start();
        deliverFrame(100); // one long frame: about six ticks of time, paused after the first
        const tickAtPause = engine.gameTick;
        for (let i = 0; i < 5; i++) deliverFrame(16);
        expect(engine.gameTick).toBe(tickAtPause);
        engine.destroy();
    });
});
