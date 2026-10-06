import { describe, it, expect } from 'vitest';
import { registerKeyword } from './keywordRegistry';
import { formatKeywordUseTooltip, runAbilityKeywords } from './runAbilityKeywords';
import type { KeywordContext } from './keywordTypes';

const ctx = { engine: {}, caster: {} } as unknown as KeywordContext;

describe('runAbilityKeywords', () => {
    it('runs effect only when triggered, in order', () => {
        const log: string[] = [];
        registerKeyword({
            id: 'devourLight',
            displayName: 'Stub',
            formatTooltip: (n) => `Stub ${n}`,
            resolve: (_c, n) => {
                log.push(`resolve ${n}`);
                return { triggered: n === 1 };
            },
        });
        const results = runAbilityKeywords(ctx, [
            { keyword: 'devourLight', n: 2, effect: () => log.push('effect 2') },
            { keyword: 'devourLight', n: 1, effect: () => log.push('effect 1') },
        ]);
        expect(results.map((r) => r.triggered)).toEqual([false, true]);
        expect(log).toEqual(['resolve 2', 'resolve 1', 'effect 1']);
    });

    it('handles undefined uses and tooltip-only keywords', () => {
        expect(runAbilityKeywords(ctx, undefined)).toEqual([]);
        let ran = false;
        const r = runAbilityKeywords(ctx, [{ keyword: 'knockback', n: 1, effect: () => (ran = true) }]);
        expect(r[0].triggered).toBe(false);
        expect(ran).toBe(false);
    });

    it('formats tooltip with and without effect text', () => {
        expect(formatKeywordUseTooltip({ keyword: 'bright', n: 3 })).toBe('{Bright 3}');
        expect(formatKeywordUseTooltip({ keyword: 'bright', n: 3, effectText: 'gain {1} light' })).toBe(
            '{Bright 3}: gain {1} light',
        );
    });
});
