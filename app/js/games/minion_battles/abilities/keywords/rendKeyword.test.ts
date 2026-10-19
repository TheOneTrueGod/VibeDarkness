import { describe, expect, it } from 'vitest';
import { formatKeywordLine, keywordGlossaryLines } from './keywordRegistry';

describe('rend keyword', () => {
    it('formats as a keyword line', () => {
        expect(formatKeywordLine({ keyword: 'rend', n: 2 })).toBe('{Rend 2}');
    });

    it('adds one glossary line per Rend value shown in a tooltip', () => {
        expect(keywordGlossaryLines(['Rend 2', '5', 'Rend 2', 'knockback 1'])).toEqual([
            '{Rend 2}: Deals {2} damage to nearby bleeding enemies.',
        ]);
    });

    it('has no glossary line when no described keyword is shown', () => {
        expect(keywordGlossaryLines(['Bright 3', '10'])).toEqual([]);
    });
});
