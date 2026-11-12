import { describe, expect, it } from 'vitest';
import { SENSE_DEFS } from '../visibility/senses';
import { PULSE_STYLES, indicatorStyleForDetection, pulsePhaseOffset, pulseRings } from './senseIndicatorStyles';

describe('PULSE_STYLES', () => {
    it('has a style for every sense indicator in SENSE_DEFS', () => {
        for (const def of Object.values(SENSE_DEFS)) {
            if (def.indicatorStyle) expect(PULSE_STYLES[def.indicatorStyle]).toBeDefined();
        }
    });

    it('makes tremorsense stronger than hearing: bigger radius, thicker lines, higher alpha, more rings', () => {
        const { hearing, tremorsense } = PULSE_STYLES;
        expect(tremorsense.maxRadiusScale).toBeGreaterThan(hearing.maxRadiusScale);
        expect(tremorsense.lineWidth).toBeGreaterThan(hearing.lineWidth);
        expect(tremorsense.alpha).toBeGreaterThan(hearing.alpha);
        expect(tremorsense.rings).toBeGreaterThan(hearing.rings);
    });
});

describe('indicatorStyleForDetection', () => {
    it('maps heard and felt to their sense styles and visible / hidden tiers to none', () => {
        expect(indicatorStyleForDetection('heard')).toBe('hearing');
        expect(indicatorStyleForDetection('felt')).toBe('tremorsense');
        expect(indicatorStyleForDetection('seen')).toBeNull();
        expect(indicatorStyleForDetection('glimpsed')).toBeNull();
        expect(indicatorStyleForDetection('hidden')).toBeNull();
    });
});

describe('pulseRings', () => {
    const style = PULSE_STYLES.hearing;

    it('returns one ring per style ring', () => {
        expect(pulseRings(style, 0, 0)).toHaveLength(style.rings);
        expect(pulseRings(PULSE_STYLES.tremorsense, 0, 0)).toHaveLength(PULSE_STYLES.tremorsense.rings);
    });

    it('expands and fades a ring over its period, then restarts', () => {
        const at = (t: number) => pulseRings(style, t * style.periodSec, 0)[0]!;
        const start = at(0);
        const mid = at(0.5);
        const late = at(0.95);
        expect(start.radiusScale).toBeCloseTo(style.startRadiusShare * style.maxRadiusScale);
        expect(start.alpha).toBeCloseTo(style.alpha);
        expect(mid.radiusScale).toBeGreaterThan(start.radiusScale);
        expect(late.radiusScale).toBeGreaterThan(mid.radiusScale);
        expect(late.radiusScale).toBeLessThanOrEqual(style.maxRadiusScale);
        expect(mid.alpha).toBeLessThan(start.alpha);
        expect(late.alpha).toBeLessThan(mid.alpha);
        expect(at(1).radiusScale).toBeCloseTo(start.radiusScale);
    });

    it('tremorsense rings reach a bigger radius than hearing rings at the same point in the cycle', () => {
        const h = pulseRings(PULSE_STYLES.hearing, 0.9 * PULSE_STYLES.hearing.periodSec, 0)[0]!;
        const t = pulseRings(PULSE_STYLES.tremorsense, 0.9 * PULSE_STYLES.tremorsense.periodSec, 0)[0]!;
        expect(t.radiusScale).toBeGreaterThan(h.radiusScale);
    });

    it('a phase offset shifts the rings', () => {
        const base = pulseRings(style, 0, 0);
        const shifted = pulseRings(style, 0, 0.3);
        expect(shifted[0]!.radiusScale).not.toBeCloseTo(base[0]!.radiusScale);
        // Offsetting by the time equivalent gives the same rings.
        const viaTime = pulseRings(style, 0.3 * style.periodSec, 0);
        expect(shifted[0]!.radiusScale).toBeCloseTo(viaTime[0]!.radiusScale);
        expect(shifted[0]!.alpha).toBeCloseTo(viaTime[0]!.alpha);
    });
});

describe('pulsePhaseOffset', () => {
    it('is stable per id, within [0, 1), and differs between ids', () => {
        const a = pulsePhaseOffset('unit_1');
        expect(pulsePhaseOffset('unit_1')).toBe(a);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThan(1);
        expect(pulsePhaseOffset('unit_2')).not.toBe(a);
    });
});
