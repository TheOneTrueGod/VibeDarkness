import { describe, expect, it } from 'vitest';
import { Light, LIGHT_RESOURCE_MIN_LIGHT_LEVEL, LIGHT_RESOURCE_DIVISOR, MAX_LIGHT_RECOVERY_PER_ROUND } from './Light';
import { EventBus } from '../game/EventBus';
import { Unit } from '../game/units/Unit';
import type { EngineContext } from '../game/EngineContext';

function makeUnit(id: string): Unit {
    return new Unit({
        id,
        x: 0,
        y: 0,
        hp: 100,
        speed: 100,
        teamId: 'player',
        ownerId: 'p1',
        characterId: 'player',
        name: id,
    });
}

/** Minimal engine context stubbing a fixed tile light level. */
function makeEngineContext(lightLevel: number | null): EngineContext {
    return {
        getLightLevelAt: () => lightLevel,
    } as unknown as EngineContext;
}

const BRIGHT_LEVEL = LIGHT_RESOURCE_MIN_LIGHT_LEVEL + LIGHT_RESOURCE_DIVISOR * MAX_LIGHT_RECOVERY_PER_ROUND;

describe('Light resource', () => {
    it('starts at 0 with max 5', () => {
        const light = new Light();
        expect(light.current).toBe(0);
        expect(light.max).toBe(5);
    });

    it('perRoundGain is 0 before any context is set', () => {
        const light = new Light();
        expect(light.perRoundGain).toBe(0);
    });

    it('onRoundStart primes context and grants tile-based gain', () => {
        const unit = makeUnit('u1');
        const light = new Light();
        unit.attachResource(light, new EventBus());

        unit.onRoundStart(1, makeEngineContext(BRIGHT_LEVEL));
        expect(light.perRoundGain).toBe(MAX_LIGHT_RECOVERY_PER_ROUND);
        expect(light.current).toBe(MAX_LIGHT_RECOVERY_PER_ROUND);
    });

    // Regression: `UnitManager.restoreFromJSON` (checkpoint restore) constructs a fresh Light
    // instance and calls `restoreFromJSON` to copy over current/max, but that instance has never
    // seen `onRoundStart` this round. Without `primeDisplayContext`, the "+N per round" tooltip
    // read 0 until the next round boundary — see UnitManager.ts.
    it('perRoundGain reads 0 after a bare restoreFromJSON, until primeDisplayContext is called', () => {
        const unit = makeUnit('u1');
        const restored = new Light();
        restored.restoreFromJSON({ current: 3, max: 5 });
        unit.attachResource(restored, new EventBus());

        expect(restored.current).toBe(3);
        expect(restored.perRoundGain).toBe(0);

        restored.primeDisplayContext(unit, makeEngineContext(BRIGHT_LEVEL));
        expect(restored.perRoundGain).toBe(MAX_LIGHT_RECOVERY_PER_ROUND);
        // Priming must not itself grant gain (only onRoundStart should).
        expect(restored.current).toBe(3);
    });
});
