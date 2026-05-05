/**
 * Crowd control tier and stable IDs for resist maps and registry entries.
 */

export type CcTier = 'hard' | 'soft';

/** Implemented gameplay IDs; extend as slow/curse/disarm land in sim. */
export type CcType =
    | 'STUN'
    | 'KNOCKDOWN'
    | 'CRIPPLE'
    | 'DISARM'
    | 'SLOW'
    | 'CURSE';

/** Keys for per-type CC resist maps (specific overrides ALL). */
export type CcResistKey = CcType | 'ALL';
