import { describe, it, expect } from 'vitest';
import { BLEED_STACKS_PER_DAMAGE } from '../../buffs/BleedBuff';
import { BLEED_TICKS_PER_ROUND } from '../../game/dotTick';
import { formatKeywordLine, formatKeywordText, getKeyword, keywordGlossaryEntries, registerKeyword } from './keywordRegistry';
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

    it('describes Bleed as one damage per ten stacks each eighth of a round', () => {
        expect(keywordGlossaryEntries(['Bleed'])).toEqual([{
            title: 'Bleed',
            description: `Deals {1} damage per {${BLEED_STACKS_PER_DAMAGE}} stacks every {1/${BLEED_TICKS_PER_ROUND}} round.`,
        }]);
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
