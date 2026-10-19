import { describe, expect, it } from 'vitest';
import { formatKeywordLine, keywordGlossaryEntries } from './keywordRegistry';

describe('rend keyword', () => {
    it('formats as a keyword line', () => {
        expect(formatKeywordLine({ keyword: 'rend', n: 2 })).toBe('{Rend 2}');
    });

    it('adds one glossary entry per Rend value shown in a tooltip', () => {
        expect(keywordGlossaryEntries(['Rend 2', '5', 'Rend 2', 'knockback 1'])).toEqual([
            { title: 'Rend 2', description: 'Deals {2} damage to nearby bleeding enemies.' },
        ]);
    });

    it('has no glossary entry when no described keyword is shown', () => {
        expect(keywordGlossaryEntries(['Bright 3', '10'])).toEqual([]);
    });
});
