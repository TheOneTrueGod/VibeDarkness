import { describe, it, expect } from 'vitest';
import { formatKeywordLine, formatKeywordText, getKeyword, registerKeyword } from './keywordRegistry';
import { resolveTooltipLine } from '../tooltipTokens';

describe('keywordRegistry', () => {
    it('registers bright and knockback', () => {
        expect(getKeyword('bright')?.displayName).toBe('Bright');
        expect(getKeyword('knockback')?.displayName).toBe('knockback');
    });

    it('formats current tooltip strings', () => {
        expect(formatKeywordText('bright', 3)).toBe('Bright 3');
        expect(formatKeywordText('knockback', 1)).toBe('knockback 1');
        expect(formatKeywordLine({ keyword: 'bright', n: 3 })).toBe('{Bright 3}');
    });

    it('throws for unregistered keyword', () => {
        expect(() => formatKeywordText('nope' as never, 1)).toThrow();
    });

    it('registers devourLight', () => {
        expect(formatKeywordText('devourLight', 1)).toBe('Devour Light 1');
    });

    it('registerKeyword adds a def', () => {
        registerKeyword({ id: 'devourLight', displayName: 'Devour Light', formatTooltip: (n) => `Devour Light ${n}` });
        expect(formatKeywordText('devourLight', 2)).toBe('Devour Light 2');
    });

    it('knockback token binding delegates to registry output', () => {
        const segs = resolveTooltipLine('{{K}}', { K: { kind: 'knockback', tier: 1 } }, {});
        expect(segs).toEqual([{ text: 'knockback 1', role: 'dynamic' }]);
    });
    it('bright stamps the casting unit, ability and team onto the light it spawns', () => {
        const added: Array<{ ownerUnitId?: string; ownerAbilityId?: string; teamId?: string }> = [];
        const engine = { roundNumber: 1, addLightSource: (ls: (typeof added)[number]) => added.push(ls) };
        const caster = { id: 'u1', x: 10, y: 20, teamId: 'player' };
        getKeyword('bright')!.resolve!({ engine, caster, abilityId: '0000' } as never, 3);
        expect(added).toHaveLength(1);
        expect(added[0]).toMatchObject({ ownerUnitId: 'u1', ownerAbilityId: '0000', teamId: 'player' });
    });
});
