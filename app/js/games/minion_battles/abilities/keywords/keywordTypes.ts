import type { Unit } from '../../game/units/Unit';
import type { AbilityEngineContext } from '../AbilityEngineContext';

export type KeywordId = 'bright' | 'knockback' | 'devourLight' | 'rend';

/** Cast-time context for keyword resolution (subset of the CastBehaviour context). */
export interface KeywordContext {
    engine: AbilityEngineContext;
    caster: Unit;
    /** Casting ability id (present when the context is a CastBehaviour tick context); used to stamp deployable ownership. */
    abilityId?: string;
    /**
     * Where an area keyword (e.g. Rend) resolves; defaults to the caster's position. Abilities set it
     * to the point they act on (e.g. the targeted ally).
     */
    center?: { x: number; y: number };
}

export interface KeywordResult {
    triggered: boolean;
    /** Units the keyword affected, when it has a notion of "hits" (e.g. Rend). Drives per-hit follow-ups. */
    count?: number;
}

/** Cast-time keyword trigger. */
export type KeywordResolve = (ctx: KeywordContext, n: number) => KeywordResult;

export interface KeywordDef {
    readonly id: KeywordId;
    readonly displayName: string;
    /** Returns the tooltip keyword text, e.g. `Bright 3` (no braces). */
    formatTooltip(n: number): string;
    /**
     * Optional reminder text for tooltips (legacy-encoded, e.g. `Deals {2} damage to ...`).
     * Tooltips that show this keyword add a reminder card for it (`keywordGlossaryEntries`).
     */
    describe?(n: number): string;
    /** Optional cast-time trigger. Keywords without one are tooltip-only. */
    resolve?: KeywordResolve;
}

/** An ability's use of a keyword, with an optional effect run only when the keyword triggers. */
export interface AbilityKeywordUse {
    keyword: KeywordId;
    n: number;
    effect?: (ctx: KeywordContext, result: KeywordResult) => void;
    /** Tooltip text after the keyword, legacy-encoded (e.g. `gain {1} additional light`). */
    effectText?: string;
}
