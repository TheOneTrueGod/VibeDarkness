import { describe, expect, it } from 'vitest';
import {
    SIPHON_DROPLET_TRAVEL_SEC,
    SIPHON_DROPLETS_PER_TILE,
    siphonDrainedFraction,
    siphonDropletPose,
    siphonRipple,
    siphonTileSeed,
} from './siphonVisual';

describe('siphon visual maths', () => {
    it('reports the drained share of a tile, 0 for an untouched one', () => {
        expect(siphonDrainedFraction(undefined)).toBe(0);
        expect(siphonDrainedFraction({ health: 1, maxHealth: 1 })).toBe(0);
        expect(siphonDrainedFraction({ health: 0.625, maxHealth: 1 })).toBeCloseTo(0.375);
        expect(siphonDrainedFraction({ health: -0.1, maxHealth: 1 })).toBe(1);
        expect(siphonDrainedFraction({ health: 1, maxHealth: 0 })).toBe(0);
    });

    it('moves a droplet from the tile to the unit over its travel time', () => {
        // Seed 0, droplet 0: starts at the tile at time 0, nearly at the unit just before it loops.
        const start = siphonDropletPose(0, 0, 100, 0, 0, 0, 0);
        expect(start.x).toBeCloseTo(0);
        expect(start.alpha).toBe(0);
        const late = siphonDropletPose(0, 0, 100, 0, SIPHON_DROPLET_TRAVEL_SEC * 0.95, 0, 0);
        expect(late.x).toBeGreaterThan(85);
        expect(late.scale).toBeLessThan(0.6);
        const mid = siphonDropletPose(0, 0, 100, 0, SIPHON_DROPLET_TRAVEL_SEC * 0.5, 0, 0);
        expect(mid.alpha).toBe(1);
        expect(Math.abs(mid.y)).toBeGreaterThan(0); // bows off the straight line
    });

    it('spaces the droplets of one stream evenly', () => {
        const xs = Array.from({ length: SIPHON_DROPLETS_PER_TILE }, (_, k) => siphonDropletPose(0, 0, 100, 0, 0, k, 0).x);
        expect(new Set(xs.map((x) => x.toFixed(3))).size).toBe(SIPHON_DROPLETS_PER_TILE);
    });

    it('gives neighbouring tiles different seeds and keeps them stable', () => {
        expect(siphonTileSeed(3, 4)).toBe(siphonTileSeed(3, 4));
        expect(siphonTileSeed(3, 4)).not.toBe(siphonTileSeed(4, 4));
        expect(siphonTileSeed(3, 4)).toBeGreaterThanOrEqual(0);
        expect(siphonTileSeed(3, 4)).toBeLessThan(1);
    });

    it('spreads and fades a ripple', () => {
        const early = siphonRipple(0, 0);
        const late = siphonRipple(1.3, 0);
        expect(late.radiusScale).toBeGreaterThan(early.radiusScale);
        expect(late.alpha).toBeLessThan(early.alpha);
    });
});
