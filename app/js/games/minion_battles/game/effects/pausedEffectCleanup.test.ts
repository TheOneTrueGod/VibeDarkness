/**
 * A battle left at an order pause must not pile up finished effects. No game tick runs while halted, but
 * 'continue' emitters and auras (here the spirit dog's motes, 9/s) keep spawning render-only effects; the
 * tick's cleanup never ran, so an overnight pause grew the list (and one Pixi visual per effect) without bound.
 */
import { describe, expect, it } from 'vitest';
import { GameEngine } from '../GameEngine';
import { resetGameObjectIdCounter } from '../GameObject';
import { MOTE_EFFECT_TYPE } from './motes';
import { DARK_AWAKENING } from '../../storylines/WorldOfDarkness/missions/001_dark_awakening';

function makeHaltedEngineWithAura(): GameEngine {
    resetGameObjectIdCounter(1);
    const engine = new GameEngine();
    engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
    DARK_AWAKENING.initializeGameState(engine, {
        playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
        localPlayerId: 'p1',
        eventBus: engine.eventBus,
        equippedItemsByPlayer: { p1: ['001'] },
    });
    engine.isPaused = false;
    engine.stepSimulationFixedTicks(60);
    // Give a unit the spirit dog's def-level mote aura, which emits while halted.
    const unit = engine.units.find((u) => u.active && u.isAlive())!;
    unit.characterId = 'dog';
    engine.isPaused = true;
    return engine;
}

describe('effects while the simulation is halted', () => {
    it('stay bounded over a long pause', () => {
        const engine = makeHaltedEngineWithAura();
        expect(engine.isSimulationHalted).toBe(true);
        const startTick = engine.gameTick;
        let maxEffects = 0;
        let motesSeen = 0;
        // Five minutes of 60 fps render frames: about 2,700 motes spawned.
        for (let i = 0; i < 60 * 60 * 5; i++) {
            engine.doRenderTick(1 / 60);
            maxEffects = Math.max(maxEffects, engine.effects.length);
            if (i === 60 * 30) motesSeen = engine.effects.filter((e) => e.effectType === MOTE_EFFECT_TYPE).length;
        }
        expect(engine.gameTick).toBe(startTick);
        // The aura is really emitting while halted...
        expect(motesSeen).toBeGreaterThan(0);
        // ...but only live effects stay in the list.
        expect(engine.effects.every((e) => e.active)).toBe(true);
        expect(maxEffects).toBeLessThan(100);
        engine.destroy();
    });
});
