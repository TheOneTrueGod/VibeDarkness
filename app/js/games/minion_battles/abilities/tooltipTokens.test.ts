import { describe, expect, it } from 'vitest';
import {
    encodeTooltipSegmentsToLegacyLines,
    formatTooltipLegacyLines,
    formatTooltipLines,
    formatTooltipNumber,
    parseTooltipTemplate,
    resolveDamageToken,
    resolveTooltipLine,
    type TooltipResolveContext,
    type TooltipTokenBindings,
} from './tooltipTokens';
import { TRAINING_MIGHTY_ALL_DAMAGE_MULT, TRAINING_MIGHTY_LEVELS } from '../../../researchTrees/trees/training';

const EMPTY_CTX: TooltipResolveContext = {};

/** Mighty ×2 levels → mult 1.4 (same as damageModifiers.test). */
const MIGHTY_TWO_LEVEL_MULT =
    1 + ((TRAINING_MIGHTY_ALL_DAMAGE_MULT - 1) * 2) / TRAINING_MIGHTY_LEVELS;

describe('formatTooltipNumber', () => {
    it('abs ≥ 10 rounds to integer (14.4 → "14")', () => {
        expect(formatTooltipNumber(14.4)).toBe('14');
        expect(formatTooltipNumber(10)).toBe('10');
        expect(formatTooltipNumber(-14.4)).toBe('-14');
    });

    it('abs < 10 rounds to nearest 0.1 (9.44 → "9.4")', () => {
        expect(formatTooltipNumber(9.44)).toBe('9.4');
        expect(formatTooltipNumber(3)).toBe('3');
        expect(formatTooltipNumber(9.96)).toBe('10');
        expect(formatTooltipNumber(-3.14)).toBe('-3.1');
    });
});

describe('parseTooltipTemplate', () => {
    it('static-only line yields one text part', () => {
        expect(parseTooltipTemplate('No tokens here.')).toEqual([
            { type: 'text', value: 'No tokens here.' },
        ]);
    });

    it('single {{DAMAGE}} token', () => {
        expect(parseTooltipTemplate('Deals {{DAMAGE}} damage.')).toEqual([
            { type: 'text', value: 'Deals ' },
            { type: 'token', name: 'DAMAGE' },
            { type: 'text', value: ' damage.' },
        ]);
    });

    it('multiple tokens', () => {
        expect(parseTooltipTemplate('{{A}} and {{B_2}}')).toEqual([
            { type: 'token', name: 'A' },
            { type: 'text', value: ' and ' },
            { type: 'token', name: 'B_2' },
        ]);
    });

    it('leftover {{ without close is treated as static text (does not crash)', () => {
        expect(parseTooltipTemplate('Broken {{FOO and more')).toEqual([
            { type: 'text', value: 'Broken {{FOO and more' },
        ]);
        expect(parseTooltipTemplate('Ends with {{')).toEqual([
            { type: 'text', value: 'Ends with {{' },
        ]);
    });
});

describe('resolveTooltipLine / formatTooltipLines', () => {
    const bindings: TooltipTokenBindings = {
        DAMAGE: { kind: 'damage', base: 10 },
        MAX_TARGETS: { kind: 'plain', value: 3 },
        KNOCKBACK: { kind: 'knockback', tier: 2 },
        LABEL: { kind: 'plain', value: 'burst' },
    };

    it('static-only line → one static segment', () => {
        expect(resolveTooltipLine('Just text.', {}, EMPTY_CTX)).toEqual([
            { text: 'Just text.', role: 'static' },
        ]);
    });

    it('single {{DAMAGE}} uses resolveDamageToken (base + formatTooltipNumber when no ctx)', () => {
        const segs = resolveTooltipLine('Hit {{DAMAGE}}.', { DAMAGE: { kind: 'damage', base: 10 } }, EMPTY_CTX);
        expect(segs).toEqual([
            { text: 'Hit ', role: 'static' },
            { text: '10', role: 'dynamic' },
            { text: '.', role: 'static' },
        ]);
        expect(resolveDamageToken(9.44, EMPTY_CTX)).toBe('9.4');
    });

    it('{{DAMAGE}} with Mighty-style damageModifier shows combat-matched display value', () => {
        const segs = resolveTooltipLine(
            'Hit {{DAMAGE}}.',
            { DAMAGE: { kind: 'damage', base: 10 } },
            { damageModifier: { flatAmt: 0, multiplier: MIGHTY_TWO_LEVEL_MULT } },
        );
        expect(segs).toEqual([
            { text: 'Hit ', role: 'static' },
            { text: '14', role: 'dynamic' },
            { text: '.', role: 'static' },
        ]);
    });

    it('plain and knockback kinds format numbers via formatTooltipNumber', () => {
        const segs = resolveTooltipLine(
            'Up to {{MAX_TARGETS}}. {{KNOCKBACK}}. {{LABEL}}.',
            bindings,
            EMPTY_CTX,
        );
        expect(segs).toEqual([
            { text: 'Up to ', role: 'static' },
            { text: '3', role: 'dynamic' },
            { text: '. ', role: 'static' },
            { text: 'knockback 2', role: 'dynamic' },
            { text: '. ', role: 'static' },
            { text: 'burst', role: 'dynamic' },
            { text: '.', role: 'static' },
        ]);
    });

    it('unknown {{TOKEN}} with no binding throws (fail loudly in tests / dev)', () => {
        expect(() => resolveTooltipLine('{{MISSING}}', {}, EMPTY_CTX)).toThrow(
            /Unknown tooltip token: \{\{MISSING\}\}/,
        );
    });

    it('formatTooltipLines returns one segment array per line', () => {
        const rows = formatTooltipLines(
            ['Deals {{DAMAGE}}.', '{{KNOCKBACK}}'],
            bindings,
            EMPTY_CTX,
        );
        expect(rows).toHaveLength(2);
        expect(rows[0]).toEqual([
            { text: 'Deals ', role: 'static' },
            { text: '10', role: 'dynamic' },
            { text: '.', role: 'static' },
        ]);
        expect(rows[1]).toEqual([{ text: 'knockback 2', role: 'dynamic' }]);
    });

    it('encodeTooltipSegmentsToLegacyLines wraps dynamic segments in {…}', () => {
        const encoded = encodeTooltipSegmentsToLegacyLines([
            [
                { text: 'Deals ', role: 'static' },
                { text: '14', role: 'dynamic' },
                { text: ' damage', role: 'static' },
            ],
        ]);
        expect(encoded).toEqual(['Deals {14} damage']);
    });

    it('formatTooltipLegacyLines resolves Mighty damage then encodes', () => {
        const lines = formatTooltipLegacyLines(
            ['Deals {{DAMAGE}} damage'],
            { DAMAGE: { kind: 'damage', base: 10 } },
            { damageModifier: { flatAmt: 0, multiplier: MIGHTY_TWO_LEVEL_MULT } },
        );
        expect(lines).toEqual(['Deals {14} damage']);
    });
});
