import { isBleeding } from '../../buffs/bleedRuntime';
import type { Unit } from '../../game/units/Unit';
import { damageEnemiesInCircle } from '../targetHelpers';
import { registerKeywordResolver } from './keywordRegistry';
import type { AbilityKeywordUse, KeywordContext } from './keywordTypes';
import { REND_RADIUS } from './rendKeyword';

/**
 * Rend N around `center`: N damage to every bleeding enemy of `caster` within `REND_RADIUS`.
 * Returns the units it damaged.
 */
export function applyRend(
    engine: Parameters<typeof damageEnemiesInCircle>[0]['engine'],
    caster: Unit,
    center: { x: number; y: number },
    n: number,
    abilityId: string,
): Unit[] {
    return damageEnemiesInCircle({
        engine,
        caster,
        center,
        radius: REND_RADIUS,
        damage: n,
        abilityId,
        attackType: 'ranged',
        filter: isBleeding,
    });
}

// Rend's def stays runtime-import-free (see rendKeyword.ts); its resolver is attached here. Importing
// this module (e.g. via an ability that uses Rend) is what enables `runAbilityKeywords` for `rend`.
registerKeywordResolver('rend', (ctx, n) => {
    const hits = applyRend(
        ctx.engine as Parameters<typeof applyRend>[0],
        ctx.caster,
        ctx.center ?? { x: ctx.caster.x, y: ctx.caster.y },
        n,
        ctx.abilityId ?? '',
    ).length;
    return { triggered: hits > 0, count: hits };
});

/**
 * Keyword-use `effect` for "do X per enemy a Rend hit": calls `apply(amount * hits, ctx)` once with the
 * total. E.g. `{ keyword: 'rend', n: 4, effectText: '+{4} shield per enemy hit', effect: perRendHit(4, (total) => ...) }`.
 */
export function perRendHit(
    amount: number,
    apply: (total: number, ctx: KeywordContext) => void,
): NonNullable<AbilityKeywordUse['effect']> {
    return (ctx, result) => apply(amount * (result.count ?? 0), ctx);
}
