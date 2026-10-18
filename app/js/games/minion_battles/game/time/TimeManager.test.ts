import { describe, it, expect } from 'vitest';
import { FIXED_DT } from '../gameConstants';
import { TimeManager, computeWorldPace } from './TimeManager';
import { resolveFocalWorldPaceRequest, resolveTempo, type TimeModifier } from './TimeModifier';
import { MAX_TIME_STOP_TICK_SECONDS, TEMPO_MAX, TEMPO_MIN, WORLD_PACE_MIN } from './timeConstants';

const mod = (tempo: number, extra: Partial<TimeModifier> = {}): TimeModifier => ({ sourceId: 's', tempo, ...extra });

describe('TimeModifier helpers', () => {
    it('resolves to exactly 1 with no modifiers', () => {
        expect(resolveTempo([])).toBe(1);
    });
    it('multiplies stacked modifiers', () => {
        expect(resolveTempo([mod(2), mod(1.5)])).toBe(3);
        expect(resolveTempo([mod(2), mod(0.5)])).toBe(1);
    });
    it('clamps to [TEMPO_MIN, TEMPO_MAX]', () => {
        expect(resolveTempo([mod(1000)])).toBe(TEMPO_MAX);
        expect(resolveTempo([mod(0.00001)])).toBe(TEMPO_MIN);
    });
    it('freeze gives 0', () => {
        expect(resolveTempo([mod(2), mod(1, { freeze: true })])).toBe(0);
    });
    it('focal request defaults to 1 / tempo and honours an explicit pace', () => {
        expect(resolveFocalWorldPaceRequest(mod(2, { focal: {} }))).toBe(0.5);
        expect(resolveFocalWorldPaceRequest(mod(1.5, { focal: { worldPace: 0.75 } }))).toBe(0.75);
        expect(resolveFocalWorldPaceRequest(mod(1000, { focal: {} }))).toBeGreaterThanOrEqual(WORLD_PACE_MIN);
        expect(resolveFocalWorldPaceRequest(mod(0.5, { focal: {} }))).toBe(1);
    });
});

describe('TimeManager', () => {
    it('is pace 1 with no modifiers and step rate equals tempo', () => {
        const tm = new TimeManager();
        tm.resolveWorldPace([], 1);
        expect(tm.worldPace).toBe(1);
        expect(tm.isDefault()).toBe(true);
        expect(tm.getStepRate({ id: 'a' })).toBe(1);
        expect(tm.getStepRate({ id: 'a' }, 2)).toBe(2);
    });

    it('two focal hastes take the min pace', () => {
        expect(computeWorldPace([0.5, 0.25])).toBe(0.25);
        const tm = new TimeManager();
        tm.resolveWorldPace([0.5, 0.25], 1);
        expect(tm.worldPace).toBe(0.25);
        expect(tm.getStepRate({ id: 'a' })).toBe(0.25);
        expect(tm.getStepRate({ id: 'a' }, 4)).toBe(1);
    });

    it('clamps world pace to WORLD_PACE_MIN', () => {
        expect(computeWorldPace([0])).toBe(WORLD_PACE_MIN);
    });

    it('Time Stop sets pace 0, exempts actors, and expires by tick time', () => {
        const tm = new TimeManager();
        const stop = tm.startTimeStop({ sourceActorId: 'c', durationTickSeconds: 10 * FIXED_DT, exemptActorIds: ['c'] }, 5);
        expect(stop.durationTicks).toBe(10);
        for (let tick = 6; tick <= 15; tick++) {
            tm.resolveWorldPace([0.5], tick);
            expect(tm.worldPace).toBe(0);
            expect(tm.getStepRate({ id: 'c' }, 2)).toBe(2);
            expect(tm.getStepRate({ id: 'x' }, 2)).toBe(0);
        }
        const ended = tm.resolveWorldPace([0.5], 16);
        expect(ended).toHaveLength(1);
        expect(tm.worldPace).toBe(0.5);
        expect(tm.isTimeStopActive).toBe(false);
    });

    it('clamps Time Stop duration', () => {
        const tm = new TimeManager();
        const stop = tm.startTimeStop({ durationTickSeconds: 999 }, 0);
        expect(stop.durationTicks).toBe(Math.round(MAX_TIME_STOP_TICK_SECONDS / FIXED_DT));
    });

    it('endTimeStop removes a stop', () => {
        const tm = new TimeManager();
        const stop = tm.startTimeStop({ durationTickSeconds: 1 }, 0);
        expect(tm.endTimeStop(stop.id)).toBeDefined();
        expect(tm.endTimeStop(stop.id)).toBeUndefined();
        tm.resolveWorldPace([], 1);
        expect(tm.worldPace).toBe(1);
    });

    it('round-trips through JSON', () => {
        const tm = new TimeManager();
        tm.startTimeStop(
            { sourceActorId: 'c', durationTickSeconds: 1, exemptActorIds: ['c'], exemptRate: 2, frozenHitPolicy: 'onResume' },
            3,
        );
        tm.resolveWorldPace([], 4);
        const copy = TimeManager.fromJSON(JSON.parse(JSON.stringify(tm.toJSON())));
        expect(copy.toJSON()).toEqual(tm.toJSON());
        expect(copy.getStepRate({ id: 'c' })).toBe(2);
        copy.startTimeStop({ durationTickSeconds: 1 }, 4);
        expect(copy.timeStops[1].id).toBe('timestop_1');
    });
});
