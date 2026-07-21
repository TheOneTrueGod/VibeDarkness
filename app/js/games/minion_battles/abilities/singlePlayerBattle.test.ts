import { describe, it, expect } from 'vitest';
import { isSinglePlayerBattle } from './singlePlayerBattle';

describe('isSinglePlayerBattle', () => {
    it('is true when enemyScalingPlayerCount is 1', () => {
        expect(isSinglePlayerBattle({ enemyScalingPlayerCount: 1 })).toBe(true);
    });

    it('is false when enemyScalingPlayerCount is greater than 1', () => {
        expect(isSinglePlayerBattle({ enemyScalingPlayerCount: 2 })).toBe(false);
        expect(isSinglePlayerBattle({ enemyScalingPlayerCount: 3 })).toBe(false);
    });

    it('defaults missing count to solo (1)', () => {
        expect(isSinglePlayerBattle({})).toBe(true);
        expect(isSinglePlayerBattle(undefined)).toBe(true);
        expect(isSinglePlayerBattle(null)).toBe(true);
    });
});
