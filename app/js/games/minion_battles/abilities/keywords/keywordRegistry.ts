import { formatTooltipNumber } from '../tooltipTokens';
import { spawnBrightLight, type EngineWithLight } from '../brightKeyword';
import { devourLightKeyword } from './devourLightKeyword';
import type { AbilityKeywordUse, KeywordDef, KeywordId } from './keywordTypes';

const registry = new Map<KeywordId, KeywordDef>();

export function registerKeyword(def: KeywordDef): void {
    registry.set(def.id, def);
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

/** Legacy-encoded tooltip line for a keyword use (e.g. `{Bright 3}`). */
export function formatKeywordLine(use: Pick<AbilityKeywordUse, 'keyword' | 'n'>): string {
    return `{${formatKeywordText(use.keyword, use.n)}}`;
}

registerKeyword({
    id: 'bright',
    displayName: 'Bright',
    formatTooltip: (n) => `Bright ${n}`,
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
