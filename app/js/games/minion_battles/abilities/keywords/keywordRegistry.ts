import { formatTooltipNumber } from '../tooltipTokens';
import { BLEED_STACKS_PER_DAMAGE } from '../../buffs/BleedBuff';
import { BLEED_TICKS_PER_ROUND } from '../../game/dotTick';
import { BRIGHT_DEFS, BRIGHT_ROUND_END_DECAY, spawnBrightLight, type EngineWithLight } from '../brightKeyword';
import { devourLightKeyword } from './devourLightKeyword';
import { rendKeyword } from './rendKeyword';
import type { AbilityKeywordUse, KeywordDef, KeywordId, KeywordResolve } from './keywordTypes';

const registry = new Map<KeywordId, KeywordDef>();

export function registerKeyword(def: KeywordDef): void {
    registry.set(def.id, def);
}

/**
 * Attach a cast-time `resolve` to an already-registered keyword. Lets a keyword whose def must stay
 * import-light (loaded by tooltip UI) get its runtime behaviour from a separate runtime module
 * (e.g. `rendRuntime.ts`) without the def importing it.
 */
export function registerKeywordResolver(id: KeywordId, resolve: KeywordResolve): void {
    const def = registry.get(id);
    if (!def) throw new Error(`Unknown keyword: ${id}`);
    registry.set(id, { ...def, resolve });
}

export function getKeyword(id: KeywordId): KeywordDef | undefined {
    return registry.get(id);
}

/** Tooltip text for a keyword use, without braces (e.g. `Bright 3`). Throws for unknown ids. */
export function formatKeywordText(id: KeywordId, n: number): string {
    const def = registry.get(id);
    if (!def) throw new Error(`Unknown keyword: ${id}`);
    return def.formatTooltip(n);
}

/** Reminder card for a described keyword shown in a tooltip. */
export interface KeywordGlossaryEntry {
    /** Keyword text as shown, e.g. `Rend 2`. */
    title: string;
    /** Legacy-encoded reminder text, e.g. `Deals {2} damage to nearby bleeding enemies.` */
    description: string;
}

/**
 * Unnumbered glossary term (a status or mechanic, e.g. Bleed) shown as a reminder card when a
 * tooltip highlights one of its `matches` (case-insensitive, e.g. `{Bleed}` or `{bleeding}`).
 */
export interface GlossaryTermDef {
    title: string;
    matches: readonly string[];
    /** Legacy-encoded reminder text. */
    description: string;
}

const glossaryTerms: GlossaryTermDef[] = [];

export function registerGlossaryTerm(def: GlossaryTermDef): void {
    glossaryTerms.push(def);
}

/**
 * Reminder entries for described keywords and glossary terms that appear in a tooltip.
 * `keywordTexts` are the tooltip's dynamic segment texts (e.g. `Rend 2`, `Bleed`); each one found
 * yields one entry, in first-seen order without duplicates.
 */
export function keywordGlossaryEntries(keywordTexts: readonly string[]): KeywordGlossaryEntry[] {
    const entries: KeywordGlossaryEntry[] = [];
    const seen = new Set<string>();
    for (const text of keywordTexts) {
        const lower = text.trim().toLowerCase();
        for (const term of glossaryTerms) {
            if (seen.has(term.title) || !term.matches.some((m) => m.toLowerCase() === lower)) continue;
            seen.add(term.title);
            entries.push({ title: term.title, description: term.description });
        }
        for (const def of registry.values()) {
            if (!def.describe) continue;
            const prefix = `${def.displayName} `;
            if (!text.startsWith(prefix)) continue;
            const n = Number(text.slice(prefix.length));
            if (!Number.isFinite(n) || seen.has(text)) continue;
            seen.add(text);
            entries.push({ title: text, description: def.describe(n) });
        }
    }
    return entries;
}

/** Legacy-encoded tooltip line for a keyword use (e.g. `{Bright 3}`). */
export function formatKeywordLine(use: Pick<AbilityKeywordUse, 'keyword' | 'n'>): string {
    return `{${formatKeywordText(use.keyword, use.n)}}`;
}

registerKeyword({
    id: 'bright',
    displayName: 'Bright',
    formatTooltip: (n) => `Bright ${n}`,
    describe: (n) => {
        const def = BRIGHT_DEFS[n];
        const brightness = def ? def.lightAmount : n + 1;
        return `Creates a light of brightness {${brightness}} here. It loses {${BRIGHT_ROUND_END_DECAY}} brightness at the end of each round.`;
    },
    resolve: (ctx, n) => {
        spawnBrightLight(ctx.engine as EngineWithLight, ctx.caster.x, ctx.caster.y, n, undefined, {
            unitId: ctx.caster.id,
            abilityId: ctx.abilityId,
            teamId: ctx.caster.teamId,
        });
        return { triggered: true };
    },
});

registerKeyword({
    id: 'knockback',
    displayName: 'knockback',
    formatTooltip: (n) => `knockback ${formatTooltipNumber(n)}`,
});

registerKeyword(devourLightKeyword);
registerKeyword(rendKeyword);

registerGlossaryTerm({
    title: 'Bleed',
    matches: ['bleed', 'bleeding'],
    description: `Deals {1} damage per {${BLEED_STACKS_PER_DAMAGE}} stacks every {1/${BLEED_TICKS_PER_ROUND}} round.`,
});
