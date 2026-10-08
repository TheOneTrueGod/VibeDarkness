import { describe, it, expect } from 'vitest';
// Registry first: avoids the ability <-> registry import cycle when loading a card def directly.
import '../../../abilities/AbilityRegistry';
import { DIRECTIONAL_ORB_LOOK, ORB_DIRECTION_BLOB, ORB_SPRITE_ALPHA, stepTrailBlob } from './directionalOrb';
import { DISPLACER_BOLT_SPRITE_CONFIG } from '../../../card_defs/dark_animals/0017_DisplacerBolt/0017Ability';

describe('directional orb look', () => {
    it('is a smaller, fainter circle and a slightly translucent main orb', () => {
        expect(ORB_DIRECTION_BLOB.scale).toBeLessThan(1);
        expect(ORB_DIRECTION_BLOB.alpha).toBeGreaterThan(0);
        expect(ORB_DIRECTION_BLOB.alpha).toBeLessThan(ORB_SPRITE_ALPHA);
        expect(ORB_SPRITE_ALPHA).toBeLessThan(1);
        expect(ORB_DIRECTION_BLOB.edgeFraction).toBeGreaterThan(0.5);
        expect(ORB_DIRECTION_BLOB.edgeFraction).toBeLessThanOrEqual(1);
    });

    it('is applied to the Displacer bolt (cast, clone echo and ring all share this config)', () => {
        expect(DISPLACER_BOLT_SPRITE_CONFIG.spriteAlpha).toBe(DIRECTIONAL_ORB_LOOK.spriteAlpha);
        expect(DISPLACER_BOLT_SPRITE_CONFIG.directionBlob).toEqual(ORB_DIRECTION_BLOB);
    });
});

describe('stepTrailBlob', () => {
    it('lags behind a moving target and converges once it stops', () => {
        const blob = { x: 0, y: 0 };
        // Target moves 90 px/s for one second in 60 steps; the blob trails it.
        let target = 0;
        for (let i = 0; i < 60; i++) {
            target += 90 / 60;
            stepTrailBlob(blob, target, 0, 1 / 60, ORB_DIRECTION_BLOB.followRate);
        }
        expect(blob.x).toBeGreaterThan(0);
        expect(blob.x).toBeLessThan(target);
        expect(target - blob.x).toBeGreaterThan(3);
        for (let i = 0; i < 120; i++) stepTrailBlob(blob, target, 0, 1 / 60, ORB_DIRECTION_BLOB.followRate);
        expect(blob.x).toBeCloseTo(target, 1);
    });

    it('is frame-rate independent and ignores negative dt', () => {
        const a = { x: 0, y: 0 };
        const b = { x: 0, y: 0 };
        stepTrailBlob(a, 10, 0, 0.1, 9);
        for (let i = 0; i < 10; i++) stepTrailBlob(b, 10, 0, 0.01, 9);
        expect(a.x).toBeCloseTo(b.x, 6);
        stepTrailBlob(a, 99, 99, -1, 9);
        expect(a.x).toBeCloseTo(b.x, 6);
    });
});
