import { formatKeywordLine, getKeyword } from './keywordRegistry';
import type { AbilityKeywordUse, KeywordContext, KeywordResult } from './keywordTypes';

/**
 * Resolves keyword uses in array order. Each keyword's `resolve` runs (keywords without one
 * count as not triggered); the use's `effect` runs only when the result is triggered.
 * `ctx` is the CastBehaviours tick context (needs only `engine` and `caster`).
 */
export function runAbilityKeywords(
    ctx: KeywordContext,
    uses: readonly AbilityKeywordUse[] | undefined,
): KeywordResult[] {
    const results: KeywordResult[] = [];
    if (!uses) return results;
    for (const use of uses) {
        const def = getKeyword(use.keyword);
        if (!def) throw new Error(`Unknown keyword: ${use.keyword}`);
        const result: KeywordResult = def.resolve ? def.resolve(ctx, use.n) : { triggered: false };
        results.push(result);
        if (result.triggered) use.effect?.(ctx, result);
    }
    return results;
}

/** Tooltip line for a keyword use: `{Name N}` or `{Name N}: <effectText>`. For `getTooltipText()`. */
export function formatKeywordUseTooltip(use: AbilityKeywordUse): string {
    const head = formatKeywordLine(use);
    return use.effectText ? `${head}: ${use.effectText}` : head;
}
