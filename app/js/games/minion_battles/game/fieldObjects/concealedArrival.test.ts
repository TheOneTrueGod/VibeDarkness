import { describe, expect, it } from 'vitest';
import { DROPPED_WEAPON_ARC_DURATION } from '../../card_defs/10_armory_core/armoryConstants';
import { ConcealedArrivalClock } from './concealedArrival';

const FLIGHT = DROPPED_WEAPON_ARC_DURATION;
const SPAWNED_AT = 10;

describe('ConcealedArrivalClock', () => {
    it('stays hidden until game time or wall time covers the flight', () => {
        const clock = new ConcealedArrivalClock();
        expect(clock.hasArrived('sword', SPAWNED_AT, SPAWNED_AT, FLIGHT, 0)).toBe(false);
        expect(clock.hasArrived('sword', SPAWNED_AT, SPAWNED_AT, FLIGHT, FLIGHT * 1000)).toBe(true);
    });

    it('shows the picture once game time covers the flight, even with no wall time', () => {
        const clock = new ConcealedArrivalClock();
        expect(clock.hasArrived('sword', SPAWNED_AT, SPAWNED_AT + FLIGHT, FLIGHT, 0)).toBe(true);
    });

    it('forgets objects that have left the world', () => {
        const clock = new ConcealedArrivalClock();
        clock.hasArrived('gone', SPAWNED_AT, SPAWNED_AT, FLIGHT, 0);
        clock.forgetExcept(new Set(['kept']));
        expect(clock.hasArrived('gone', SPAWNED_AT, SPAWNED_AT, FLIGHT, FLIGHT * 1000)).toBe(false);
    });
});
