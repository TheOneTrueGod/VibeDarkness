import { describe, expect, it } from 'vitest';
import { DarknessLevel } from '../../darknessLevels';
import {
    ENEMY_DARK_MIN_ALPHA,
    GLIMPSED_ENEMY_ALPHA,
    VISIBLE_DARK_TILE_MAX_ALPHA,
    darknessOverlayTileAlpha,
    enemyDarknessAlpha,
    enemyUnitAlpha,
    isEffectConcealed,
} from './visibilityRenderRules';

describe('enemyDarknessAlpha', () => {
    it('is 1 when lit and ENEMY_DARK_MIN_ALPHA in full darkness', () => {
        expect(enemyDarknessAlpha(DarknessLevel.MEDIUM_LIGHT_MIN)).toBe(1);
        expect(enemyDarknessAlpha(15)).toBe(1);
        expect(enemyDarknessAlpha(DarknessLevel.FULL_DARKNESS)).toBeCloseTo(ENEMY_DARK_MIN_ALPHA);
        expect(enemyDarknessAlpha(-3)).toBeCloseTo(ENEMY_DARK_MIN_ALPHA);
    });

    it('follows the darkness vision cost curve between', () => {
        const mid = (DarknessLevel.FULL_DARKNESS + DarknessLevel.MEDIUM_LIGHT_MIN) / 2;
        expect(enemyDarknessAlpha(mid)).toBeCloseTo((1 + ENEMY_DARK_MIN_ALPHA) / 2);
        expect(enemyDarknessAlpha(1)).toBeLessThan(enemyDarknessAlpha(3));
    });

    it('treats missing light data as lit', () => {
        expect(enemyDarknessAlpha(null)).toBe(1);
    });
});

describe('enemyUnitAlpha', () => {
    it('fades seen enemies with darkness', () => {
        expect(enemyUnitAlpha('seen', 10)).toBe(1);
        expect(enemyUnitAlpha('seen', DarknessLevel.FULL_DARKNESS)).toBeCloseTo(ENEMY_DARK_MIN_ALPHA);
    });

    it('draws glimpsed enemies at GLIMPSED_ENEMY_ALPHA regardless of light', () => {
        expect(enemyUnitAlpha('glimpsed', 10)).toBe(GLIMPSED_ENEMY_ALPHA);
        expect(enemyUnitAlpha('glimpsed', null)).toBe(GLIMPSED_ENEMY_ALPHA);
    });

    it('is 0 for invisible tiers', () => {
        expect(enemyUnitAlpha('heard', 10)).toBe(0);
        expect(enemyUnitAlpha('felt', 10)).toBe(0);
        expect(enemyUnitAlpha('hidden', 10)).toBe(0);
    });
});

describe('darknessOverlayTileAlpha', () => {
    it('caps dark tiles inside vision and leaves other tiles alone', () => {
        expect(darknessOverlayTileAlpha(1, true)).toBe(VISIBLE_DARK_TILE_MAX_ALPHA);
        expect(darknessOverlayTileAlpha(1, false)).toBe(1);
        expect(darknessOverlayTileAlpha(0.3, true)).toBe(0.3);
        expect(darknessOverlayTileAlpha(0, true)).toBe(0);
    });
});

describe('isEffectConcealed', () => {
    const hiddenOwner = (id: string): boolean => id !== 'hidden';

    it('conceals an opted-in effect whose owner is invisible', () => {
        expect(isEffectConcealed({ concealedWithOwner: true, ownerActorId: 'hidden' }, hiddenOwner)).toBe(true);
        expect(isEffectConcealed({ concealedWithOwner: true, ownerActorId: 'seen' }, hiddenOwner)).toBe(false);
    });

    it('never conceals effects that do not opt in, have no owner, or have no visibility callback', () => {
        expect(isEffectConcealed({ ownerActorId: 'hidden' }, hiddenOwner)).toBe(false);
        expect(isEffectConcealed({ concealedWithOwner: true }, hiddenOwner)).toBe(false);
        expect(isEffectConcealed({ concealedWithOwner: true, ownerActorId: 'hidden' }, undefined)).toBe(false);
    });
});
