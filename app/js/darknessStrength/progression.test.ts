import { describe, expect, it } from 'vitest';
import { DS_ENEMY_FIERCE_ID, DS_ENEMY_HARDENED_ID } from './packages/starters';
import {
    BATTLES_REMAINING_DATA_KEY,
    applyMissionEndDarknessStrengthProgression,
    decrementBattlesRemainingOnVictory,
    mergeDarknessStrengthPromotions,
} from './progression';
import type { DarknessStrengthInstance } from './types';

describe('decrementBattlesRemainingOnVictory', () => {
    it('decrements numeric battlesRemaining by 1', () => {
        const instances: DarknessStrengthInstance[] = [
            { packageId: DS_ENEMY_HARDENED_ID, data: { [BATTLES_REMAINING_DATA_KEY]: 3 } },
            { packageId: DS_ENEMY_FIERCE_ID },
        ];
        const next = decrementBattlesRemainingOnVictory(instances);
        expect(next).toEqual([
            { packageId: DS_ENEMY_HARDENED_ID, data: { [BATTLES_REMAINING_DATA_KEY]: 2 } },
            { packageId: DS_ENEMY_FIERCE_ID },
        ]);
    });

    it('removes the instance when battlesRemaining hits 0', () => {
        const next = decrementBattlesRemainingOnVictory([
            { packageId: DS_ENEMY_HARDENED_ID, data: { [BATTLES_REMAINING_DATA_KEY]: 1 } },
            { packageId: DS_ENEMY_FIERCE_ID, data: { [BATTLES_REMAINING_DATA_KEY]: 2 } },
        ]);
        expect(next).toEqual([
            { packageId: DS_ENEMY_FIERCE_ID, data: { [BATTLES_REMAINING_DATA_KEY]: 1 } },
        ]);
    });

    it('removes when decrement would go negative (already 0)', () => {
        const next = decrementBattlesRemainingOnVictory([
            { packageId: DS_ENEMY_HARDENED_ID, data: { [BATTLES_REMAINING_DATA_KEY]: 0 } },
        ]);
        expect(next).toEqual([]);
    });

    it('leaves instances without a numeric battlesRemaining unchanged', () => {
        const instances: DarknessStrengthInstance[] = [
            { packageId: DS_ENEMY_HARDENED_ID, data: { killCount: 4 } },
            { packageId: DS_ENEMY_FIERCE_ID, data: { [BATTLES_REMAINING_DATA_KEY]: '3' } },
        ];
        expect(decrementBattlesRemainingOnVictory(instances)).toEqual([
            { packageId: DS_ENEMY_HARDENED_ID, data: { killCount: 4 } },
            { packageId: DS_ENEMY_FIERCE_ID, data: { [BATTLES_REMAINING_DATA_KEY]: '3' } },
        ]);
    });
});

describe('mergeDarknessStrengthPromotions', () => {
    it('adds numeric counters and overwrites non-numeric keys on matching instances', () => {
        const next = mergeDarknessStrengthPromotions(
            [
                {
                    packageId: DS_ENEMY_HARDENED_ID,
                    data: { killCount: 10, note: 'old' },
                },
                { packageId: DS_ENEMY_FIERCE_ID },
            ],
            [
                {
                    packageId: DS_ENEMY_HARDENED_ID,
                    dataDelta: { killCount: 3, note: 'new', flag: true },
                },
            ],
        );
        expect(next).toEqual([
            {
                packageId: DS_ENEMY_HARDENED_ID,
                data: { killCount: 13, note: 'new', flag: true },
            },
            { packageId: DS_ENEMY_FIERCE_ID },
        ]);
    });

    it('skips promotions for packageIds not already on the campaign', () => {
        const next = mergeDarknessStrengthPromotions(
            [{ packageId: DS_ENEMY_HARDENED_ID, data: { killCount: 1 } }],
            [{ packageId: 'unknown_pack', dataDelta: { killCount: 99 } }],
        );
        expect(next).toEqual([{ packageId: DS_ENEMY_HARDENED_ID, data: { killCount: 1 } }]);
    });

    it('folds multiple promotions for the same packageId before apply', () => {
        const next = mergeDarknessStrengthPromotions(
            [{ packageId: DS_ENEMY_HARDENED_ID, data: { killCount: 1 } }],
            [
                { packageId: DS_ENEMY_HARDENED_ID, dataDelta: { killCount: 2 } },
                { packageId: DS_ENEMY_HARDENED_ID, dataDelta: { killCount: 5 } },
            ],
        );
        expect(next[0].data).toEqual({ killCount: 8 });
    });
});

describe('applyMissionEndDarknessStrengthProgression', () => {
    it('on victory: decrements then merges promotions', () => {
        const next = applyMissionEndDarknessStrengthProgression(
            [
                {
                    packageId: DS_ENEMY_HARDENED_ID,
                    data: { [BATTLES_REMAINING_DATA_KEY]: 2, killCount: 1 },
                },
            ],
            {
                outcome: 'victory',
                promotions: [
                    { packageId: DS_ENEMY_HARDENED_ID, dataDelta: { killCount: 4 } },
                ],
            },
        );
        expect(next).toEqual([
            {
                packageId: DS_ENEMY_HARDENED_ID,
                data: { [BATTLES_REMAINING_DATA_KEY]: 1, killCount: 5 },
            },
        ]);
    });

    it('on defeat: merges promotions without decrementing battlesRemaining', () => {
        const next = applyMissionEndDarknessStrengthProgression(
            [
                {
                    packageId: DS_ENEMY_HARDENED_ID,
                    data: { [BATTLES_REMAINING_DATA_KEY]: 2, killCount: 1 },
                },
            ],
            {
                outcome: 'defeat',
                promotions: [
                    { packageId: DS_ENEMY_HARDENED_ID, dataDelta: { killCount: 4 } },
                ],
            },
        );
        expect(next).toEqual([
            {
                packageId: DS_ENEMY_HARDENED_ID,
                data: { [BATTLES_REMAINING_DATA_KEY]: 2, killCount: 5 },
            },
        ]);
    });

    it('on victory: removes expired instance before promotion merge can revive it', () => {
        const next = applyMissionEndDarknessStrengthProgression(
            [{ packageId: DS_ENEMY_HARDENED_ID, data: { [BATTLES_REMAINING_DATA_KEY]: 1 } }],
            {
                outcome: 'victory',
                promotions: [
                    { packageId: DS_ENEMY_HARDENED_ID, dataDelta: { killCount: 9 } },
                ],
            },
        );
        expect(next).toEqual([]);
    });
});
